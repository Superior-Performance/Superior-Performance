#!/usr/bin/env node
/**
 * One-off: give every program document an explicit `archived` boolean.
 *
 *   node scripts/backfill-archived-flag.mjs           # dry run
 *   node scripts/backfill-archived-flag.mjs --apply   # writes
 *
 * Rehearse it against the emulator first:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill-archived-flag.mjs --apply
 *
 * Why this exists: Firestore cannot query for the absence of a field.
 * `where('archived','==',false)` returns nothing for a document that simply
 * doesn't have `archived`, and until 2026-09-24 the field was only ever
 * written when a program was archived — so most documents don't have it.
 *
 * That blocks the fix that matters for the admin dashboard. Archived programs
 * are the only part of the programs collection that grows without bound (one
 * more per athlete every time a block is superseded), the dashboard has no use
 * for them, and it can't exclude them in the query until they can be
 * identified by one. createProgram now sets `archived: false` on new
 * documents; this backfills the rest.
 *
 * Writes only. Sets `archived: false` on documents that lack the field, and
 * never touches one that already has it — so an archived program stays
 * archived and re-running this changes nothing.
 *
 * After it reports 0 remaining, getAssignedPrograms in src/firebase/
 * firestore.js can add `where('archived','==',false)`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = process.env.FIRESTORE_EMULATOR_HOST ? 'demo-sp' : 'superior-performance-ba102'
// Honours FIRESTORE_EMULATOR_HOST the way the Firebase tooling does, so this
// can be rehearsed against `npm run dev:emulator` before it is pointed at
// production. A write script nobody has ever run is not a safe write script.
const BASE = process.env.FIRESTORE_EMULATOR_HOST
  ? `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
// Public by construction — firebase-tools ships this pair in every install.
// The refresh token read below is the sensitive half and is never printed.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const APPLY = process.argv.includes('--apply')

async function accessToken() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return 'owner'   // emulator accepts any bearer
  const cfg = JSON.parse(fs.readFileSync(
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'))
  const accounts = [
    { email: cfg.user?.email, tokens: cfg.tokens },
    ...(cfg.additionalAccounts || []).map(a => ({ email: a.user?.email, tokens: a.tokens })),
  ].filter(a => a.tokens?.refresh_token)
  const picked = accounts.find(a => a.email === (process.env.FB_ACCOUNT || 'superiorperformance.sp@gmail.com')) || accounts[0]
  if (!picked) throw new Error('No firebase login found — run `firebase login` first.')
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

async function main() {
  const token = await accessToken()
  const H = { Authorization: `Bearer ${token}` }

  const docs = []
  let pageToken
  do {
    const url = `${BASE}/programs?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, { headers: H })
    if (res.status === 429) {
      console.error("Firestore's daily read quota is gone — this needs to read every")
      console.error('program document first. It resets at midnight Pacific; try then.')
      process.exit(1)
    }
    if (!res.ok) throw new Error(`programs read failed ${res.status}: ${await res.text()}`)
    const json = await res.json()
    docs.push(...(json.documents || []))
    pageToken = json.nextPageToken
  } while (pageToken)

  const missing = docs.filter(d => d.fields?.archived === undefined)
  const already = docs.length - missing.length

  console.log(`${APPLY ? 'WRITING' : 'DRY RUN'} — ${docs.length} programs, ${already} already have the field, ${missing.length} to set`)
  for (const d of missing.slice(0, 20)) {
    const f = d.fields || {}
    console.log(`  ${d.name.split('/').pop()}  "${f.name?.stringValue || '(unnamed)'}"  active=${f.active?.booleanValue}  athleteId=${f.athleteId?.stringValue ?? 'none'}`)
  }
  if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`)

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to set archived: false on those.')
    return
  }

  let written = 0
  for (const d of missing) {
    // updateMask scoped to the one field, so nothing else on the document can
    // be disturbed by this.
    const res = await fetch(`${BASE}/${d.name.split('/documents/')[1]}?updateMask.fieldPaths=archived`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { archived: { booleanValue: false } } }),
    })
    if (!res.ok) {
      console.error(`  FAILED ${d.name.split('/').pop()}: ${res.status} ${await res.text()}`)
      continue
    }
    written++
  }
  console.log(`\nSet archived: false on ${written} of ${missing.length}.`)
  if (written === missing.length) {
    console.log('All programs now carry the field — getAssignedPrograms can add')
    console.log("where('archived','==',false).")
  }
}

main().catch(err => { console.error(String(err.message || err)); process.exit(1) })
