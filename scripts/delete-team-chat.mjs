#!/usr/bin/env node
/**
 * One-off: delete the staff chat room.
 *
 * The team-chat feature was removed from the app on 2026-10-29 after its
 * watchers exhausted the project's 50,000 reads/day free tier and took the
 * athlete app offline (reads returned 429 for most of two days). Deleting the
 * documents is the half of that removal the code can't do:
 *
 * A watcher is a process on somebody's laptop holding project-owner
 * credentials. Those bypass security rules, so nothing deployed from here can
 * stop one — but a poll bills one read PER MESSAGE RETURNED, and a query that
 * matches nothing still bills the one-read minimum. Emptying the collection
 * therefore caps a stale watcher at ~1 read per poll instead of ~10, which is
 * the difference between ~1,300 reads an hour and ~180, without needing
 * access to the machine it runs on.
 *
 * Jake asked for deletion, not archival, on 2026-10-29. There is no backup:
 * once this runs the messages are gone.
 *
 * Requires --confirm. Idempotent — a second run reports 0 and exits clean.
 *
 *   node scripts/delete-team-chat.mjs            # dry run, counts only
 *   node scripts/delete-team-chat.mjs --confirm  # actually delete
 *
 * Needs the daily read quota to be available, since the documents have to be
 * listed before they can be deleted. Quota resets at midnight PACIFIC.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'superior-performance-ba102'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
const CONFIRM = process.argv.includes('--confirm')
const COLLECTIONS = ['teamChat', 'teamChatReads']

async function accessToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (!fs.existsSync(cfgPath)) throw new Error('No firebase-tools login. Run `firebase login`.')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accounts = [
    { email: cfg.user?.email, tokens: cfg.tokens },
    ...(cfg.additionalAccounts || []).map(a => ({ email: a.user?.email, tokens: a.tokens })),
  ].filter(a => a.tokens?.refresh_token)
  const want = process.env.FB_ACCOUNT || 'superiorperformance.sp@gmail.com'
  const picked = accounts.find(a => a.email === want) || accounts[0]
  if (!picked) throw new Error('No usable firebase login on this machine.')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: picked.tokens.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(json))
  return json.access_token
}

// Names only — no field masks, so this never pulls message text into a log.
async function listNames(token, collection) {
  const names = []
  let pageToken
  do {
    const params = new URLSearchParams({ pageSize: '300' })
    params.append('mask.fieldPaths', '__name__')
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`${BASE}/${collection}?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 429) throw new Error('Read quota exhausted — retry after midnight Pacific.')
    if (!res.ok) throw new Error(`list ${collection} → ${res.status}: ${await res.text()}`)
    const json = await res.json()
    ;(json.documents || []).forEach(d => names.push(d.name))
    pageToken = json.nextPageToken
  } while (pageToken)
  return names
}

let token
try {
  token = await accessToken()
} catch (err) {
  console.error(String(err.message || err))
  process.exit(1)
}

try {
for (const collection of COLLECTIONS) {
  const names = await listNames(token, collection)
  if (!names.length) { console.log(`${collection}: already empty`); continue }
  if (!CONFIRM) { console.log(`${collection}: ${names.length} document(s) would be deleted`); continue }

  let gone = 0
  const failed = []
  for (const name of names) {
    const res = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) gone++
    else failed.push(`${name.split('/').pop()} (${res.status})`)
  }
  console.log(`${collection}: deleted ${gone}/${names.length}`)
  if (failed.length) console.log(`  failed: ${failed.join(', ')}`)
}

if (!CONFIRM) console.log('\nDry run. Re-run with --confirm to delete. There is no backup.')
} catch (err) {
  // A quota 429 here is the expected failure on the day this was written, and
  // a stack trace is a poor way to say "come back after midnight".
  console.error(String(err.message || err))
  process.exit(1)
}
