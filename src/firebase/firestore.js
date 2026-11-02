/**
 * Firestore helper functions
 *
 * Collections:
 *  users/{uid}               — { name, email, role: 'athlete'|'admin', programTypes?: string[], createdAt }
 *  programs/{programId}      — { name, athleteId, programType: 'correctives'|'throwing'|'lifting', totalWeeks, weeks: [...], startDate?, createdAt, active }
 *  dataLogs/{uid}/entries/{} — { date, type: 'velo'|'weight', value, notes, createdAt } — 'weight' is
 *                              body weight specifically (a lift's working weight lives on the exercise
 *                              itself, see exerciseWeights below); `exercise` is a retired field some
 *                              older entries may still carry
 *  assessments/{uid}         — { scores: {...}, programId, updatedAt } — current values
 *  assessments/{uid}/history/{YYYY-MM-DD} — one snapshot per assessment date
 *
 * Three neighbouring modules were split out of this one, each holding its own
 * collections and the reasoning that goes with them: chat.js (chats,
 * chatReads), facility.js (facilitySlots and the booking mirror) and
 * settings.js (settings/global, settings/public). Everything above is athlete
 * data and stays here.
 *
 * An athlete can have up to one *active* program per programType at a time —
 * correctives, throwing, and lifting run concurrently rather than one program
 * at a time. Programs missing `programType` predate this and are treated as
 * 'correctives' everywhere they're read.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, writeBatch, arrayUnion, arrayRemove, documentId,
} from 'firebase/firestore'
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage'
import { db } from './config'
// Deleting an athlete has to release their facility bookings, and that
// cleanup is already correct (and transactional) over in facility.js — see
// deleteAthleteCompletely.
import { cancelFacilityBooking } from './facility'

// ── Users ──────────────────────────────────────────────────────────────────
export const getUser = (uid) => getDoc(doc(db, 'users', uid))

export const createUser = (uid, data) =>
  setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() })

export const updateUser = (uid, data) =>
  updateDoc(doc(db, 'users', uid), data)

export const getAllAthletes = () =>
  getDocs(query(collection(db, 'users'), where('role', '==', 'athlete')))

// Deletes every piece of this athlete's data that lives in Firestore or
// Storage — not just the users/{uid} profile doc. Before this existed,
// "Delete Athlete" only removed that one doc and silently left assessments
// (injury history, screening results), chat history, workout completions,
// velo/weight logs, programs, and facility bookings all still in place,
// despite the confirmation dialog promising otherwise.
//
// Two things this deliberately CANNOT reach, and the caller should surface
// to the admin explicitly rather than imply are handled:
//  - The athlete's Firebase Auth login itself. Deleting another user's auth
//    account needs the Admin SDK (a Cloud Function), which this project
//    doesn't have (no Blaze plan yet). The athlete already can't get past
//    RequireAuth once their users/{uid} doc is gone — this just means their
//    credential technically still exists in Firebase's user pool until an
//    admin removes it by hand in the Firebase Console.
//  - Rows in the coach's Google Sheets (Assessment Intake, Outputs tabs).
//    That's a separate, best-effort network call — see
//    deleteAthleteFromSheets below — not part of this function, since a
//    Sheets failure shouldn't be able to leave Firestore half-deleted.
//
// Returns a summary of what was actually removed, so the caller can show an
// honest result instead of a blanket "deleted everything" toast.
export async function deleteAthleteCompletely(uid) {
  const summary = { subcollections: {}, programs: 0, facilityBookings: 0, storagePhoto: false, errors: [] }

  async function deleteSubcollection(...pathSegments) {
    const label = pathSegments.join('/')
    try {
      const snap = await getDocs(collection(db, ...pathSegments))
      if (snap.empty) { summary.subcollections[label] = 0; return }
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      summary.subcollections[label] = snap.size
    } catch (err) {
      summary.errors.push(`${label}: ${err.message}`)
    }
  }

  // Subcollections keyed by this athlete's uid.
  await deleteSubcollection('dataLogs', uid, 'entries')
  await deleteSubcollection('completions', uid, 'weeks')
  await deleteSubcollection('exerciseWeights', uid, 'entries')
  await deleteSubcollection('chats', uid, 'messages')

  // Facility bookings — cancelFacilityBooking already does the correct
  // transactional cleanup (decrement bookedCount, delete the booking, delete
  // the athlete-side mirror) for one slot; reuse it for every slot this
  // athlete has booked rather than duplicating that transaction here.
  try {
    const bookingsSnap = await getDocs(collection(db, 'facilityBookingsByAthlete', uid, 'slots'))
    const slotIds = bookingsSnap.docs.map(d => d.id)
    await Promise.all(slotIds.map(slotId => cancelFacilityBooking(slotId, uid)))
    summary.facilityBookings = slotIds.length
    // Cancellation receipts are this athlete's data too — including the ones
    // just written by the cancellations above.
    const receiptsSnap = await getDocs(collection(db, 'facilityCancellations', uid, 'slots'))
    await Promise.all(receiptsSnap.docs.map(d => deleteDoc(d.ref)))
  } catch (err) {
    summary.errors.push(`facility bookings: ${err.message}`)
  }

  // Top-level docs.
  try {
    // Subcollections are not removed with their parent — delete the
    // assessment history explicitly or it outlives the athlete.
    const historySnap = await getDocs(collection(db, 'assessments', uid, 'history'))
    await Promise.all(historySnap.docs.map(d => deleteDoc(d.ref)))
    summary.subcollections.assessmentHistory = historySnap.size

    const batch = writeBatch(db)
    batch.delete(doc(db, 'assessments', uid))
    batch.delete(doc(db, 'athletePrefs', uid))
    batch.delete(doc(db, 'chatReads', uid))
    batch.delete(doc(db, 'users', uid))
    await batch.commit()
  } catch (err) {
    summary.errors.push(`profile docs: ${err.message}`)
  }

  // Programs — a query, not a fixed path, since there's no way to know a
  // uid's program IDs up front.
  try {
    const programsSnap = await getDocs(query(collection(db, 'programs'), where('athleteId', '==', uid)))
    if (!programsSnap.empty) {
      const batch = writeBatch(db)
      programsSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    summary.programs = programsSnap.size
  } catch (err) {
    summary.errors.push(`programs: ${err.message}`)
  }

  // Profile photo — best-effort. Storage isn't activated in this project's
  // console yet (per project notes); confirmed by testing that an
  // unprovisioned bucket doesn't reject the SDK call with a clean error, it
  // just hangs forever. Race it against a timeout so a bucket that's still
  // off (or just slow) can never block the rest of this function — a
  // timeout here just means "couldn't confirm," not "failed."
  try {
    await Promise.race([
      deleteObject(storageRef(getStorage(), `profilePhotos/${uid}/avatar.jpg`)),
      new Promise((_, reject) => setTimeout(() => reject({ code: 'storage/timeout' }), 5000)),
    ])
    summary.storagePhoto = true
  } catch (err) {
    if (err?.code !== 'storage/object-not-found' && err?.code !== 'storage/timeout') summary.errors.push(`profile photo: ${err.message}`)
  }

  return summary
}

// Returns every active program for this athlete — up to one per programType
// (correctives/throwing/lifting), since all three can run concurrently.
export const getProgramForAthlete = (athleteId) =>
  getDocs(query(
    collection(db, 'programs'),
    where('athleteId', '==', athleteId),
    where('active', '==', true),
  ))

// Pass `active: false` to create a draft — tied to an athlete (athleteId) but
// not yet visible to them, since getProgramForAthlete only returns active ones.
// `archived` is written explicitly rather than left absent because Firestore
// cannot query for a field that isn't there: `where('archived','==',false)`
// silently skips every document missing it. Archived programs are the part of
// this collection that grows without bound — one more per athlete each time a
// block is superseded — so being able to exclude them in the query is what
// keeps the roster's read cost flat. See scripts/backfill-archived-flag.mjs
// for the docs created before this default existed.
export const createProgram = (data) =>
  addDoc(collection(db, 'programs'), {
    ...data,
    createdAt: serverTimestamp(),
    active: data.active ?? true,
    archived: data.archived ?? false,
  })

// Reads a program straight from Firestore. Needed where a stale copy would be
// wrong rather than merely old — publishing clones the program, and cloning
// the version a render closure captured silently hands the athlete the
// content from before the coach's last edit.
export const getProgram = (programId) =>
  getDoc(doc(db, 'programs', programId))

export const updateProgram = (programId, data) =>
  updateDoc(doc(db, 'programs', programId), data)

// Edit to a program the athlete can already see. Stamps lastEditedAt so their
// schedule can show a "your coach updated this" banner.
export const updateLiveProgram = (programId, data) =>
  updateDoc(doc(db, 'programs', programId), { ...data, lastEditedAt: serverTimestamp() })

export const getAllPrograms = () =>
  getDocs(query(collection(db, 'programs'), orderBy('createdAt', 'desc')))

// Every program document tied to this specific athlete — active, inactive,
// and drafts alike (unlike getProgramForAthlete, which is active-only). Used
// by the athlete detail page so it isn't fetching every other athlete's
// programs just to find this one's — see getGeneralPrograms for the other
// half of that page's picture.
export const getProgramsForAthlete = (athleteId) =>
  getDocs(query(collection(db, 'programs'), where('athleteId', '==', athleteId)))

// Every active, non-archived program belonging to any of these athletes —
// what a pool's schedule change would actually affect.
//
// One query per athlete rather than a single `athleteId in [...]` query paired
// with `active == true`: that combination needs a composite index, and a query
// against an index Firestore is still building comes back EMPTY rather than
// erroring. Here that failure mode would read as "no programs to re-place" and
// silently do nothing. A handful of single-field queries can't be wrong that
// way, and this runs when a coach changes a pool's days, not on a loop.
export const getActiveProgramsForAthletes = async (uids = []) => {
  const snaps = await Promise.all(uids.map(uid => getProgramsForAthlete(uid)))
  const out = []
  snaps.forEach(snap => snap.forEach(d => {
    const data = d.data()
    if (data.active && !data.archived) out.push({ id: d.id, ...data })
  }))
  return out
}

// Reusable template programs not yet tied to any athlete — the library on
// the Programs page and the assignable pool on each athlete's Program tab.
// No orderBy here on purpose: pairing an equality filter with orderBy on a
// different field needs a composite index, and this collection is small
// enough that sorting client-side after the fetch is simpler than managing one.
export const getGeneralPrograms = () =>
  getDocs(query(collection(db, 'programs'), where('athleteId', '==', null)))

/**
 * Programs that belong to an athlete — what the admin dashboard's roster is
 * built from.
 *
 * getAllPrograms reads the entire collection: every reusable template, and
 * every archived block every athlete has ever finished. The dashboard uses
 * none of those (it filters to `p.athleteId === athlete.id`, and a template
 * has no athleteId), so they were read and thrown away.
 *
 * No orderBy: an inequality filter forces the first sort onto that same
 * field, which would mean a composite index for an ordering the dashboard
 * doesn't use — it groups by athlete itself.
 *
 * Documents with no athleteId at all — templates from before the field was
 * written as null — are excluded too, which is correct: they belong to
 * nobody, so no roster row would have matched them.
 *
 * Archived programs are excluded too — they are the only part of this
 * collection that grows without bound, one more per athlete every time a
 * block is superseded, and the roster never looks at them. That filter needs
 * every document to actually carry the field, since Firestore cannot match
 * one that is absent; scripts/backfill-archived-flag.mjs did the documents
 * that predate createProgram writing it, and it reports 0 remaining.
 *
 * Needs the (archived, athleteId) composite index in firestore.indexes.json.
 * Deploy the index BEFORE this query ships: a query against an index that is
 * still building returns nothing rather than failing, which here would read
 * as every athlete having no program at all.
 */
