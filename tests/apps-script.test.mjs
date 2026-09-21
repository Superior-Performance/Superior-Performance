// Runs apps-script/*.gs in a vm with minimal Apps Script shims, against the
// Firestore emulator (which accepts unsigned JWTs but still enforces rules).
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-sp',
  firestore: { rules: readFileSync(`${ROOT}/firestore.rules`, 'utf8'), host: '127.0.0.1', port: 8080 },
})

function load(file, { quota = 100 } = {}) {
  const sent = []
  const cache = new Map()
  const props = { FIREBASE_PROJECT_ID: 'demo-sp', FIRESTORE_BASE: 'http://127.0.0.1:8080' }
  const ctx = {
    sent,
    JSON, Date, Number, String, Object, Infinity,
    MailApp: { sendEmail: (m) => sent.push(m), getRemainingDailyQuota: () => quota },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
    SpreadsheetApp: { openById: () => { throw new Error('no sheet') } },
    Utilities: {
      base64DecodeWebSafe: (s) => Buffer.from(s, 'base64url'),
      newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
      formatDate: (d, tz, f) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
        .format(d).replace(/\D/g, '').slice(0, f.length === 10 ? 10 : 8),
      // Only 'yyyy-MM-dd HH:mm' in America/Chicago (CDT, -05:00) is used.
      parseDate: (s) => new Date(s.replace(' ', 'T') + ':00-05:00'),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const r = syncFetch(url, opts.headers.Authorization)
        return { getResponseCode: () => r.status, getContentText: () => r.body }
      },
    },
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(`${ROOT}/apps-script/${file}`, 'utf8'), ctx)
  return ctx
}

