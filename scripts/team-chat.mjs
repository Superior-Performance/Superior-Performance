#!/usr/bin/env node
/**
 * Team chat CLI — how a scheduled Claude Code session participates in the
 * staff room at /admin/team.
 *
 * The web app talks to Firestore through the client SDK as a signed-in admin.
 * An agent has no browser and no Firebase Auth session, so it goes through the
 * Firestore REST API using the OAuth token that `firebase login` already
 * stored on this machine. That token carries project-owner IAM, which bypasses
 * security rules the same way the Admin SDK would — so whoever runs this must
 * already have owner/editor on the Firebase project.
 *
 * Commands:
 *   node scripts/team-chat.mjs read [--count 50]
 *       Recent messages, oldest first, as JSON.
 *
 *   node scripts/team-chat.mjs pending [--handle atlas] [--count 50]
 *       Only messages that @-mention this agent and nobody has answered yet.
 *       This is the "do I have work?" call — exits 0 with [] when idle.
 *
 *   node scripts/team-chat.mjs post --text "..." [--handle atlas]
 *                                   [--name "Atlas"] [--answers <msgId>]
 *       Post a reply. --answers marks that message handled so the next
 *       wake-up doesn't answer it a second time.
 *
 * Env:
 *   TEAM_CHAT_HANDLE   default agent handle (else "atlas")
 *   TEAM_CHAT_NAME     default display name (else "Atlas")
 *   FB_ACCOUNT         which stored firebase login to use
 *                      (else superiorperformance.sp@gmail.com, else the first)
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'superior-performance-ba102'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

// Not a secret: firebase-tools ships this exact pair in every install, so it's
// public by construction. The *refresh token* in the configstore below is the
// sensitive half — it stays on disk and is never printed.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

// ── args ─────────────────────────────────────────────────────────────────────
const [, , command, ...rest] = process.argv
const args = {}
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i]?.startsWith('--')) args[rest[i].slice(2)] = rest[i + 1]
}
const HANDLE = (args.handle || process.env.TEAM_CHAT_HANDLE || 'atlas').toLowerCase()
const NAME = args.name || process.env.TEAM_CHAT_NAME || 'Atlas'
const COUNT = Number(args.count || 50)

// ── auth ─────────────────────────────────────────────────────────────────────
async function accessToken() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (!fs.existsSync(cfgPath)) {
    throw new Error('No firebase-tools login found. Run `firebase login` first.')
  }
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
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: picked.tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(json))
  return json.access_token
}

// ── Firestore typed values ───────────────────────────────────────────────────
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

// Mirrors parseMentions/mentionsAgent in src/utils/teamChat.js. Duplicated
// rather than imported because that module is ESM inside the Vite app and this
// script runs standalone — if the handle grammar changes, change both.
const MENTION_RE = /@([a-z][a-z0-9_-]{0,30})\b/gi
const HANDLE_ALIASES = { claude: 'atlas' }   // pre-naming habit, resolves to Jake's agent
const parseMentions = (text) =>
  [...new Set([...String(text || '').matchAll(MENTION_RE)]
    .map(m => m[1].toLowerCase())
    .map(h => HANDLE_ALIASES[h] || h))]
const addressesMe = (mentions, handle) =>
  Array.isArray(mentions) && mentions.includes(handle)

// ── data ─────────────────────────────────────────────────────────────────────
async function recentMessages(token, count) {
  // runQuery rather than a plain collection GET: the REST list endpoint has no
  // ordering, and we specifically want the NEWEST n, not an arbitrary n.
  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'teamChat' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: count,
      },
    }),
  })
  if (!res.ok) throw new Error(`runQuery failed ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows.filter(r => r.document).map(r => docToObj(r.document)).reverse()
}

async function post(token, { text, answers }) {
  const body = {
    fields: {
      text: { stringValue: text },
      authorId: { stringValue: HANDLE },
      authorName: { stringValue: NAME },
      authorType: { stringValue: 'claude' },
      mentions: { arrayValue: { values: parseMentions(text).map(m => ({ stringValue: m })) } },
      answeredBy: { nullValue: null },
      createdAt: { timestampValue: new Date().toISOString() },
    },
  }
  const res = await fetch(`${BASE}/teamChat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`post failed ${res.status}: ${await res.text()}`)
  const created = docToObj(await res.json())

  if (answers) {
    // Mark the question handled only AFTER the reply is safely written — the
    // other order risks marking it answered and then failing to post, which
    // would silently swallow the question forever.
    const mark = await fetch(
      `${BASE}/teamChat/${answers}?updateMask.fieldPaths=answeredBy`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { answeredBy: { stringValue: HANDLE } } }),
      },
    )
    if (!mark.ok) {
      throw new Error(`posted ${created.id} but failed to mark ${answers} answered: ${mark.status}`)
    }
  }
  return created
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  const token = await accessToken()

  if (command === 'read') {
    console.log(JSON.stringify(await recentMessages(token, COUNT), null, 2))

  } else if (command === 'pending') {
    const messages = await recentMessages(token, COUNT)
    const pending = messages.filter(m =>
      m.authorType === 'human' && !m.answeredBy && addressesMe(m.mentions, HANDLE))
    console.log(JSON.stringify(pending, null, 2))

  } else if (command === 'post') {
    if (!args.text) throw new Error('post requires --text')
    const created = await post(token, { text: args.text, answers: args.answers })
    console.log(JSON.stringify({ ok: true, id: created.id, answered: args.answers || null }, null, 2))

  } else {
    console.error('Usage: team-chat.mjs <read|pending|post> [options] — see header comment.')
    process.exit(2)
  }
} catch (err) {
  console.error(String(err.message || err))
  process.exit(1)
}