export const getAssignedPrograms = () =>
  getDocs(query(
    collection(db, 'programs'),
    where('archived', '==', false),
    where('athleteId', '!=', null),
  ))

export const deleteProgram = (programId) =>
  deleteDoc(doc(db, 'programs', programId))

// ── Athlete groups ───────────────────────────────────────────────────────────
// athleteGroups/{groupId} — { name, color, startDate?, notes?, createdAt }
//
// A roster grouping the coach runs training by: a winter camp cohort, a
// travel team training out of another facility. Membership lives on the
// athlete (users/{uid}.groupIds) rather than as a member list here, so
// adding someone to a group is one write to the doc that already has to be
// read to show them, and deleting a group can't strand a membership list.
// An athlete can be in several groups at once.
//
// `startDate` is optional and advisory — the date the group's block starts,
// offered as the default when assigning programs to the group. The program's
// own startDate still drives every calendar; this is just the coach's note
// of when the cohort begins so they don't retype it per athlete.
export const getAthleteGroups = () =>
  getDocs(query(collection(db, 'athleteGroups'), orderBy('createdAt', 'asc')))

export const createAthleteGroup = (data) =>
  addDoc(collection(db, 'athleteGroups'), { ...data, createdAt: serverTimestamp() })

export const updateAthleteGroup = (groupId, data) =>
  updateDoc(doc(db, 'athleteGroups', groupId), data)

