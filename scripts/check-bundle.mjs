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
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST = 'dist'
// Distinctive of the placeholder pages: the component names, the route only
// they use, and the literal TODO marker their copy is full of.
const FORBIDDEN = ['PrivacyPolicyPage', 'TermsPage', 'RefundPolicyPage', 'refund-policy', 'TODO:']
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
for (const f of jsFiles) {
  const body = fs.readFileSync(f, 'utf8')
  for (const needle of FORBIDDEN) {
    const n = body.split(needle).length - 1
    if (n > 0) hits.push({ file: f, needle, n })
  }
}

if (hits.length === 0) {
  console.log(`check-bundle: ok — ${jsFiles.length} js file(s), no placeholder legal pages.`)
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
