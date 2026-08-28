/**
 * Firestore helper functions
 *
 * Collections:
 *  users/{uid}               — { name, email, role: 'athlete'|'admin', programTypes?: string[], createdAt }
 *  programs/{programId}      — { name, athleteId, programType: 'correctives'|'throwing'|'lifting', totalWeeks, weeks: [...], startDate?, createdAt, active }
 *  dataLogs/{uid}/entries/{} — { date, type: 'velo'|'weight', value, exercise?, notes, createdAt }
 *  assessments/{uid}         — { scores: {...}, programId, updatedAt }
 *  chats/{uid}/messages/{}   — { text, senderUid, senderName, role: 'admin'|'athlete', createdAt }
 *
 * An athlete can have up to one *active* program per programType at a time —
 * correctives, throwing, and lifting run concurrently rather than one program
 * at a time. Programs missing `programType` predate this and are treated as
 * 'correctives' everywhere they're read.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore'
import { db } from './config'

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

// ── Assessments ──────────────────────────────────────────────────────────────
// Flat field map — keys mirror the "Assessment Intake" Google Sheet columns
// (minus Athlete Name, which the app already tracks as the athlete's identity)
// so the whole doc can be handed straight to the Sheets integration.
export const getAssessment = (uid) =>
  getDoc(doc(db, 'assessments', uid))

export const saveAssessment = (uid, data) =>
  setDoc(doc(db, 'assessments', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true })

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

// settings/public — { inquiryScriptUrl: string }. Readable while signed out
// (see firestore.rules) so the landing page's inquiry form can reach it.
export const getPublicSettings = () =>
  getDoc(doc(db, 'settings', 'public'))

export const savePublicSettings = (data) =>
  setDoc(doc(db, 'settings', 'public'), data, { merge: true })

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