// Deleting a group also has to clear it from every athlete carrying it, or
// they keep a membership pointing at nothing — which reads as an athlete
// who is in "a group" that no filter can ever show.
export const deleteAthleteGroup = async (groupId, memberUids = []) => {
  const batch = writeBatch(db)
  memberUids.forEach(uid => {
    batch.update(doc(db, 'users', uid), { groupIds: arrayRemove(groupId) })
  })
  batch.delete(doc(db, 'athleteGroups', groupId))
  await batch.commit()
}

// Membership edits are arrayUnion/arrayRemove rather than a read-modify-write
// of the whole list, so two coaches editing different groups at the same time
// can't clobber each other's change.
export const addAthleteToGroup = (uid, groupId) =>
  updateDoc(doc(db, 'users', uid), { groupIds: arrayUnion(groupId) })

export const removeAthleteFromGroup = (uid, groupId) =>
  updateDoc(doc(db, 'users', uid), { groupIds: arrayRemove(groupId) })

// Bulk version for the roster's "add selected to group" action — one commit
// instead of N round trips. Firestore caps a batch at 500 writes.
export const setGroupMembership = async (uids, groupId, { remove = false } = {}) => {
  const chunks = []
  for (let i = 0; i < uids.length; i += 450) chunks.push(uids.slice(i, i + 450))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach(uid => {
      batch.update(doc(db, 'users', uid), {
        groupIds: remove ? arrayRemove(groupId) : arrayUnion(groupId),
      })
    })
    await batch.commit()
  }
}

