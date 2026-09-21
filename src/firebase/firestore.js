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
 *  chats/{uid}/messages/{}   — { text, senderUid, senderName, role: 'admin'|'athlete', createdAt }
 *  chatReads/{uid}           — { lastReadAt } — admin-only "coach last opened this thread" marker
 *  teamChat/{messageId}      — { text, authorId, authorName, authorType: 'human'|'claude',
 *                              mentions: string[], answeredBy: string|null, createdAt } — one flat
 *                              staff room (admin-only), separate from the per-athlete chats above
 *  teamChatReads/{uid}       — { lastReadAt } — per-admin unread marker for the staff room
 *  facilitySlots/{id}        — { date, startTime, endTime, capacity, bookedCount, seriesId? } —
 *                              see the "Facility scheduling" section below for the full shape,
 *                              including the bookings sub-collection and its athlete-side mirror.
 *
 * An athlete can have up to one *active* program per programType at a time —
 * correctives, throwing, and lifting run concurrently rather than one program
 * at a time. Programs missing `programType` predate this and are treated as
 * 'correctives' everywhere they're read.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, writeBatch, runTransaction, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage'
import { auth, db } from './config'

// ── Users ──────────────────────────────────────────────────────────────────
export const getUser = (uid) => getDoc(doc(db, 'users', uid))

export const createUser = (uid, data) =>
  setDoc(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() })

export const updateUser = (uid, data) =>
  updateDoc(doc(db, 'users', uid), data)

export const deleteUser = (uid) =>
  deleteDoc(doc(db, 'users', uid))

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

// ── Programs ────────────────────────────────────────────────────────────────
export const getProgram = (programId) =>
  getDoc(doc(db, 'programs', programId))

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
export const createProgram = (data) =>
  addDoc(collection(db, 'programs'), { ...data, createdAt: serverTimestamp(), active: data.active ?? true })

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

// Reusable template programs not yet tied to any athlete — the library on
// the Programs page and the assignable pool on each athlete's Program tab.
// No orderBy here on purpose: pairing an equality filter with orderBy on a
// different field needs a composite index, and this collection is small
// enough that sorting client-side after the fetch is simpler than managing one.
export const getGeneralPrograms = () =>
  getDocs(query(collection(db, 'programs'), where('athleteId', '==', null)))

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

export const deleteAssessmentSnapshot = (uid, dateKey) =>
  deleteDoc(doc(db, 'assessments', uid, 'history', dateKey))

// ── Athlete preferences ──────────────────────────────────────────────────────
// athletePrefs/{uid} — { programNoticesSeen: { [programId]: millis } }
// Deliberately separate from users/{uid}, which is admin-write-only because it
// carries `role`. Nothing in here is security-relevant, so athletes own it.
export const getAthletePrefs = (uid) =>
  getDoc(doc(db, 'athletePrefs', uid))

export const saveAthletePrefs = (uid, data) =>
  setDoc(doc(db, 'athletePrefs', uid), data, { merge: true })

// ── App Settings ─────────────────────────────────────────────────────────────
// settings/global — { sheetsScriptUrl: string, assessmentSheetScriptUrl: string }
export const getSettings = () =>
  getDoc(doc(db, 'settings', 'global'))

export const saveSettings = (data) =>
  setDoc(doc(db, 'settings', 'global'), data, { merge: true })

// settings/public — { inquiryScriptUrl: string, bookingNotifyScriptUrl: string }.
// Readable while signed out (see firestore.rules) so the landing page's inquiry
// form can reach its Apps Script URL. Both URLs are effectively public, so the
// scripts defend themselves: the booking one only acts on a verified athlete's
// real booking, the inquiry one rate-limits (see apps-script/).
export const getPublicSettings = () =>
  getDoc(doc(db, 'settings', 'public'))

export const savePublicSettings = (data) =>
  setDoc(doc(db, 'settings', 'public'), data, { merge: true })