// UrlFetchApp is synchronous; emulate with a child process.
import { execFileSync } from 'node:child_process'
function syncFetch(url, auth) {
  const out = execFileSync('curl', ['-s', '-o', '-', '-w', '\n%{http_code}', '-H', `Authorization: ${auth}`, url]).toString()
  const i = out.lastIndexOf('\n')
  return { status: Number(out.slice(i + 1)), body: out.slice(0, i) }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: uid, user_id: uid, aud: 'demo-sp', iss: 'https://securetoken.google.com/demo-sp',
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: 1,
  firebase: { sign_in_provider: 'password' },
})}.`

const soon = new Date(Date.now() + 3 * 3600e3)
const later = new Date(Date.now() + 72 * 3600e3)
const central = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  .reduce((a, p) => ({ ...a, [p.type]: p.value }), {})
const slotAt = (d) => { const c = central(d); return { date: `${c.year}-${c.month}-${c.day}`, startTime: `${c.hour}:${c.minute}`, endTime: '23:59' } }

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore()
  await setDoc(doc(db, 'users/ath'), { role: 'athlete', name: 'Real Athlete' })
  await setDoc(doc(db, 'users/ath2'), { role: 'athlete', name: 'Other Athlete' })
  await setDoc(doc(db, 'facilitySlots/booked'), { ...slotAt(later), capacity: 4, bookedCount: 1 })
  await setDoc(doc(db, 'facilitySlots/booked/bookings/ath'), { athleteName: 'spoofed name' })
  await setDoc(doc(db, 'facilitySlots/soon'), { ...slotAt(soon), capacity: 4, bookedCount: 0 })
  await setDoc(doc(db, 'facilitySlots/far'), { ...slotAt(later), capacity: 4, bookedCount: 0 })
  for (let i = 0; i < 8; i++) await setDoc(doc(db, `facilitySlots/s${i}`), { ...slotAt(soon), capacity: 4, bookedCount: 0 })
  // Slots the athlete genuinely cancelled: booking gone, receipt left behind.
  await setDoc(doc(db, 'facilitySlots/soonbooked'), { ...slotAt(soon), capacity: 4, bookedCount: 0 })
  await setDoc(doc(db, 'facilityCancellations/ath2/slots/soonbooked'), { cancelledAt: new Date() })
  await setDoc(doc(db, 'facilityCancellations/ath2/slots/far'), { cancelledAt: new Date() })
  for (let i = 0; i < 8; i++) await setDoc(doc(db, `facilityCancellations/ath/slots/s${i}`), { cancelledAt: new Date() })
})

let failures = 0
function check(name, cond, detail) { if (cond) console.log('ok  ', name); else { failures++; console.log('FAIL', name, detail ?? '') } }
const post = (g, body) => g.doPost({ postData: { contents: JSON.stringify(body) } })

{
  const g = load('booking-notify.gs')
  let r = post(g, { type: 'book', slotId: 'booked', idToken: token('ath') })
  check('real booking emails', r.success && g.sent.length === 1, JSON.stringify(r))
  check('name comes from users doc, not booking', g.sent[0]?.subject.includes('Real Athlete'), g.sent[0]?.subject)
  check('fill shows 1 of 4', g.sent[0]?.body.includes('1 of 4 booked'), g.sent[0]?.body)
  r = post(g, { type: 'book', slotId: 'booked', idToken: token('ath') })
  check('duplicate book ping suppressed', g.sent.length === 1, JSON.stringify(r))
  r = post(g, { type: 'book', slotId: 'far', idToken: token('ath2') })
  check('book ping without booking refused', !r.success && g.sent.length === 1, JSON.stringify(r))
  r = post(g, { type: 'book', slotId: 'booked', idToken: 'garbage' })
  check('garbage token refused', !r.success && g.sent.length === 1, JSON.stringify(r))
  r = post(g, { type: 'book', slotId: 'booked', idToken: '' })
  check('missing token refused', !r.success, JSON.stringify(r))
  r = post(g, { type: 'book', slotId: '../users/ath', idToken: token('ath') })
  check('path-injection slotId refused', !r.success, JSON.stringify(r))
  r = post(g, { type: 'book', slotId: 'booked', idToken: token('rando') })
  check('role-less/unknown user refused', !r.success && g.sent.length === 1, JSON.stringify(r))
  // Forged: ath2 never booked 'soon', so there is no cancellation receipt.
  // This used to email the coach — the test asserted it as correct.
  r = post(g, { type: 'cancel', slotId: 'soon', idToken: token('ath2') })
  check('cancel without a receipt refused', !r.success && g.sent.length === 1, JSON.stringify(r))
  // Real: seeded with the receipt a genuine cancellation leaves behind.
  r = post(g, { type: 'cancel', slotId: 'soonbooked', idToken: token('ath2') })
  check('late cancel with a receipt emails', r.success && g.sent.length === 2 && g.sent[1].subject.startsWith('Late cancellation - Other Athlete'), JSON.stringify(r))
  r = post(g, { type: 'cancel', slotId: 'far', idToken: token('ath2') })
  check('early cancel silent', r.success && r.skipped && g.sent.length === 2, JSON.stringify(r))
  r = post(g, { type: 'cancel', slotId: 'booked', idToken: token('ath') })
  check('cancel ping while still booked refused', !r.success && g.sent.length === 2, JSON.stringify(r))
  check('GET never sends', g.doGet({ parameter: { athlete: 'x', date: '2026-01-01', startTime: '10:00' } }).success === false && g.sent.length === 2)
  // per-athlete daily cap: a fresh slot each time (s0..s7, seeded above)
  const g2 = load('booking-notify.gs')
  for (let i = 0; i < 8; i++) post(g2, { type: 'cancel', slotId: `s${i}`, idToken: token('ath') })
  check('per-athlete daily cap holds at 6', g2.sent.length === 6, g2.sent.length)
}

{
  const g = load('inquiry.gs')
  const ask = (p) => g.doGet({ parameter: { name: 'N', email: 'a@b.co', message: 'hi', ...p } })
  let r = ask({})
  check('inquiry sends', r.success && g.sent.length === 1)
  r = ask({})
  check('same sender within 10 min suppressed but reports success', r.success && g.sent.length === 1)
  r = ask({ email: 'nope' })
  check('bad email rejected', !r.success)
  r = ask({ name: '' })
  check('missing name rejected', !r.success)
  for (let i = 0; i < 20; i++) ask({ email: `x${i}@b.co` })
  check('hourly cap holds at 6', g.sent.length === 6, g.sent.length)
  const g3 = load('inquiry.gs')
  g3.doGet({ parameter: { name: 'N', email: 'long@b.co', message: 'y'.repeat(10000) } })
  check('message clipped to 4000', g3.sent[0]?.body.length < 4200, g3.sent[0]?.body.length)
  const g4 = load('inquiry.gs', { quota: 40 })
  r = g4.doGet({ parameter: { name: 'N', email: 'a@b.co', message: 'hi' } })
  check('quota reserve protects booking alerts', r.success && g4.sent.length === 0)
}

await env.cleanup()
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