// ── Exercise library ─────────────────────────────────────────────────────────
// exerciseLibrary/{id} — { name, category, sets, reps, intensity, notes,
// videoUrl, updatedAt }. Powers the Program Editor's autofill suggestions:
// id is a deterministic slug of name+category (see utils/exerciseLibrary),
// so re-saving the same drill just overwrites its entry with the latest
// values rather than piling up duplicates. Grows organically as programs are
// saved — see AdminSettingsPage for the one-time backfill from existing programs.
export const getExerciseLibrary = () =>
  getDocs(collection(db, 'exerciseLibrary'))

// entries: [{ id, data }]. Chunked under Firestore's 500-write batch limit
// so a large backfill across every existing program doesn't fail outright.
export const upsertExerciseLibraryEntries = async (entries) => {
  if (!entries || entries.length === 0) return
  const chunks = []
  for (let i = 0; i < entries.length; i += 450) chunks.push(entries.slice(i, i + 450))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach(({ id, data }) => {
      batch.set(doc(db, 'exerciseLibrary', id), { ...data, updatedAt: serverTimestamp() }, { merge: true })
    })
    await batch.commit()
  }
}

// ── Data Logs ────────────────────────────────────────────────────────────────
export const addDataLog = (uid, entry) =>
  addDoc(collection(db, 'dataLogs', uid, 'entries'), {
    ...entry,
    createdAt: serverTimestamp(),
  })