// Pings the coach's Apps Script (apps-script/booking-notify.gs) so facility
// bookings email superiorperformance.sp@gmail.com — no Cloud Functions or
// Blaze plan needed. Sends only the slot id and the athlete's ID token: the
// script reads the booking, athlete name, and slot time from Firestore as
// that athlete, so a request can't make it email anything that isn't real.
// It also decides whether a cancellation is late enough (inside 24h) to be
// worth an email, in facility time.
//
// POST with a text/plain body keeps this a "simple" request — Apps Script
// can't answer a CORS preflight. no-cors because nothing reads the reply.
// Fire-and-forget: a booking/cancellation must never fail or block because
// this ping did, so callers don't await it and every error is swallowed.
export async function notifyFacilityBooking({ kind = 'booking', slotId }) {
  try {
    const snap = await getPublicSettings()
    const scriptUrl = snap.exists() ? snap.data().bookingNotifyScriptUrl : ''
    if (!scriptUrl || !auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken()
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: kind === 'cancellation' ? 'cancel' : 'book', slotId, idToken }),
    })
  } catch (err) {
    console.error('Facility booking notification failed (the booking itself is fine):', err)
  }
}

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

  const batch = writeBatch(db)
  let moved = 0
  for (const { from, to } of remaps) {
    if (from === to) continue
    const data = byId[from]
    if (!data) continue                 // nothing was completed at that position
    if (byId[to]) continue              // already migrated — don't clobber
    batch.set(doc(db, 'completions', uid, 'weeks', to), data, { merge: true })
    batch.delete(doc(db, 'completions', uid, 'weeks', from))
    moved++
  }
  if (moved > 0) await batch.commit()
  return moved
}

export const getCompletions = (uid) =>
  getDocs(collection(db, 'completions', uid, 'weeks'))

export const subscribeCompletions = (uid, callback) =>
  onSnapshot(collection(db, 'completions', uid, 'weeks'), callback)

// ── Chat ─────────────────────────────────────────────────────────────────────
// chats/{athleteUid}/messages/{messageId} — { text, senderUid, senderName,
// role: 'admin'|'athlete', createdAt }. One thread per athlete, shared with
// their coach — same shape on both sides. Previously lived in the Realtime
// Database; moved here so chat uses the same datastore, rules pattern, and
// ordering guarantees as everything else in the app instead of a second,
// separately-configured service.
export const sendChatMessage = (athleteUid, message) =>
  addDoc(collection(db, 'chats', athleteUid, 'messages'), {
    ...message,
    createdAt: serverTimestamp(),
  })

export const subscribeChatMessages = (athleteUid, callback) =>
  onSnapshot(
    query(collection(db, 'chats', athleteUid, 'messages'), orderBy('createdAt')),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  )

// One-time (non-subscribing) read of a thread — for the dashboard's roster
// scan, where dozens of live onSnapshot listeners would be wasteful. Real-time
// chat views should still use subscribeChatMessages above.
//
// `sinceMs`, when given, narrows to messages created after that time — the
// dashboard passes each athlete's chatReads.lastReadAt so an established
// thread with months of history only ever pulls back the handful of
// messages that might actually be unread, not the whole conversation. Safe
// to filter and order by the same field (createdAt) without a composite
// index.
export const getChatMessages = (athleteUid, sinceMs) =>
  getDocs(query(
    collection(db, 'chats', athleteUid, 'messages'),
    ...(sinceMs ? [where('createdAt', '>', Timestamp.fromMillis(sinceMs))] : []),
    orderBy('createdAt', 'desc'),
  ))

// chatReads/{athleteUid} — { lastReadAt } — when the coach last opened this
// athlete's conversation. Athlete-authored messages newer than this count as
// unread on the admin dashboard and Messages nav. Admin-only bookkeeping —
// the athlete side has no equivalent, their chat just shows full history.
export const getAllChatReads = () =>
  getDocs(collection(db, 'chatReads'))

export const markChatRead = (athleteUid) =>
  setDoc(doc(db, 'chatReads', athleteUid), { lastReadAt: serverTimestamp() }, { merge: true })

// ── Team chat ────────────────────────────────────────────────────────────────
// teamChat/{messageId} — { text, authorId, authorName, authorType:
// 'human'|'claude', mentions: string[], answeredBy: string|null, createdAt }
//
// One flat staff thread, unlike chats/{athleteUid}/messages which is a thread
// per athlete — everyone with an admin account is in the same room, so there's
// no per-thread key to nest under. Admin-only on both read and write.
//
// `mentions` is parsed from the body at write time (see utils/teamChat.js) so
// a scheduled Claude agent can find "someone asked me something" without
// re-parsing every message. `answeredBy` is the handle of whichever agent has
// already replied to that message — it's the idempotency guard that stops an
// agent from answering the same question again on its next wake-up, and stops
// two agents from both jumping on the same bare `@claude`.
//
// TEAM_CHAT_WINDOW caps the live subscription. A staff room accumulates
// forever but nobody scrolls back a year in practice, and an unbounded
// onSnapshot would re-deliver the entire history on every reconnect.
export const TEAM_CHAT_WINDOW = 200

