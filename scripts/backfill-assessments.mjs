#!/usr/bin/env node
/**
 * One-off: seed each athlete's assessment history from the Assessment Intake
 * sheet.
 *
 * The app only started keeping a copy of each assessment on 2026-09-21
 * (assessments/{uid}/history/{date}); before that a re-screen overwrote the
 * previous one. The sheet, however, has been append-only the whole time, so
 * every assessment ever logged through "Log to Intake Sheet" is still a row in
 * it. This turns those rows into history entries.
 *
 * Deliberately separate from scripts/fs-read.mjs, which is the agent's tool
 * and is read-only by construction. This one writes, is run by a human, and
 * refuses to do anything until asked twice:
 *
 *   node scripts/backfill-assessments.mjs <rows.json>            # dry run
 *   node scripts/backfill-assessments.mjs <rows.json> --apply    # writes
 *
 * `rows.json` is the intake tab as an array of arrays (the sheet's own column
 * order, header row included) — export it however is convenient; the point is
 * that the data passes through a file a human can look at before it is
 * written to production.
 *
 * Safety properties:
 *   - only ever creates assessments/{uid}/history/{YYYY-MM-DD}
 *   - never touches assessments/{uid} itself, the athlete's current values
 *   - skips a date that already has an entry, so re-running changes nothing
 *   - skips rows it cannot confidently match to exactly one athlete
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'superior-performance-ba102'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

// Sheet column order, left to right — identical to the `columns` array in the
// Apps Script that appends these rows (see ASSESSMENT_APPS_SCRIPT_CODE in
// AdminSettingsPage). Position is the mapping; the header text is only used
// to sanity-check that the sheet hasn't been reordered underneath us.
const COLUMNS = [
  'athleteName', 'assessmentDate', 'age', 'ageBracket', 'trainingAge',
  'sportPosition', 'handedness', 'injuryHistory', 'isaReading', 'compressionSigns',
  'shoulderERLeft', 'shoulderERRight', 'activeShoulderERTestLeft', 'activeShoulderERTestRight',
  'shoulderIRLimitedLeft', 'shoulderIRLimitedRight', 'hipIRLimitedLeft', 'hipIRLimitedRight',
  'hipERLimitedLeft', 'hipERLimitedRight', 'hipExtension', 'hamstringTest', 'splitsTest',
  'ankleDorsiflexionLeft', 'ankleDorsiflexionRight', 'shoulderFlexion', 'tSpineRotation',
  'tSpineExtension', 'tSpineFlexion', 'pecTest', 'elbowPainType', 'flexorForearmTightness',
  'ribFlare', 'scapControl', 'postureFeet', 'posturePelvis', 'postureUpperBody', 'otherNotes',
  'mode', 'trainingPhase', 'programLengthWeeks',
]

// Rows that are examples or test data, not athletes.
const SKIP_NAMES = [/^example/i, /^test\b/i, /^zzz/i, /^big hitter$/i]

const APPLY = process.argv.includes('--apply')
const rowsFile = process.argv.slice(2).find(a => !a.startsWith('--'))
if (!rowsFile) {
  console.error('Usage: backfill-assessments.mjs <rows.json> [--apply]')
  process.exit(2)
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** YYYY-MM-DD, or null if the cell isn't a date we can file under. */
function dateKey(raw) {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) // 8/14/2026
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime()) && s.length > 5) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }
  return null
}

async function accessToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accounts = [
    { email: cfg.user?.email, tokens: cfg.tokens },
    ...(cfg.additionalAccounts || []).map(a => ({ email: a.user?.email, tokens: a.tokens })),
  ].filter(a => a.tokens?.refresh_token)
  const picked = accounts.find(a => a.email === (process.env.FB_ACCOUNT || 'superiorperformance.sp@gmail.com')) || accounts[0]
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: picked.tokens.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Token refresh failed')
  return json.access_token
}

const str = (v) => ({ stringValue: String(v) })