export const getDataLogs = (uid) =>
  getDocs(query(
    collection(db, 'dataLogs', uid, 'entries'),
    orderBy('createdAt', 'desc'),
  ))

export const subscribeDataLogs = (uid, callback) =>
  onSnapshot(
    query(collection(db, 'dataLogs', uid, 'entries'), orderBy('createdAt', 'desc')),
    callback,
  )

// Admin-only bookkeeping — a coach marking a body weight/velo entry for
// follow-up. Not visible to the athlete anywhere; just a boolean on the
// entry itself rather than a separate collection, since nothing else is
// flaggable yet.
export const setDataLogFlag = (uid, entryId, flagged) =>
  updateDoc(doc(db, 'dataLogs', uid, 'entries', entryId), { flagged })

// ── Assessments ──────────────────────────────────────────────────────────────
// Flat field map — keys mirror the "Assessment Intake" Google Sheet columns
// (minus Athlete Name, which the app already tracks as the athlete's identity)
// so the whole doc can be handed straight to the Sheets integration.
export const getAssessment = (uid) =>
  getDoc(doc(db, 'assessments', uid))

export const saveAssessment = (uid, data) =>
  setDoc(doc(db, 'assessments', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true })

// Every assessment doc, keyed by uid (the doc ID) — used by the roster's
// bulk actions to show each athlete's assessment date and to filter a
// date range without opening each athlete individually. `assessmentDate` is
// a plain 'YYYY-MM-DD' string from the date input, so it sorts and
// range-compares correctly as a string.
export const getAllAssessments = () =>
  getDocs(collection(db, 'assessments'))

// ── Assessment history ───────────────────────────────────────────────────────
// assessments/{uid}/history/{YYYY-MM-DD} — a full copy of the assessment as it
// stood on that date, so a re-screen six weeks later doesn't overwrite what it
// should be compared against.
//
// The doc id is the assessment date, which is what makes this a log of
// assessments rather than a log of saves: correcting a typo an hour later
// updates that date's entry instead of adding a second one, and a new date is
// a new assessment by definition. `assessments/{uid}` still holds the current
// values unchanged, so every existing reader (the roster's date filter, the
// sheet pull, the athlete's own read) is untouched.
export const getAssessmentHistory = (uid) =>
  getDocs(query(collection(db, 'assessments', uid, 'history'), orderBy('assessmentDate', 'desc')))

export const saveAssessmentSnapshot = (uid, dateKey, data) =>
  setDoc(doc(db, 'assessments', uid, 'history', dateKey), { ...data, savedAt: serverTimestamp() })

// ── Athlete preferences ──────────────────────────────────────────────────────
// athletePrefs/{uid} — { programNoticesSeen: { [programId]: millis } }
// Deliberately separate from users/{uid}, which is admin-write-only because it
// carries `role`. Nothing in here is security-relevant, so athletes own it.
export const getAthletePrefs = (uid) =>
  getDoc(doc(db, 'athletePrefs', uid))

export const saveAthletePrefs = (uid, data) =>
  setDoc(doc(db, 'athletePrefs', uid), data, { merge: true })

// ── Workout completion ────────────────────────────────────────────────────────
// completions/{uid}/weeks/{completionKey}  — { completed: true, completedAt }
//
// completionKey is `${programId}_${exercise.id}`. It used to be positional
// (`${programId}_${week}_${day}_${exercise}`), which broke as soon as a coach
// edited a live program — deleting one exercise shifted every checkmark after
// it onto the wrong row. Both formats are readable; see src/utils/programIds.js.
// Callers build the key with keyForWrite() rather than assembling it here.
// Toggling off just flips `completed` back to false rather than deleting the
// doc — keeps completedAt as a "last touched" timestamp and avoids a delete
// racing a concurrent write.
export const setExerciseComplete = (uid, completionKey, completed) =>
  setDoc(
    doc(db, 'completions', uid, 'weeks', completionKey),
    { completed, completedAt: serverTimestamp() },
    { merge: true },
  )

