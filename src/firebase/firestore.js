/**
 * Firestore helper functions
 *
 * Collections:
 *  users/{uid}               — { name, email, role: 'athlete'|'admin', programId?, createdAt }
 *  programs/{programId}      — { name, athleteId, totalWeeks, weeks: [...], createdAt, active }
 *  dataLogs/{uid}/entries/{} — { date, type: 'velo'|'weight', value, exercise?, notes, createdAt }
 *  assessments/{uid}         — { scores: {...}, programId, updatedAt }
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, Timestamp,
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

export const getAllPrograms = () =>
  getDocs(query(collection(db, 'programs'), orderBy('createdAt', 'desc')))

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

// ── App Settings ─────────────────────────────────────────────────────────────
// settings/global — { sheetsScriptUrl: string, assessmentSheetScriptUrl: string }
export const getSettings = () =>
  getDoc(doc(db, 'settings', 'global'))

export const saveSettings = (data) =>
  setDoc(doc(db, 'settings', 'global'), data, { merge: true })

// ── Workout completion ────────────────────────────────────────────────────────
// completions/{uid}/weeks/{weekDay}  — { completed: true, completedAt }
export const markWorkoutComplete = (uid, weekIdx, dayIdx) =>
  setDoc(
    doc(db, 'completions', uid, 'weeks', `${weekIdx}_${dayIdx}`),
    { completed: true, completedAt: serverTimestamp() },
    { merge: true },
  )

export const getCompletions = (uid) =>
  getDocs(collection(db, 'completions', uid, 'weeks'))

export const subscribeCompletions = (uid, callback) =>
  onSnapshot(collection(db, 'completions', uid, 'weeks'), callback)
