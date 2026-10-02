#!/usr/bin/env node
/**
 * Post-build guard: refuse to let the placeholder legal pages reach a build.
 *
 * /privacy, /terms and /refund-policy render real components whose content is
 * still TODO. They shipped to production once already, on a deploy that was
 * "just SEO changes". src/config/legalPages.js keeps them out by default; this
 * checks that it actually worked.
 *
 * Worth having even though the flag is reliable today, because the failure is
 * silent: tree-shaking is an optimisation, not a contract, and a future
 * dependency or config change could start retaining those modules without
 * anyone noticing. A build that fails loudly is the difference between finding
 * out here and finding out from a lawyer.
 *
 * Scans EVERY javascript file in dist, not just the entry chunk — the thing
 * being prevented is the code existing at all, and a code-split chunk is just
 * as reachable as the main bundle. The old manual check only ever grepped
 * index-*.js, which would have missed exactly that.
 *
 * Set VITE_SHOW_LEGAL_PAGES=1 to build them deliberately; this then says so
 * rather than failing, so a real legal-pages build is possible but never
 * accidental.
 *
 * It also refuses a build with no Firebase credentials. src/firebase/config.js
 * falls back to literal "YOUR_API_KEY"-style placeholders when the VITE_*
 * variables are absent, and initializeApp then throws auth/invalid-api-key at
 * module load — before React mounts, so every page is a blank screen with
 * nothing in the UI to say why. That shipped on 2026-10-01: the build ran in a
 * git worktree, .env is gitignored so `git worktree add` never copies it, the
 * build succeeded, the deploy succeeded, and the site was dark for sixteen
 * hours until someone rolled it back. Nothing in the pipeline noticed, because
 * every step did exactly what it was asked.
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST = 'dist'
// Distinctive of the placeholder pages: the component names, the route only
// they use, and the literal TODO marker their copy is full of.
const FORBIDDEN = ['PrivacyPolicyPage', 'TermsPage', 'RefundPolicyPage', 'refund-policy', 'TODO:']
// The exact fallbacks in src/firebase/config.js. Their presence means the
// VITE_FIREBASE_* variables were missing at build time.
const CONFIG_PLACEHOLDERS = ['YOUR_API_KEY', 'YOUR_PROJECT_ID', 'YOUR_SENDER_ID', 'YOUR_APP_ID']
const INTENTIONAL = process.env.VITE_SHOW_LEGAL_PAGES === '1'

if (!fs.existsSync(DIST)) {
  console.error(`check-bundle: no ${DIST}/ directory — run the build first.`)
  process.exit(1)
}

const jsFiles = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|mjs|cjs)$/.test(e.name)) jsFiles.push(p)
  }
})(DIST)

const hits = []
const configMisses = []
for (const f of jsFiles) {
  const body = fs.readFileSync(f, 'utf8')
  for (const needle of FORBIDDEN) {
    const n = body.split(needle).length - 1
    if (n > 0) hits.push({ file: f, needle, n })
  }
  for (const needle of CONFIG_PLACEHOLDERS) {
    if (body.includes(needle)) configMisses.push({ file: f, needle })
  }
}

// Checked before the legal pages: a bundle that cannot start Firebase is
// broken for every visitor, which is worse than anything else here.
if (configMisses.length > 0) {
  console.error('\ncheck-bundle: FAILED — this build has no Firebase credentials.\n')
  for (const m of configMisses) console.error(`  ${m.file}: ${m.needle}`)
  console.error(`
src/firebase/config.js fell back to its placeholder values, so the VITE_FIREBASE_*
variables were missing when vite build ran. Deployed, this throws
auth/invalid-api-key before React mounts and every page renders blank with no
error shown to the user.

Almost always: building somewhere without a .env. It is gitignored, so a fresh
clone or a git worktree does not have one — copy it in before building there.
Do NOT deploy dist/.
`)
  process.exit(1)
}

if (hits.length === 0) {
  console.log(`check-bundle: ok — ${jsFiles.length} js file(s), Firebase config present, no placeholder legal pages.`)
  process.exit(0)
}

if (INTENTIONAL) {
  console.log('check-bundle: legal pages ARE in this build (VITE_SHOW_LEGAL_PAGES=1).')
  for (const h of hits) console.log(`  ${h.file}: ${h.needle} x${h.n}`)
  console.log('Intentional — but do not deploy this build unless the TODOs are filled in.')
  process.exit(0)
}

console.error('\ncheck-bundle: FAILED — placeholder legal pages are in the build.\n')
for (const h of hits) console.error(`  ${h.file}: ${h.needle} x${h.n}`)
console.error(`
These pages say "TODO: business name/address/refund terms" and must not be
served. They are gated by SHOW_LEGAL_PAGES in src/config/legalPages.js, so
either something imports them outside that flag, or the build stopped dropping
them. Do not deploy dist/ until this passes.
`)
process.exit(1)
