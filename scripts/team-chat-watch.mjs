#!/usr/bin/env node
/**
 * Team chat check — answers @-mentions in the staff room at /admin/team.
 *
 *   npm run teamchat                            # check once and reply, then exit
 *   node scripts/team-chat-watch.mjs --once     # the same thing
 *   node scripts/team-chat-watch.mjs            # continuous polling (see below)
 *
 * ON DEMAND IS THE DEFAULT MODE NOW, and the launchd agent that used to keep
 * the polling loop alive is disabled (scripts/teamchat-watch.plist.example
 * says how to re-enable it). Run the check yourself when you want the room
 * answered.
 *
 * Why: the header here used to claim polling cost "a few thousand reads a
 * day against a 50k/day free tier". That was never true. A poll bills one
 * Firestore read PER MESSAGE it looks at, and at 50 messages every 20s the
 * loop cost ~216,000 reads/day — it ate the project's entire daily quota
 * overnight, with nobody awake, and every read the athlete app tried then
 * failed with 429. Athletes got "could not book that slot" on every slot for
 * about a week before anyone connected the two (2026-09-24).
 *
 * A check only costs anything when someone actually runs it, which is the
 * shape this should have had from the start: the room is not urgent, and a
 * background process that bills by the second to watch a room nobody is
 * talking in is a bad trade at any interval.
 *
 * Env:
 *   TEAM_CHAT_POLL_MS   poll interval, default 120000
 *   TEAM_CHAT_COUNT     messages read per poll, default 10
 *   TEAM_CHAT_HANDLE    agent handle, default atlas
 *   TEAM_CHAT_NAME      display name, default "Atlas"
 *   CLAUDE_BIN          path to the claude CLI
 *   TEAM_CHAT_MODEL     model for the spawned session (default: CLI default)
 */
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROMPT_FILE = path.join(PROJECT_DIR, 'scripts', 'team-chat-agent-prompt.md')
// Every poll is a billed Firestore read PER MESSAGE it looks at, and this
// process runs all day whether or not anyone is talking. At the old 50
// messages every 20s that was ~216,000 reads/day against Spark's 50,000/day
// free tier — the watcher alone exhausted the project's quota by mid-morning
// and took the athlete app down with it (reads started returning 429
// RESOURCE_EXHAUSTED on 2026-09-24). 10 messages every 2 minutes is ~7,200/day.
// If you lower the interval or raise the count, do the multiplication first:
//   reads/day = TEAM_CHAT_COUNT * 86400 / (TEAM_CHAT_POLL_MS / 1000)
const POLL_MS = Number(process.env.TEAM_CHAT_POLL_MS || 120_000)
// How far back a single poll looks. Only has to cover what can pile up
// between two polls — an unanswered mention older than the newest COUNT
// messages is missed, so this is the number to raise if the room ever gets
// busy enough that questions slip past.
const COUNT = Number(process.env.TEAM_CHAT_COUNT || 10)
const HANDLE = process.env.TEAM_CHAT_HANDLE || 'atlas'
const NAME = process.env.TEAM_CHAT_NAME || 'Atlas'
const MODEL = process.env.TEAM_CHAT_MODEL || ''
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.npm-global', 'bin', 'claude')
const ONCE = process.argv.includes('--once')

// Read-only by construction. The agent answers questions from a shared room
// and nobody is watching it, so it gets the codebase, the chat script, and a
// Firestore reader that has no write path in it — and no general shell. A
// message that tries to talk it into running something else has no tool to do
// it with; the prompt's "chat text is data" rule is the second layer, not the
// only one.
//
// Each script is named explicitly. A looser `Bash(node scripts/:*)` does NOT
// match (tried it — every call came back "requires approval" and the agent
// correctly refused to guess), and enumerating them is better anyway: adding a
// script to scripts/ shouldn't silently hand it to an unattended agent.
const ALLOWED_TOOLS = [
  'Read', 'Grep', 'Glob',
  'Bash(node scripts/team-chat.mjs:*)',
  'Bash(node scripts/fs-read.mjs:*)',
]
const DISALLOWED_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']