async function main() {
  const raw = JSON.parse(fs.readFileSync(rowsFile, 'utf8'))
  const [header, ...dataRows] = raw
  if (norm(header[0]) !== 'athlete name' || norm(header[1]) !== 'assessment date') {
    throw new Error(`Unexpected sheet columns — first two are "${header[0]}", "${header[1]}". Reordered sheet?`)
  }

  const token = await accessToken()

  // Athletes, by normalised name. A duplicated name is left unmatched on
  // purpose: guessing which of two athletes a screening belongs to is worse
  // than leaving it for a human.
  const usersRes = await fetch(`${BASE}/users?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } })
  const users = (await usersRes.json()).documents || []
  const byName = new Map()
  for (const u of users) {
    const f = u.fields || {}
    if (f.role?.stringValue !== 'athlete') continue
    const key = norm(f.name?.stringValue)
    if (!key) continue
    byName.set(key, byName.has(key) ? 'DUPLICATE' : u.name.split('/').pop())
  }

  const plan = []
  const skipped = []

  for (const row of dataRows) {
    const name = row[0]
    if (!String(name || '').trim()) continue
    if (SKIP_NAMES.some(re => re.test(String(name).trim()))) {
      skipped.push({ name, why: 'example/test row' })
      continue
    }
    let uid = byName.get(norm(name))
    let matchNote = ''
    if (!uid) {
      // The sheet is often typed with a first name only. Accept that only
      // when exactly one athlete's name starts with it — two candidates is
      // a coin flip, and a coin flip files someone's screening under the
      // wrong athlete.
      const candidates = [...byName.entries()].filter(([full]) => full.startsWith(norm(name) + ' '))
      if (candidates.length === 1 && candidates[0][1] !== 'DUPLICATE') {
        uid = candidates[0][1]
        matchNote = ` (matched to "${candidates[0][0]}" by first name)`
      } else if (candidates.length > 1) {
        skipped.push({ name, why: `ambiguous — could be ${candidates.map(c => c[0]).join(' or ')}` })
        continue
      }
    }
    if (!uid) { skipped.push({ name, why: 'no athlete with that name' }); continue }
    if (uid === 'DUPLICATE') { skipped.push({ name, why: 'two athletes share this name' }); continue }

    const key = dateKey(row[1])
    if (!key) { skipped.push({ name, why: `unreadable date "${row[1]}"` }); continue }

    const fields = {}
    COLUMNS.forEach((col, i) => {
      if (col === 'athleteName') return // the athlete is the document's parent
      const v = row[i]
      if (v === undefined || v === null || String(v).trim() === '') return
      fields[col] = str(String(v).trim())
    })
    plan.push({ name, uid, key, fields, matchNote, fieldCount: Object.keys(fields).length })
  }

  // The sheet is append-only, so an athlete re-logging the same assessment
  // date appears as several rows. That is one assessment, and the last row is
  // the most recent version of it — collapse rather than writing each in turn
  // and letting the last silently win.
  const collapsed = new Map()
  let duplicates = 0
  for (const p of plan) {
    const k = `${p.uid}/${p.key}`
    if (collapsed.has(k)) duplicates++
    collapsed.set(k, p)
  }
  plan.length = 0
  plan.push(...collapsed.values())

  // Never overwrite an entry that already exists — a later real save is more
  // authoritative than a sheet row from months ago.
  const existing = new Set()
  for (const uid of new Set(plan.map(p => p.uid))) {
    const res = await fetch(`${BASE}/assessments/${uid}/history`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) continue
    for (const d of (await res.json()).documents || []) existing.add(`${uid}/${d.name.split('/').pop()}`)
  }
  const toWrite = plan.filter(p => !existing.has(`${p.uid}/${p.key}`))
  const alreadyThere = plan.length - toWrite.length

  console.log(`${APPLY ? 'WRITING' : 'DRY RUN'} — ${toWrite.length} entr${toWrite.length === 1 ? 'y' : 'ies'} to create`)
  const byAthlete = {}
  for (const p of toWrite) (byAthlete[p.name] ||= []).push(p)
  for (const [name, entries] of Object.entries(byAthlete).sort()) {
    console.log(`  ${name}${entries[0].matchNote}: ${entries.map(e => `${e.key} (${e.fieldCount} fields)`).join(', ')}`)
  }
  if (duplicates) console.log(`  (${duplicates} duplicate row${duplicates === 1 ? '' : 's'} collapsed — same athlete, same date)`)
  if (alreadyThere) console.log(`  (${alreadyThere} already in history, left alone)`)
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`)
    for (const s of skipped) console.log(`  ${s.name} — ${s.why}`)
  }

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to write these.')
    return
  }

  let written = 0
  for (const p of toWrite) {
    const res = await fetch(`${BASE}/assessments/${p.uid}/history/${p.key}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { ...p.fields, backfilledFromSheet: { booleanValue: true } } }),
    })
    if (!res.ok) {
      console.error(`  FAILED ${p.name} ${p.key}: ${res.status} ${await res.text()}`)
      continue
    }
    written++
  }
  console.log(`\nWrote ${written} of ${toWrite.length}.`)
}

main().catch(err => { console.error(String(err.message || err)); process.exit(1) })