/**
 * Move completion docs from legacy positional keys onto stable exercise-id keys.
 *
 * `remaps` is [{ from, to }]. Missing source docs are skipped, so this is safe
 * to run repeatedly and safe when the athlete never completed anything. Done in
 * one batch so a partial failure can't leave completions split across formats.
 */
export const migrateCompletionKeys = async (uid, remaps) => {
  if (!remaps || remaps.length === 0) return 0
  const existing = await getDocs(collection(db, 'completions', uid, 'weeks'))
  const byId = {}
  existing.forEach((d) => { byId[d.id] = d.data() })

  // Two writes per remap (set + delete) against Firestore's 500-op batch
  // limit, so anything past ~250 completed exercises needs chunking — a
  // legacy program with a season of ticks behind it otherwise fails to open
  // for editing at all. Every other batch in this file chunks at 450; this
  // one didn't.
  const pending = []
  for (const { from, to } of remaps) {
    if (from === to) continue
    const data = byId[from]
    if (!data) continue                 // nothing was completed at that position
    if (byId[to]) continue              // already migrated — don't clobber
    pending.push({ from, to, data })
  }

  for (let i = 0; i < pending.length; i += 225) {   // 225 remaps = 450 writes
    const batch = writeBatch(db)
    for (const { from, to, data } of pending.slice(i, i + 225)) {
      batch.set(doc(db, 'completions', uid, 'weeks', to), data, { merge: true })
      batch.delete(doc(db, 'completions', uid, 'weeks', from))
    }
    await batch.commit()
  }
  return pending.length
}

export const getCompletions = (uid) =>
  getDocs(collection(db, 'completions', uid, 'weeks'))

// ── dashboard-shaped reads ───────────────────────────────────────────────────
// The admin dashboard asks about every athlete at once, so anything it reads
// per athlete gets multiplied by the roster. It used to call getCompletions,
// getDataLogs and getExerciseWeights — all three unbounded — and pull an
// athlete's ENTIRE history to compute a progress bar and a "last active"
// date. At 20 athletes that was ~4,800 document reads for one page load,
// against a 50,000/day free tier, and it grew every week because completion
// docs are never pruned.
//
// These return the same answers from the smallest query that can produce
// them. Nothing here is denormalised: there is no summary doc to drift out
// of step with the truth, which this codebase has already been bitten by
// (see the programTypes flag). The cost is more queries, not more reads —
// Firestore bills documents returned, and these return one row each.

/** Newest completion timestamp, or null. One document, not the history. */
export const getLatestCompletionAt = (uid) =>
  getDocs(query(collection(db, 'completions', uid, 'weeks'), orderBy('completedAt', 'desc'), limit(1)))

/** Newest logged working weight. Only ever used as a recency signal. */
export const getLatestWeightAt = (uid) =>
  getDocs(query(collection(db, 'exerciseWeights', uid, 'entries'), orderBy('updatedAt', 'desc'), limit(1)))

/** Newest data-log entry, for the same recency signal. */
export const getLatestDataLogAt = (uid) =>
  getDocs(query(collection(db, 'dataLogs', uid, 'entries'), orderBy('createdAt', 'desc'), limit(1)))

/**
 * Just the flagged notes — what the dashboard's flag feed and flag count
 * actually need. Reading every entry to keep the few that are flagged was
 * the second-biggest line on that page.
 */
export const getFlaggedDataLogs = (uid) =>
  getDocs(query(collection(db, 'dataLogs', uid, 'entries'), where('flagged', '==', true)))

/**
 * Completion docs belonging to specific programs, and no others.
 *
 * Completion ids are `${programId}_${exerciseId}` (completionKey in
 * utils/programIds), so a document-id range per program fetches exactly that
 * program's ticks. This is the part that stops the dashboard getting slower
 * and more expensive every month: progress is only ever computed for the
 * programs an athlete is on NOW, but the old query also dragged in every
 * finished block they had ever done.
 *
 * One query per program — they run in parallel and each returns only its own
 * rows, so the reads are the completions that actually get used.
 */
