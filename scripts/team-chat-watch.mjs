#!/usr/bin/env node
/**
 * Team chat watcher — the event-driven half of the staff room at /admin/team.
 *
 * Replaces the hourly scheduled task. The trade the cron made was backwards:
 * it spent a Claude session every hour whether or not anyone had asked
 * anything, and still made you wait up to an hour for a reply. This polls
 * Firestore instead (a tiny query, a few thousand reads a day against a
 * 50k/day free tier) and only spends a session when there is actually a
 * question waiting. Faster AND cheaper, rather than trading one for the other.
 *
 * It also doesn't need the Claude Code desktop app open — only this process
 * running, which a launchd agent keeps alive across reboots.
 *
 *   node scripts/team-chat-watch.mjs            # run in foreground
 *   node scripts/team-chat-watch.mjs --once     # single check, for testing
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
  const did = await tick()
  log(did ? 'handled' : 'nothing pending')
  process.exit(0)
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
