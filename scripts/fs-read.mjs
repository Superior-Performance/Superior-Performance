#!/usr/bin/env node
/**
 * Read-only Firestore access for the team-chat agent.
 *
 * The agent answers questions in a shared room and runs unattended, so it gets
 * a tool that *cannot* write: this script only ever issues GET and runQuery,
 * and there is deliberately no code path here that POSTs, PATCHes or DELETEs.
 * That's the safety property — not a prompt rule the agent could be talked out
 * of, but a capability it doesn't have.
 *
 * Auth is the firebase-tools OAuth token already on this machine (project-owner
 * IAM, so it bypasses security rules the way the Admin SDK would). Whoever runs
 * this must already have owner/editor on the Firebase project.
 *
 * Commands:
 *   node scripts/fs-read.mjs collections
 *       Root collection ids.
 *
 *   node scripts/fs-read.mjs count <collection>
 *       How many documents. Uses a projection so it doesn't drag bodies over
 *       the wire just to count them.
 *
 *   node scripts/fs-read.mjs list <collection> [--count 50] [--fields a,b,c]
 *       Documents, newest-agnostic (natural order). `--fields` is strongly
 *       recommended: a `programs` doc carries its entire weeks/days/exercises
 *       tree, so an unprojected list of 70 of them is megabytes of JSON that
 *       will blow up the agent's context for no benefit.
 *
 *   node scripts/fs-read.mjs get <collection> <docId> [--fields a,b,c]
 *
 * Env:
 *   FB_ACCOUNT   which stored firebase login to use
 *                (else superiorperformance.sp@gmail.com, else the first)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'superior-performance-ba102'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

// Public by construction — firebase-tools ships this pair in every install.
// The refresh token read below is the sensitive half and is never printed.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const [, , command, ...rest] = process.argv
const positional = rest.filter(a => !a.startsWith('--'))
const flags = {}
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]
}
const COUNT = Math.min(Number(flags.count || 50), 500)
const FIELDS = flags.fields ? String(flags.fields).split(',').map(s => s.trim()).filter(Boolean) : null

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

function decode(v) {
  if (v == null || 'nullValue' in v) return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode)
  if ('mapValue' in v) return Object.fromEntries(
    Object.entries(v.mapValue.fields || {}).map(([k, val]) => [k, decode(val)]))
  return null
}
const docToObj = (d) => ({
  id: d.name.split('/').pop(),
  ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])),
})

const maskQuery = (fields) =>
  fields?.length ? fields.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&') : ''

async function listDocs(token, collection, { count, fields }) {
  const docs = []
  let pageToken = ''
  do {
    const params = [
      `pageSize=${Math.min(count - docs.length, 300)}`,
      pageToken ? `pageToken=${encodeURIComponent(pageToken)}` : '',
      maskQuery(fields),
    ].filter(Boolean).join('&')
    const res = await fetch(`${BASE}/${collection}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`GET ${collection} → ${res.status}: ${await res.text()}`)
    const json = await res.json()
    for (const d of json.documents || []) docs.push(d)
    pageToken = json.nextPageToken || ''
  } while (pageToken && docs.length < count)
  return docs.slice(0, count).map(docToObj)
}

try {
  const token = await accessToken()

  if (command === 'collections') {
    const res = await fetch(`${BASE}:listCollectionIds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    console.log(JSON.stringify((await res.json()).collectionIds || [], null, 2))

  } else if (command === 'count') {
    if (!positional[0]) throw new Error('count requires a collection')
    // Project down to __name__ only: counting shouldn't pull document bodies.
    const docs = await listDocs(token, positional[0], { count: 100_000, fields: ['__name__'] })
    console.log(JSON.stringify({ collection: positional[0], count: docs.length }, null, 2))

  } else if (command === 'list') {
    if (!positional[0]) throw new Error('list requires a collection')
    console.log(JSON.stringify(
      await listDocs(token, positional[0], { count: COUNT, fields: FIELDS }), null, 2))

  } else if (command === 'get') {
    const [collection, docId] = positional
    if (!collection || !docId) throw new Error('get requires <collection> <docId>')
    const params = maskQuery(FIELDS)
    const res = await fetch(`${BASE}/${collection}/${docId}${params ? `?${params}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`GET ${collection}/${docId} → ${res.status}`)
    console.log(JSON.stringify(docToObj(await res.json()), null, 2))

  } else {
    console.error('Usage: fs-read.mjs <collections|count|list|get> … — see header comment.')
    process.exit(2)
  }
} catch (err) {
  console.error(String(err.message || err))
  process.exit(1)
}
