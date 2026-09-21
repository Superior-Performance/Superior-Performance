// Firestore rules tests for facility booking. Run with `npm run test:rules`
// (needs a Java runtime for the emulator, e.g. `brew install openjdk@21`).
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const env = await initializeTestEnvironment({
  projectId: 'demo-sp',
  firestore: { rules: readFileSync(`${ROOT}/firestore.rules`, 'utf8'), host: '127.0.0.1', port: 8080 },
})

let failures = 0
async function t(name, fn) {
  try { await fn(); console.log('ok  ', name) } catch (e) { failures++; console.log('FAIL', name, '-', e.message) }
}

async function seed({ count = 0, cap = 3, booked = [] } = {}) {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/ath'), { role: 'athlete' })
    await setDoc(doc(db, 'users/ath2'), { role: 'athlete' })
    await setDoc(doc(db, 'users/adm'), { role: 'admin' })
    await setDoc(doc(db, 'facilitySlots/s1'), { date: '2026-10-01', startTime: '10:00', endTime: '11:00', capacity: cap, bookedCount: count })
    for (const uid of booked) await setDoc(doc(db, `facilitySlots/s1/bookings/${uid}`), { athleteName: uid })
  })
}
const db = (uid) => env.authenticatedContext(uid).firestore()

// Same shape as bookFacilitySlot / cancelFacilityBooking in src/firebase/firestore.js
const book = (fs, uid) => runTransaction(fs, async (tx) => {
  const s = await tx.get(doc(fs, 'facilitySlots/s1'))
  await tx.get(doc(fs, `facilitySlots/s1/bookings/${uid}`))
  tx.update(doc(fs, 'facilitySlots/s1'), { bookedCount: s.data().bookedCount + 1 })
  tx.set(doc(fs, `facilitySlots/s1/bookings/${uid}`), { bookedAt: serverTimestamp(), athleteName: 'A' })
  tx.set(doc(fs, `facilityBookingsByAthlete/${uid}/slots/s1`), { bookedAt: serverTimestamp() })
})
const cancel = (fs, uid) => runTransaction(fs, async (tx) => {
  await tx.get(doc(fs, `facilitySlots/s1/bookings/${uid}`))
  const s = await tx.get(doc(fs, 'facilitySlots/s1'))
  tx.update(doc(fs, 'facilitySlots/s1'), { bookedCount: s.data().bookedCount - 1 })
  tx.delete(doc(fs, `facilitySlots/s1/bookings/${uid}`))
  tx.delete(doc(fs, `facilityBookingsByAthlete/${uid}/slots/s1`))
  tx.set(doc(fs, `facilityCancellations/${uid}/slots/s1`), { cancelledAt: serverTimestamp() })
})

// ── legit flows ──
await t('athlete books', async () => { await seed(); await assertSucceeds(book(db('ath'), 'ath')) })
await t('athlete cancels own booking', async () => { await seed({ count: 1, booked: ['ath'] }); await assertSucceeds(cancel(db('ath'), 'ath')) })
await t('second athlete books after first', async () => { await seed({ count: 1, booked: ['ath'] }); await assertSucceeds(book(db('ath2'), 'ath2')) })
await t('admin edits slot freely', async () => { await seed(); await assertSucceeds(updateDoc(doc(db('adm'), 'facilitySlots/s1'), { bookedCount: 2, capacity: 5 })) })
await t('admin cancels athlete booking (delete-athlete flow)', async () => { await seed({ count: 1, booked: ['ath'] }); await assertSucceeds(cancel(db('adm'), 'ath')) })
await t('athlete clears booking on deleted slot', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'facilitySlots/s1')))
  await assertSucceeds(deleteDoc(doc(db('ath'), 'facilitySlots/s1/bookings/ath')))
})

