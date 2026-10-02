#!/usr/bin/env node
/**
 * Load the built site in a real browser and assert it renders something.
 *
 * This exists because of the 2026-10-01 outage. The build succeeded, the
 * bundle check passed, the deploy succeeded, and the site was blank for every
 * visitor for sixteen hours — Firebase threw at module load, before React
 * mounted, so there was no error boundary and nothing in the UI. Every step
 * did what it was asked. Nothing in the pipeline ever loaded the page.
 *
 * Static checks can't catch this class of fault: the file is perfectly valid
 * JavaScript, it just throws when run. The only honest test is to run it.
 *
 * Deliberately dependency-free — it serves dist/ from node:http and drives
 * headless Chrome over the DevTools Protocol using Node's built-in WebSocket,
 * the same approach brand/motion/render.mjs already uses. Adding Playwright
 * for this would pull several hundred megabytes to answer one question.
 *
 *   node scripts/smoke-test.mjs
 *
 * Runs automatically before every `firebase deploy` via the predeploy hook in
 * firebase.json, so a broken bundle cannot reach production even if someone
 * builds it by hand.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, access } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'

const DIST = 'dist'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROUTES = ['/', '/login']          // public shell + an authed route's shell
const TIMEOUT_MS = 20000

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
}

function die(msg, detail) {
  console.error(`\nsmoke-test: FAILED — ${msg}\n`)
  if (detail) console.error(detail)
  console.error('\nDo NOT deploy dist/.\n')
  process.exit(1)
}

// ── a static server that mirrors firebase.json's SPA rewrite ────────────────
async function serve() {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    // normalize() collapses ../ so a request can't escape dist/
    let file = join(DIST, normalize(url))
    try {
      await access(file)
      if (url.endsWith('/')) file = join(file, 'index.html')
    } catch {
      file = join(DIST, 'index.html')   // the "**" -> /index.html rewrite
    }
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { server, port: server.address().port }
}

// ── minimal CDP client ──────────────────────────────────────────────────────
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('CDP connect failed')) })
  let id = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    else if (msg.method) events.push(msg)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, (msg) => msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  return { send, events, close: () => ws.close() }
}

async function main() {
  try { await access(join(DIST, 'index.html')) }
  catch { die(`no ${DIST}/index.html — run the build first.`) }
  try { await access(CHROME) }
  catch { die(`Chrome not found at ${CHROME}`, 'Set CHROME_PATH to its location.') }

  const { server, port } = await serve()
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--mute-audio',
    `--user-data-dir=${process.env.TMPDIR || '/tmp'}/sp-smoke-${Date.now()}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  // Chrome prints its devtools endpoint to stderr on startup. That endpoint is
  // the BROWSER target, which has no Page domain — the page targets are listed
  // at /json/list and each carries its own socket.
  const browserWs = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Chrome did not report a debugging port')), 15000)
    let buf = ''
    chrome.stderr.on('data', (d) => {
      buf += d.toString()
      const m = buf.match(/ws:\/\/[^\s]+/)
      if (m) { clearTimeout(t); resolve(m[0]) }
    })
  })

  const origin = browserWs.replace(/^ws:\/\//, 'http://').replace(/\/devtools\/.*$/, '')
  const pageWs = await (async () => {
    for (let i = 0; i < 40; i++) {
      try {
        const targets = await (await fetch(`${origin}/json/list`)).json()
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
        if (page) return page.webSocketDebuggerUrl
      } catch { /* chrome still coming up */ }
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('no page target appeared')
  })()

  const cleanup = () => { try { chrome.kill() } catch {} ; server.close() }
  let failures = []

  try {
    for (const route of ROUTES) {
      const { send, events } = await connect(pageWs)
      await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
      await send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` })

      // Wait for React to put something on the page, or give up.
      const started = Date.now()
      let rendered = 0
      while (Date.now() - started < TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 250))
        const { result } = await send('Runtime.evaluate', {
          expression: `(() => { const r = document.getElementById('root'); return r ? r.children.length : -1 })()`,
          returnByValue: true,
        })
        rendered = result.value
        if (rendered > 0) break
      }

      const thrown = events
        .filter(e => e.method === 'Runtime.exceptionThrown')
        .map(e => e.params?.exceptionDetails?.exception?.description
               || e.params?.exceptionDetails?.text || 'unknown exception')

      if (rendered === -1) failures.push(`${route}: no #root element in the document`)
      else if (rendered === 0) failures.push(`${route}: #root is empty — nothing rendered`)
      if (thrown.length) failures.push(`${route}: uncaught ${thrown.length} exception(s)\n      ${thrown.slice(0, 3).join('\n      ')}`)

      if (!failures.length) console.log(`smoke-test: ${route} rendered ${rendered} node(s), no uncaught exceptions`)
    }
  } catch (err) {
    cleanup()
    die('could not drive the browser', String(err.message || err))
  }

  cleanup()
  if (failures.length) {
    die('the built site does not render.', failures.map(f => '  • ' + f).join('\n') + `

A blank page with an exception at startup is usually a missing or invalid
Firebase config — check that .env exists wherever this was built. It is
gitignored, so fresh clones and git worktrees do not have one.`)
  }
  console.log('smoke-test: ok — the built site renders.')
}

main().catch(err => die('unexpected error', String(err.stack || err)))