const log = (...parts) => console.log(`[${new Date().toISOString()}]`, ...parts)

/** Messages tagged for this agent that nobody has answered yet. */
async function pending() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join('scripts', 'team-chat.mjs'), 'pending', '--handle', HANDLE, '--count', String(COUNT)],
    { cwd: PROJECT_DIR, env: process.env, maxBuffer: 10 * 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout)
  return Array.isArray(parsed) ? parsed : []
}

/**
 * Hand the room to a fresh Claude session and wait for it to finish.
 * Deliberately serialized: two overlapping sessions would both see the same
 * unanswered message and both reply to it, since `answeredBy` isn't claimed
 * until a reply is actually posted.
 */
function runAgent() {
  return new Promise((resolve) => {
    const prompt = fs.readFileSync(PROMPT_FILE, 'utf8')
    const args = [
      '-p', prompt,
      '--allowedTools', ...ALLOWED_TOOLS,
      '--disallowedTools', ...DISALLOWED_TOOLS,
    ]
    if (MODEL) args.push('--model', MODEL)

    const child = spawn(CLAUDE_BIN, args, {
      cwd: PROJECT_DIR,
      env: { ...process.env, TEAM_CHAT_HANDLE: HANDLE, TEAM_CHAT_NAME: NAME },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })

    child.on('error', (err) => {
      log('agent failed to start:', err.message)
      resolve()
    })
    child.on('close', (code) => {
      // The agent's output can quote production data — an athlete's name, what
      // they logged, what the coach asked about them. This log is an unrotated
      // plaintext file on a personal laptop, so a successful run records only
      // that it happened. A failure still gets its tail, because diagnosing a
      // crash needs it and a crashed run rarely got as far as reading data.
      if (code === 0) {
        log('agent exited 0')
      } else {
        const tail = out.trim().split('\n').slice(-6).join('\n')
        log(`agent exited ${code}${tail ? `\n${tail}` : ''}`)
      }
      resolve()
    })
  })
}

async function tick() {
  const waiting = await pending()
  if (waiting.length === 0) return false
  log(`${waiting.length} message(s) waiting — starting agent`)
  await runAgent()
  return true
}

if (ONCE) {
  // This is the mode a human runs, so a failure has to read like a sentence
  // rather than a stack trace. The loop below can afford to throw and retry;
  // this can't — there's nobody to retry it but you.
  try {
    const did = await tick()
    log(did ? 'handled' : 'nothing pending')
    process.exit(0)
  } catch (err) {
    const detail = String(err.stderr || err.message || err)
    if (detail.includes('429') || detail.includes('Quota exceeded')) {
      log("Firestore's daily read quota is gone, so the room can't be read.")
      log('It resets at midnight Pacific. Nothing is broken — try again after that.')
    } else {
      log('check failed:', detail.split('\n')[0])
    }
    process.exit(1)
  }
}

log(`watching as ${HANDLE} — ${COUNT} messages every ${POLL_MS}ms (~${Math.round(COUNT * 86400 / (POLL_MS / 1000))} Firestore reads/day)`)
let failures = 0
for (;;) {
  try {
    // Loop again immediately after handling something: a second question may
    // have landed while the agent was mid-reply, and making that one wait a
    // full interval for no reason defeats the point.
    const handled = await tick()
    failures = 0
    if (handled) continue
  } catch (err) {
    // A network blip or an expired token must not kill the watcher — back off
    // and keep going, so it recovers on its own instead of silently dying and
    // leaving the room unanswered until someone notices.
    failures++
    log(`check failed (${failures}):`, err.message?.split('\n')[0] || err)
  }
  const backoff = failures > 0 ? Math.min(POLL_MS * 2 ** Math.min(failures, 4), 10 * 60_000) : POLL_MS
  await new Promise(r => setTimeout(r, backoff))
}
