/**
 * App settings — two documents, one admin-only and one world-readable.
 *
 * Split out of firestore.js because these are the app's configuration rather
 * than athlete data: every Apps Script URL the app talks to is read from
 * here, and knowing which of the two docs a URL lives in is a security
 * question (see firestore.rules), not a convenience.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './config'

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