export const getCompletionsForPrograms = async (uid, programIds) => {
  if (!programIds?.length) return {}
  const snaps = await Promise.all(programIds.map(pid =>
    getDocs(query(
      collection(db, 'completions', uid, 'weeks'),
      where(documentId(), '>=', `${pid}_`),
      // \uf8ff sorts above any character that can appear in an exercise id,
      // so this is "every key starting with `${pid}_`" and nothing after it.
      where(documentId(), '<', `${pid}_\uf8ff`),
    ))
  ))
  const out = {}
  snaps.forEach(snap => snap.forEach(d => { out[d.id] = d.data() }))
  return out
}

/**
 * Live completions for just the programs an athlete is currently on.
 *
 * The unscoped version of this read the athlete's ENTIRE completion history —
 * every tick of every block they have ever been given — on every mount of the
 * Schedule and Progress pages. Tabs unmount, so Today → Progress → Today paid
 * it three times, and the collection only grows: unticking writes
 * `completed: false` rather than deleting, and finished blocks are never
 * pruned. Across a roster that is the largest single read cost in the app, and
 * it is what repeatedly exhausted the free tier's 50,000 reads/day.
 *
 * Completion ids are `${programId}_${exerciseId}` (and the legacy
 * `${programId}_${wi}_${di}_${ei}`, which shares the prefix), so a documentId
 * range per program fetches exactly the docs those pages consult and nothing
 * else. Same trick as getCompletionsForPrograms, which cut the admin dashboard
 * from ~14,200 reads to ~3,300.
 *
 * One listener per program rather than one for all: Firestore has no "id
 * starts with any of these prefixes" filter, and `in` queries cap at 30. The
 * callback gets the MERGED map (a plain object, not a snapshot) because N
 * listeners cannot produce one snapshot between them — callers built that map
 * themselves anyway.
 *
 * Passing no programs yields an empty map and subscribes to nothing, which is
 * correct: an athlete with no active program has no ticks worth watching.
 */
const subscribeKeyedByProgram = (path, uid, programIds, callback) => {
  const ids = [...new Set(programIds || [])].filter(Boolean)
  if (!ids.length) { callback({}); return () => {} }

  const byProgram = new Map()
  const emit = () => {
    const merged = {}
    byProgram.forEach(docs => Object.assign(merged, docs))
    callback(merged)
  }
  const unsubs = ids.map(pid => onSnapshot(
    query(
      collection(db, path, uid, path === 'completions' ? 'weeks' : 'entries'),
      where(documentId(), '>=', `${pid}_`),
      where(documentId(), '<', `${pid}_\uf8ff`),
    ),
    (snap) => {
      const docs = {}
      snap.forEach(d => { docs[d.id] = d.data() })
      byProgram.set(pid, docs)
      emit()
    },
  ))
  return () => unsubs.forEach(u => u())
}

export const subscribeCompletionsForPrograms = (uid, programIds, callback) =>
  subscribeKeyedByProgram('completions', uid, programIds, callback)

// ── Exercise weight tracking ───────────────────────────────────────────────────
// exerciseWeights/{uid}/entries/{programId_exerciseId} — { value, exercise, updatedAt }
// One editable value per exercise instance — the athlete logs this week's
// working weight inline on the program tab, mid-workout. This is a current
// value, not a growing history (see dataLogs for that).
export const saveExerciseWeight = (uid, key, data) =>
  setDoc(
    doc(db, 'exerciseWeights', uid, 'entries', key),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  )

// Same shape, same reasoning, same key format as completions above — weights
// are keyed `${programId}_${exerciseId}` too, and the unscoped version read
// every working weight the athlete had ever entered on every page mount.
export const subscribeExerciseWeightsForPrograms = (uid, programIds, callback) =>
  subscribeKeyedByProgram('exerciseWeights', uid, programIds, callback)
