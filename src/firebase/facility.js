/**
 * Facility scheduling — bookable slots, the athlete's bookings, and the
 * weekly recurring series slots are generated from.
 *
 * Split out of firestore.js because this is the one part of the data layer
 * with its own invariants to protect: capacity, the booking mirror, and the
 * cancellation receipt all have to move together, which is why the writes
 * here are transactions and batches rather than single doc updates.
 */
import {
  collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, runTransaction,
} from 'firebase/firestore'
import { auth, db } from './config'
import { getPublicSettings } from './settings'

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

// Deleting a slot has to take its bookings and every athlete's copy of them
// with it. A subcollection does not go with its parent, so the old one-line
// delete left orphaned bookings behind and athletes still showing a session
// that no longer exists under "My Bookings".
export const deleteFacilitySlot = async (slotId) => {
  const bookings = await getDocs(collection(db, 'facilitySlots', slotId, 'bookings'))
  // Two deletes per booking, chunked like every other batch here. The
  // booking's doc id is the athlete's uid (see bookFacilitySlot), which is
  // what makes the mirror addressable without a second query.
  const docs = bookings.docs
  for (let i = 0; i < docs.length; i += 225) {
    const batch = writeBatch(db)
    for (const b of docs.slice(i, i + 225)) {
      batch.delete(b.ref)
      batch.delete(doc(db, 'facilityBookingsByAthlete', b.id, 'slots', slotId))
    }
    await batch.commit()
  }
  // Last, so a failure part-way leaves the slot itself in place rather than
  // stranding bookings under a slot that no longer exists.
  await deleteDoc(doc(db, 'facilitySlots', slotId))
  return docs.length
}

export const getFacilitySlots = (fromDate) =>
  getDocs(query(collection(db, 'facilitySlots'), where('date', '>=', fromDate), orderBy('date'), orderBy('startTime')))

/**
 * One day's slots, earliest first — what the coach's daily schedule is built
 * from.
 *
 * getFacilitySlots(fromDate) returns everything from that date onward, which
 * is right for the athlete's "what can I book" list and wrong for "who is in
 * the building today": it would read a couple of months of slots to show
 * this afternoon's four. Same (date, startTime) composite index as that
 * query, so this needed no new index.
 */
export const getSlotsForDate = (date) =>
  getDocs(query(
    collection(db, 'facilitySlots'),
    where('date', '==', date),
    orderBy('startTime'),
  ))

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
//
// Two paths:
//  Slot still exists  — decrement bookedCount, delete booking + mirror, write
//                       a cancellation receipt (proof the cancellation was real,
//                       needed by the alert script before it emails the coach).
//  Slot was deleted   — the coach removed it without cleaning up bookings first
//                       (the pre-25f82c7 deleteFacilitySlot left orphans). Just
//                       delete the booking + mirror so "My Bookings" clears; no
//                       slot to decrement and no receipt needed. The security
//                       rules' slot-gone branch covers the booking delete.
export const cancelFacilityBooking = (slotId, uid) =>
  runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'facilitySlots', slotId)
    const bookingRef = doc(db, 'facilitySlots', slotId, 'bookings', uid)
    const bookingSnap = await tx.get(bookingRef)
    if (!bookingSnap.exists()) return
    const slotSnap = await tx.get(slotRef)
    const mirrorRef = doc(db, 'facilityBookingsByAthlete', uid, 'slots', slotId)
    tx.delete(bookingRef)
    tx.delete(mirrorRef)
    if (slotSnap.exists()) {
      const { bookedCount = 0, date, startTime, endTime } = slotSnap.data()
      // The receipt the alert script checks before emailing a late
      // cancellation — see facilityCancellations in firestore.rules. Written
      // here, in the same transaction that deletes the booking, because that
      // pairing is the whole proof.
      const receiptRef = doc(db, 'facilityCancellations', uid, 'slots', slotId)
      tx.update(slotRef, { bookedCount: Math.max(0, bookedCount - 1) })
      tx.set(receiptRef, { cancelledAt: serverTimestamp(), date, startTime, endTime })
    }
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
