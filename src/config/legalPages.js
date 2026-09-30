/**
 * Whether the placeholder legal pages are part of this build.
 *
 * /privacy, /terms and /refund-policy render real components, but their
 * content is still TODO — business name, address, refund terms — pending
 * details only Jake can supply. They must not reach production as-is, and
 * they did once, on a deploy that was "just SEO changes".
 *
 * Until today the way that was prevented was a manual ritual before every
 * deploy: delete the imports and routes from App.jsx, strip the footer links
 * from LandingPage.jsx, build, grep the bundle, deploy, then `git checkout`
 * both files. Perhaps a dozen times in a single working day, each one a
 * chance to forget a step.
 *
 * Now it's a flag, and — this is the part that matters — it is OFF unless
 * something explicitly turns it on. The old default was "shipped unless you
 * remember to remove them". The new default is safe, and remembering is no
 * longer load-bearing.
 *
 * `import.meta.env` is substituted at build time, so with the flag unset the
 * condition is a literal `false` and Rollup drops the page components out of
 * the bundle entirely — not merely unreachable, absent. scripts/check-bundle.mjs
 * runs after every build and fails it if they somehow survive, because
 * "unreachable route" and "absent from the bundle" are different guarantees
 * and only the second one is worth anything here.
 *
 * To work on them locally:  VITE_SHOW_LEGAL_PAGES=1 npm run dev
 * To ship them for real:    fill in the TODOs first, then set the flag in the
 *                           deploy and delete this file along with the checks.
 */
export const SHOW_LEGAL_PAGES = import.meta.env.VITE_SHOW_LEGAL_PAGES === '1'