// ── exploit #1 ──
await t('bare +1 without booking denied', async () => { await seed(); await assertFails(updateDoc(doc(db('ath'), 'facilitySlots/s1'), { bookedCount: 1 })) })
await t('bare -1 without booking denied', async () => { await seed({ count: 2 }); await assertFails(updateDoc(doc(db('ath'), 'facilitySlots/s1'), { bookedCount: 1 })) })
await t('-1 while keeping own booking denied', async () => { await seed({ count: 1, booked: ['ath'] }); await assertFails(updateDoc(doc(db('ath'), 'facilitySlots/s1'), { bookedCount: 0 })) })
await t('+1 again while already booked denied', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await assertFails(updateDoc(doc(db('ath'), 'facilitySlots/s1'), { bookedCount: 2 }))
})
await t('booking create without increment denied', async () => { await seed(); await assertFails(setDoc(doc(db('ath'), 'facilitySlots/s1/bookings/ath'), { athleteName: 'A' })) })
await t('booking delete without decrement denied', async () => { await seed({ count: 1, booked: ['ath'] }); await assertFails(deleteDoc(doc(db('ath'), 'facilitySlots/s1/bookings/ath'))) })
await t('book someone else denied', async () => {
  await seed()
  const fs = db('ath')
  const b = writeBatch(fs)
  b.update(doc(fs, 'facilitySlots/s1'), { bookedCount: 1 })
  b.set(doc(fs, 'facilitySlots/s1/bookings/ath2'), { athleteName: 'x' })
  await assertFails(b.commit())
})
await t('cancel someone else denied', async () => { await seed({ count: 1, booked: ['ath2'] }); await assertFails(cancel(db('ath'), 'ath2')) })
await t('booking over capacity denied', async () => { await seed({ count: 3, cap: 3 }); await assertFails(book(db('ath'), 'ath')) })
await t('extra fields on booking denied', async () => {
  await seed()
  const fs = db('ath')
  const b = writeBatch(fs)
  b.update(doc(fs, 'facilitySlots/s1'), { bookedCount: 1 })
  b.set(doc(fs, 'facilitySlots/s1/bookings/ath'), { athleteName: 'A', paid: true })
  await assertFails(b.commit())
})
await t('booking update denied', async () => { await seed({ count: 1, booked: ['ath'] }); await assertFails(updateDoc(doc(db('ath'), 'facilitySlots/s1/bookings/ath'), { athleteName: 'Z' })) })
await t('role-less account cannot book', async () => { await seed(); await assertFails(book(db('rando'), 'rando')) })
await t('role-less account can still browse slots', async () => { await seed(); await assertSucceeds(getDoc(doc(db('rando'), 'facilitySlots/s1'))) })

// ── cancellation receipts ──
// The receipt is what stops the alert script emailing "late cancellation" for
// a slot the athlete never booked, so a receipt they can mint on demand would
// be worthless.
await t('a receipt can only be written while cancelling a real booking', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await assertSucceeds(cancel(db('ath'), 'ath'))
  await assertSucceeds(getDoc(doc(db('ath'), 'facilityCancellations/ath/slots/s1')))
})
await t('a bare receipt write is denied', async () => {
  await seed({ count: 1, booked: ['ath2'] })
  await assertFails(setDoc(doc(db('ath'), 'facilityCancellations/ath/slots/s1'), { cancelledAt: serverTimestamp() }))
})
await t('a receipt for a slot you never booked is denied', async () => {
  await seed({ count: 1, booked: ['ath2'] })
  await assertFails(cancel(db('ath'), 'ath'))
})
await t('a receipt cannot be written for someone else', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await assertFails(setDoc(doc(db('ath'), 'facilityCancellations/ath2/slots/s1'), { cancelledAt: serverTimestamp() }))
})
await t('an athlete cannot read another athlete\'s receipts', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await assertSucceeds(cancel(db('ath'), 'ath'))
  await assertFails(getDoc(doc(db('ath2'), 'facilityCancellations/ath/slots/s1')))
})
await t('a receipt cannot be edited or deleted by the athlete', async () => {
  await seed({ count: 1, booked: ['ath'] })
  await assertSucceeds(cancel(db('ath'), 'ath'))
  await assertFails(setDoc(doc(db('ath'), 'facilityCancellations/ath/slots/s1'), { cancelledAt: 'faked' }))
  await assertFails(deleteDoc(doc(db('ath'), 'facilityCancellations/ath/slots/s1')))
})