export const sendTeamChatMessage = (message) =>
  addDoc(collection(db, 'teamChat'), {
    answeredBy: null,
    mentions: [],
    ...message,
    createdAt: serverTimestamp(),
  })

// Newest-first from Firestore (so the limit keeps the RECENT window, not the
// oldest 200), reversed before handing back so callers render oldest-to-newest
// the way a chat log reads.
export const subscribeTeamChat = (callback) =>
  onSnapshot(
    query(collection(db, 'teamChat'), orderBy('createdAt', 'desc'), limit(TEAM_CHAT_WINDOW)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse()),
  )

// One-shot read for the scheduled agent, which has no React lifecycle to hang
// a subscription off. Deliberately a plain recency window filtered in memory
// rather than a where('mentions','array-contains-any',...) + where('answeredBy',
// '==', null) query: that combination needs a composite index, and a staff room
// is small enough that scanning the last N messages costs nothing.
export const getRecentTeamChat = (count = 50) =>
  getDocs(query(collection(db, 'teamChat'), orderBy('createdAt', 'desc'), limit(count)))

// Claim-and-record in one write. Called by an agent immediately after it posts
// its reply, so the message it answered won't come back as outstanding work.
export const markTeamChatAnswered = (messageId, agentHandle) =>
  updateDoc(doc(db, 'teamChat', messageId), { answeredBy: agentHandle })

// teamChatReads/{uid} — { lastReadAt }. Per-admin, unlike chatReads/{athleteUid}
// which is keyed by the thread: here every admin is a participant, so each one
// needs their own "last opened" marker to drive their own unread badge.
export const getTeamChatRead = (uid) =>
  getDoc(doc(db, 'teamChatReads', uid))

// Live variant — the unread badge needs this rather than a one-time read, or
// it would keep counting messages the reader is looking at right now (the
// chat page updates this marker as they sit there, and a stale local copy
// would leave the badge stuck until a remount).
export const subscribeTeamChatRead = (uid, callback) =>
  onSnapshot(doc(db, 'teamChatReads', uid), (snap) =>
    callback(snap.exists() ? snap.data() : null))

export const markTeamChatRead = (uid) =>
  setDoc(doc(db, 'teamChatReads', uid), { lastReadAt: serverTimestamp() }, { merge: true })

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

export const subscribeExerciseWeights = (uid, callback) =>
  onSnapshot(collection(db, 'exerciseWeights', uid, 'entries'), callback)

// One-time (non-subscribing) read — for the admin dashboard's per-athlete
// fan-out, where logging a working weight inline needs to count as activity
// alongside completions and data logs (see lastActivityMillis in
// AdminDashboardPage.jsx). subscribeExerciseWeights above is for the
// athlete's own live-updating schedule view.
export const getExerciseWeights = (uid) =>
  getDocs(collection(db, 'exerciseWeights', uid, 'entries'))

// ── Facility scheduling ──────────────────────────────────────────────────────
// facilitySlots/{slotId} — { date: 'YYYY-MM-DD', startTime: 'HH:MM',
// endTime: 'HH:MM', capacity, bookedCount, notes, seriesId, createdAt } —
// one concrete bookable slot, whether created one-off or generated from a
// recurring series (see facilityRecurringSeries below).
// facilitySlots/{slotId}/bookings/{athleteUid} — { bookedAt, athleteName } —
// doc id is the athlete's own uid, so "already booked" and "cancel" are a
// direct doc read/delete rather than a query.
// facilityBookingsByAthlete/{uid}/slots/{slotId} — { bookedAt, date,
// startTime, endTime } — denormalized mirror written in the same
// transaction as the booking doc above, purely so "My Bookings" is a plain
// read of the athlete's own subcollection.
// facilityRecurringSeries/{seriesId} — { dayOfWeek: 0-6, startTime, endTime,
// capacity, notes, startDate, endDate (nullable), active, createdAt } — a
// weekly pattern a coach generates concrete slots from. Generation is
// client-triggered (no Cloud Functions in this project), not an automatic
// background job — see generateSeriesSlots.

export const createFacilitySlot = (data) =>
  addDoc(collection(db, 'facilitySlots'), { ...data, bookedCount: 0, createdAt: serverTimestamp() })

export const deleteFacilitySlot = (slotId) =>
  deleteDoc(doc(db, 'facilitySlots', slotId))

export const getFacilitySlots = (fromDate) =>
  getDocs(query(collection(db, 'facilitySlots'), where('date', '>=', fromDate), orderBy('date'), orderBy('startTime')))

