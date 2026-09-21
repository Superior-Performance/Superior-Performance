/**
 * Seeds the Firebase emulators with enough to click through both sides of the
 * app locally — a coach, two athletes, and a program of every type.
 *
 * Run indirectly with `npm run dev:emulator`, which starts the emulators, runs
 * this, then serves Vite with VITE_USE_EMULATORS=1. Nothing here touches the
 * real project: it talks to 127.0.0.1 only, and writes as the emulator's
 * "owner" credential, which bypasses security rules (use `npm run test:rules`
 * to exercise those instead).
 *
 * Accounts (password for all three: test1234)
 *   coach@example.com   admin
 *   inhouse@example.com athlete, in-house — dated weeks, one program per type
 *   remote@example.com  athlete, college remote — day-type program, no dates
 */
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-sp/databases/(default)/documents'
const PASSWORD = 'test1234'

// Firestore REST wants every value tagged with its type; this covers the
// handful of shapes the seed data actually uses.
function val(v) {
  if (v === null) return { nullValue: null }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  switch (typeof v) {
    case 'string': return { stringValue: v }
    case 'boolean': return { booleanValue: v }
    case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
    default: return { mapValue: { fields: fields(v) } }
  }
}
const fields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, val(v)]))

async function createUser(email) {
  const res = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  })
  const json = await res.json()
  if (!json.localId) throw new Error(`auth: ${JSON.stringify(json)}`)
  return json.localId
}

async function put(path, data) {
  const res = await fetch(`${FS}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: fields(data) }),
  })
  if (!res.ok) throw new Error(`firestore ${path}: ${await res.text()}`)
}

const ex = (name, category, extra = {}) => ({
  id: 'ex_' + Math.random().toString(36).slice(2, 10),
  name, category, sets: '3', reps: '10', intensity: '', notes: '', videoUrl: '', ...extra,
})

// A dated program: `weeks` of 7 days, the shape an in-house athlete's calendar
// walks with startDate + (week * 7) + (dayNum - 1).
function datedWeeks(weekCount, categories) {
  return Array.from({ length: weekCount }, (_, w) => ({
    weekNum: w + 1,
    days: Array.from({ length: 7 }, (_, d) => ({
      dayNum: d + 1,
      category: d % 3 === 0 ? 'Long Toss' : d % 3 === 1 ? 'Recovery' : 'Bullpen',
      // Rest day every 7th, so the calendar has empty cells to render too.
      exercises: d === 6 ? [] : categories.map(c => ex(`${c} drill ${d + 1}`, c)),
    })),
  }))
}

// A College Remote program: days carry `dayType` instead of a weekday, and the
// athlete picks a type rather than following dates. This is the shape that has
// to survive being switched over to an in-house athlete.
function dayTypeWeeks(dayTypes, categories) {
  return [{
    weekNum: 1,
    days: dayTypes.map((dt, i) => ({
      dayNum: i + 1,
      dayType: dt,
      category: '',
      exercises: categories.map(c => ex(`${c} ${dt}`, c)),
    })),
  }]
}

// A Mon/Wed/Fri block — the shape that broke the day strip: three day entries
// carrying dayNum 1, 3 and 5, so array position and day number disagree.
function gappedWeeks(weekCount, categories) {
  return Array.from({ length: weekCount }, (_, w) => ({
    weekNum: w + 1,
    days: [1, 3, 5].map(dayNum => ({
      dayNum,
      category: dayNum === 1 ? 'Long Toss' : dayNum === 3 ? 'Bullpen' : 'Recovery',
      exercises: categories.map(c => ex(`${c} day ${dayNum}`, c)),
    })),
  }))
}

const monday = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to this week's Monday
  return d.toISOString().slice(0, 10)
}

const run = async () => {
  const [coach, inhouse, remote] = await Promise.all([
    createUser('coach@example.com'),
    createUser('inhouse@example.com'),
    createUser('remote@example.com'),
  ])

  await put(`users/${coach}`, { name: 'Coach Ian', email: 'coach@example.com', role: 'admin', createdAt: new Date() })
  await put(`users/${inhouse}`, {
    name: 'Casey In-House', email: 'inhouse@example.com', role: 'athlete',
    athleteType: 'in_house', createdAt: new Date(),
  })
  await put(`users/${remote}`, {
    name: 'Riley Remote', email: 'remote@example.com', role: 'athlete',
    athleteType: 'remote', createdAt: new Date(),
  })

  const start = monday()
  const byType = {
    correctives: ['Mobilization', 'Correctives'],
    throwing: ['Catch Play', 'High-Intent Day Plyos'],
    lifting: ['Movement Activation'],
  }

  // One active program per type for the in-house athlete: four colors on one
  // calendar day is exactly the case the coloring work has to handle.
  let i = 0
  for (const [programType, categories] of Object.entries(byType)) {
    await put(`programs/seed-inhouse-${programType}`, {
      name: `${programType} block`, athleteId: inhouse, programType,
      totalWeeks: 4, startDate: start, active: true, weeks: datedWeeks(4, categories),
      createdAt: new Date(Date.now() - i++ * 1000),
    })
  }

  // Mobility runs Mon/Wed/Fri rather than daily — so the seeded athlete has
  // both shapes at once, which is also how the colour dots get a day with
  // some types scheduled and others not.
  await put('programs/seed-inhouse-gapped', {
    name: 'Mon/Wed/Fri mobility block', athleteId: inhouse, programType: 'mobility',
    totalWeeks: 4, startDate: start, active: true, createdAt: new Date(),
    weeks: gappedWeeks(4, ['Mobilization']),
  })

  await put('programs/seed-remote-throwing', {
    name: 'Remote throwing block', athleteId: remote, programType: 'throwing',
    totalWeeks: 1, active: true, createdAt: new Date(),
    weeks: dayTypeWeeks(['high_intent', 'medium', 'synergy', 'recovery'], ['Catch Play', 'Hybrid Day Plyos']),
  })
  await put('programs/seed-remote-lifting', {
    name: 'Remote lifting block', athleteId: remote, programType: 'lifting',
    totalWeeks: 1, active: true, createdAt: new Date(),
    weeks: dayTypeWeeks(['upper_1', 'lower_1', 'upper_2', 'lower_2'], ['Movement Activation']),
  })

  console.log(`Seeded emulator.
  coach@example.com   / ${PASSWORD}  (admin)
  inhouse@example.com / ${PASSWORD}  (in-house, dated programs from ${start}, incl. a Mon/Wed/Fri one)
  remote@example.com  / ${PASSWORD}  (college remote, day-type programs)`)
}

run().catch(err => { console.error(err); process.exit(1) })