// ── role-less accounts ──
// Anyone can self-register over the public web API key. Such an account must
// not be able to write anything: under the old isAuth() rules it could pile
// documents under its own uid until the day's Spark write quota was gone,
// taking the app down for everyone.
await t('a role-less account cannot write its own data', async () => {
  await seedGroups()
  const fs = db('nobody')
  await assertFails(setDoc(doc(fs, 'dataLogs/nobody/entries/e1'), { value: 1 }))
  await assertFails(setDoc(doc(fs, 'completions/nobody/weeks/w1'), { completed: true }))
  await assertFails(setDoc(doc(fs, 'athletePrefs/nobody'), { x: 1 }))
  await assertFails(setDoc(doc(fs, 'exerciseWeights/nobody/entries/k1'), { value: 1 }))
  await assertFails(setDoc(doc(fs, 'chats/nobody/messages/m1'), { text: 'hi' }))
  await assertFails(setDoc(doc(fs, 'facilityBookingsByAthlete/nobody/slots/s1'), { bookedAt: 1 }))
})
await t('a real athlete still writes all of their own data', async () => {
  await seedGroups()
  const fs = db('ath')
  await assertSucceeds(setDoc(doc(fs, 'dataLogs/ath/entries/e1'), { value: 1 }))
  await assertSucceeds(setDoc(doc(fs, 'completions/ath/weeks/w1'), { completed: true }))
  await assertSucceeds(setDoc(doc(fs, 'athletePrefs/ath'), { x: 1 }))
  await assertSucceeds(setDoc(doc(fs, 'exerciseWeights/ath/entries/k1'), { value: 1 }))
  await assertSucceeds(setDoc(doc(fs, 'chats/ath/messages/m1'), { text: 'hi' }))
  await assertSucceeds(setDoc(doc(fs, 'facilityBookingsByAthlete/ath/slots/s1'), { bookedAt: 1 }))
})
await t('an athlete still cannot write another athlete\'s data', async () => {
  await seedGroups()
  await assertFails(setDoc(doc(db('ath'), 'dataLogs/ath2/entries/e1'), { value: 1 }))
  await assertFails(setDoc(doc(db('ath'), 'chats/ath2/messages/m1'), { text: 'hi' }))
})
await t('an admin still writes on an athlete\'s behalf', async () => {
  await seedGroups()
  await assertSucceeds(setDoc(doc(db('adm'), 'completions/ath/weeks/w1'), { completed: true }))
})

// ── assessment history ──
await t('admin writes and reads an assessment snapshot', async () => {
  await seedGroups()
  await assertSucceeds(setDoc(doc(db('adm'), 'assessments/ath/history/2026-09-21'), { assessmentDate: '2026-09-21', velo: '84' }))
  await assertSucceeds(getDoc(doc(db('adm'), 'assessments/ath/history/2026-09-21')))
})
await t('an athlete may read their own history but not write it', async () => {
  await seedGroups()
  await env.withSecurityRulesDisabled(ctx =>
    setDoc(doc(ctx.firestore(), 'assessments/ath/history/2026-09-21'), { velo: '84' }))
  await assertSucceeds(getDoc(doc(db('ath'), 'assessments/ath/history/2026-09-21')))
  await assertFails(setDoc(doc(db('ath'), 'assessments/ath/history/2026-09-21'), { velo: '99' }))
})
await t("an athlete cannot read another athlete's history", async () => {
  await seedGroups()
  await env.withSecurityRulesDisabled(ctx =>
    setDoc(doc(ctx.firestore(), 'assessments/ath2/history/2026-09-21'), { velo: '84' }))
  await assertFails(getDoc(doc(db('ath'), 'assessments/ath2/history/2026-09-21')))
})

// ── athlete groups ──
async function seedGroups() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/ath'), { role: 'athlete', groupIds: ['g1'] })
    await setDoc(doc(db, 'users/adm'), { role: 'admin' })
    await setDoc(doc(db, 'athleteGroups/g1'), { name: 'Winter Camp', color: 'blue' })
  })
}
await t('admin reads and writes groups', async () => {
  await seedGroups()
  await assertSucceeds(getDoc(doc(db('adm'), 'athleteGroups/g1')))
  await assertSucceeds(setDoc(doc(db('adm'), 'athleteGroups/g2'), { name: 'Travel Team', color: 'teal' }))
})
await t('athlete cannot read the coach\'s groups', async () => {
  await seedGroups()
  await assertFails(getDoc(doc(db('ath'), 'athleteGroups/g1')))
})
await t('athlete cannot create a group', async () => {
  await seedGroups()
  await assertFails(setDoc(doc(db('ath'), 'athleteGroups/g9'), { name: 'Mine' }))
})
await t('athlete cannot put themselves in a group', async () => {
  await seedGroups()
  await assertFails(updateDoc(doc(db('ath'), 'users/ath'), { groupIds: ['g1', 'g2'] }))
})
await t('admin can set membership on an athlete', async () => {
  await seedGroups()
  await assertSucceeds(updateDoc(doc(db('adm'), 'users/ath'), { groupIds: ['g1', 'g2'] }))
})

await env.cleanup()
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