export const subscribeFacilitySlots = (fromDate, callback) =>
  onSnapshot(
    query(collection(db, 'facilitySlots'), where('date', '>=', fromDate), orderBy('date'), orderBy('startTime')),
    callback,
  )

export const getSlotBookings = (slotId) =>
  getDocs(collection(db, 'facilitySlots', slotId, 'bookings'))

export const getMyFacilityBookings = (uid) =>
  getDocs(collection(db, 'facilityBookingsByAthlete', uid, 'slots'))

// Books a slot atomically — fails closed rather than overbooking if two
// athletes tap the last spot at once (Firestore retries a transaction that
// loses the race, so the second caller re-reads the just-updated count and
// throws FULL instead of both succeeding). Throws a short error code
// string so the UI can show a specific message instead of a generic toast.
export const bookFacilitySlot = (slotId, uid, athleteName) =>
  runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'facilitySlots', slotId)
    const bookingRef = doc(db, 'facilitySlots', slotId, 'bookings', uid)
    const slotSnap = await tx.get(slotRef)
    if (!slotSnap.exists()) throw new Error('NOT_FOUND')
    const bookingSnap = await tx.get(bookingRef)
    if (bookingSnap.exists()) throw new Error('ALREADY_BOOKED')
    const { bookedCount = 0, capacity, date, startTime, endTime } = slotSnap.data()
    if (bookedCount >= capacity) throw new Error('FULL')
    const mirrorRef = doc(db, 'facilityBookingsByAthlete', uid, 'slots', slotId)
    tx.update(slotRef, { bookedCount: bookedCount + 1 })
    tx.set(bookingRef, { bookedAt: serverTimestamp(), athleteName })
    tx.set(mirrorRef, { bookedAt: serverTimestamp(), date, startTime, endTime })
  })

// Cancels the athlete's own booking. A no-op (not an error) if they weren't
// actually booked — callers don't need to special-case that.
export const cancelFacilityBooking = (slotId, uid) =>
  runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'facilitySlots', slotId)
    const bookingRef = doc(db, 'facilitySlots', slotId, 'bookings', uid)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return
    const slotSnap = await tx.get(slotRef)
    const bookedCount = slotSnap.data()?.bookedCount ?? 0
    const { date, startTime, endTime } = slotSnap.data() || {}
    const mirrorRef = doc(db, 'facilityBookingsByAthlete', uid, 'slots', slotId)
    // The receipt the alert script checks before emailing a late
    // cancellation — see facilityCancellations in firestore.rules. Written
    // here, in the same transaction that deletes the booking, because that
    // pairing is the whole proof.
    const receiptRef = doc(db, 'facilityCancellations', uid, 'slots', slotId)
    tx.update(slotRef, { bookedCount: Math.max(0, bookedCount - 1) })
    tx.delete(bookingRef)
    tx.delete(mirrorRef)
    tx.set(receiptRef, { cancelledAt: serverTimestamp(), date, startTime, endTime })
  })

export const createRecurringSeries = (data) =>
  addDoc(collection(db, 'facilityRecurringSeries'), { ...data, active: true, createdAt: serverTimestamp() })

export const getRecurringSeries = () =>
  getDocs(collection(db, 'facilityRecurringSeries'))

export const updateRecurringSeries = (seriesId, data) =>
  updateDoc(doc(db, 'facilityRecurringSeries', seriesId), data)

// Writes one facilitySlots doc per date in `dates` (see
// utils/facilitySchedule.generateSeriesDates) that doesn't already have a
// generated slot for this series — safe to call repeatedly ("Generate
// more") without ever creating duplicates. Returns how many were created.
export const generateSeriesSlots = async (series, seriesId, dates) => {
  if (dates.length === 0) return 0
  const existing = await getDocs(query(collection(db, 'facilitySlots'), where('seriesId', '==', seriesId)))
  const existingDates = new Set(existing.docs.map(d => d.data().date))
  const toCreate = dates.filter(date => !existingDates.has(date))
  if (toCreate.length === 0) return 0
  const batch = writeBatch(db)
  toCreate.forEach(date => {
    const ref = doc(collection(db, 'facilitySlots'))
    batch.set(ref, {
      date,
      startTime: series.startTime,
      endTime: series.endTime,
      capacity: series.capacity,
      notes: series.notes || null,
      seriesId,
      bookedCount: 0,
      createdAt: serverTimestamp(),
    })
  })
  await batch.commit()
  return toCreate.length
}
