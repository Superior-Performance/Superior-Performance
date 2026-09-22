# Throwing Program Platform — Where We Are

*Originally prepared for engineering review, Aug 2026 — substantially revised Sep 2026.*
*If something here contradicts the code, trust the code and fix this file.*

## What it is

A web app for coaching pitchers. Two sides:

- **Athlete side (mobile-first):** log in, see this week's workouts, check them off, track velo/weight, message the coach, view Rapsodo data.
- **Admin side (desktop):** athlete roster, enter assessment scores, generate/assign programs, message athletes.

Live in production at **superior-performance-ba102.web.app**, in daily use with ~20 real athletes.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Auth | Firebase Auth (email/password) |
| Database | Firestore |
| Chat | Firestore (moved off Realtime Database) |
| Hosting | Firebase Hosting — live, deployed from `main` |
| Repo | GitHub — `Superior-Performance/Superior-Performance` |

No backend server, and **no Cloud Functions** — the project is on the Spark (free)
plan, so anything needing a server runs as a Google Apps Script web app instead
(inquiry form, facility booking alerts). Firebase project: `superior-performance-ba102`,
owned by `superiorperformance.sp@gmail.com`.

---

## What's built and working

**Auth & roles**

- Email/password login, single `role` field (`admin` / `athlete`) on the user doc drives all routing.
- Route guards redirect by role. No public signup — admins create athlete accounts.
- Password reset emails, admin self-service password change.

**Athlete experience** (6 screens, bottom-nav, mobile layout)

- Schedule — week-by-week workout view, tap to expand exercises, mark day complete
- Progress — overall completion ring plus per-week bars
- Track — log velocity (mph) and body/lift weight
- Chat — real-time coach messaging
- Rapsodo — embedded Rapsodo Cloud in a persistent iframe (login survives tab switches)
- Account

**Admin experience** (5 screens)

- Athletes roster + add athlete (creates the Auth account without logging the admin out)
- Groups: roster cohorts (a winter camp, a travel team). `athleteGroups/{id}` holds
  name/colour/optional block start date; membership is `users/{uid}.groupIds`, so an
  athlete can be in several. The same chip bar filters the dashboard and the roster,
  and on the dashboard the group applies before the attention tiles, so counts are
  per-cohort. Generating programs while filtered to a group with a start date makes
  the drafts start there instead of today.
- Athlete detail: assessment scores (8 numeric fields + 5 postural dropdowns), program assignment, data log history
- Assessment history: every save also writes a copy to
  `assessments/{uid}/history/{YYYY-MM-DD}`, keyed by assessment date — the same
  date updates that entry, a new date starts a new one. The Assessment tab
  shows past screens, what changed between consecutive ones, and a sparkline
  per numeric field with two or more readings. `assessments/{uid}` still holds
  the current values unchanged, so every existing reader is unaffected.
- Programs: build manually or import a CSV
- Messages: chat with any athlete
- Settings: Google Apps Script URL, password change

**Google Sheets program generation**

This is the piece we care most about. Flow:

1. Coach enters assessment scores on the athlete's page.
2. Clicks "Generate Program from Sheet."
3. App sends the scores as query params to a Google Apps Script web app URL (stored in Settings).
4. The Sheet runs the programming algorithm and returns flat rows: `Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes`.
5. App reshapes those rows into nested weeks/days, deactivates the athlete's old program, and assigns the new one.

Code is written and the round-trip is implemented. The Apps Script itself lives outside this repo.

**Built since the original review**

- **Facility scheduling** — coach posts bookable slots, athletes book atomically
  (`bookFacilitySlot` transaction). Booking emails the coach via Apps Script; so does a
  cancellation, but only inside 24h of the session.
- **Bulk assess + generate** — date-range filter and checkboxes on the roster, then
  "Send to Intake Sheet" or "Generate Programs" across many athletes at once. Shared
  parsing lives in `src/utils/sheetPrograms.js`, used by both the single and bulk paths.
- **Delete athlete actually deletes** — `deleteAthleteCompletely` cascades every
  subcollection, their programs, facility bookings, and Storage avatar. It does *not*
  remove the Firebase Auth record or rows already pushed to the Sheet.
- **Athlete day navigation** — the Today tab was pinned to today with no way to reach a
  missed day; `DayStrip` now scrolls the whole program with done / missed / rest marks.
- **Public landing page** — its own design system (Archivo / IBM Plex Mono), separate
  from the app's `sp-*` tokens. SEO, structured data, sitemap, and robots.txt are live.
- **Team Chat** — staff-only room at `/admin/team` where Jake, Ian, and their two Claude
  agents talk. See the memory note and `scripts/team-chat-agent-prompt.md`.

**Team Chat agents (Atlas and Skip)**

Each partner runs an agent that answers `@`-mentions in the room:

- `scripts/team-chat-watch.mjs` polls Firestore every 20s and spawns a Claude Code CLI
  session **only when a mention is actually waiting** — idle time costs nothing. Kept
  alive by a launchd agent (`scripts/teamchat-watch.plist.example`).
- Identity comes from `TEAM_CHAT_HANDLE` / `TEAM_CHAT_NAME` in that plist, not from the
  repo — **Atlas** is Jake's, **Skip** is Ian's. Both machines run identical committed code.
- The spawned session is **read-only by construction**: Read/Grep/Glob plus two named
  scripts (`team-chat.mjs`, `fs-read.mjs`), no Write/Edit, no general shell. `fs-read.mjs`
  has no write path in it at all.

**Data model** (Firestore)

```
users/{uid}                    name, email, role, programId
programs/{id}                  name, athleteId, active, totalWeeks, weeks[]
assessments/{uid}              scores{}, posture{}
dataLogs/{uid}/entries/{id}    type (velo|weight), value, date, notes
completions/{uid}/weeks/{w_d}  completed, completedAt
settings/global                sheetsScriptUrl, assessmentSheetScriptUrl
settings/public                inquiryScriptUrl, bookingNotifyScriptUrl  (world-readable)
exerciseWeights/{uid}/entries  value per programId_exerciseId — counts toward "activity"
facilitySlots/{id}             date, startTime, endTime, capacity, bookedCount
  └ bookings/{uid}             athleteName, bookedAt
facilityBookingsByAthlete/{uid}/slots/{slotId}   athlete-side mirror
teamChat/{messageId}           text, authorId, authorName, authorType, mentions[], answeredBy
teamChatReads/{uid}            lastReadAt — per-admin unread marker
```

Completion keys are `${programId}_${exercise.id}` using stable ids from
`utils/programIds.js`; the old positional key format is still readable. Programs are one
nested `weeks[]` array per doc — always project with `--fields` when querying them,
they're large.

Firestore security rules are written and role-aware (admins read/write all; athletes scoped to their own docs).

---

## Local QA without touching real data

`npm run dev:emulator` runs the app against the Firebase emulators (auth +
Firestore, ports in `firebase.json`) with `scripts/seed-emulator.mjs` data: a
coach, an in-house athlete carrying a program of every type (including a
Mon/Wed/Fri one, so the gapped-day shape is always exercised), and a College
Remote athlete on day-type programs. Accounts are `coach@example.com` /
`inhouse@example.com` / `remote@example.com`, password `test1234`. The app only
talks to emulators when `VITE_USE_EMULATORS=1`, which that script sets and
production builds never do (the branch compiles away — verified in the bundle).

Needs a Java runtime for the emulator: `brew install openjdk@21`, then
`export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`.

Two test suites, both worth running before any deploy:

- `npm run test:unit` — no emulator needed. Date mapping, per-type day stats,
  gapped day arrays, document-size accounting, group filtering, sheet-row
  parsing (the cell types Apps Script actually sends), and the agent data
  policy.
- `npm run test:rules` — needs the emulator and the JDK on PATH. Firestore
  rules (booking/`bookedCount` pairing, cancellation receipts, group access,
  role-gated writes) plus both Apps Scripts run against shimmed services.

Neither covers React components — there are no component tests, so anything
that moves JSX still needs a click-through in `dev:emulator`.

## Known gaps / things to discuss

**Infrastructure**

- ~~Not under version control~~ — now on GitHub, deployed from `main`.
- ~~Never deployed~~ — live. Preview channels (`firebase hosting:channel:deploy`) are
  used for testing against real production Firestore before shipping.
- **No tests of any kind.** Still true, and the main reason changes get verified by
  hand against preview channels.
- **Legal pages are carved out of every deploy.** `/privacy`, `/terms`,
  `/refund-policy` exist in `src/pages/legal/` and are routed in `App.jsx`, but their
  content is still placeholder pending real business details, so each production build
  strips them first. This has been shipped by accident once — verify the served JS
  bundle after deploying, not the route (an SPA serves the same shell for every path).

**Architecture questions for the engineer**

- **No backend.** Athlete account creation, program generation, and rules enforcement all happen client-side. Should some of this move to Cloud Functions? Custom claims instead of a Firestore-read role check?
- **Sheets dependency.** The programming algorithm lives in a Google Sheet the coach maintains. Good for iteration speed, fragile as a production dependency. Keep it, or port the logic into the app?
- **Rapsodo is an iframe, not an integration.** We embed cloud.rapsodo.com and the athlete logs in separately. No session data flows into our system. Real API access is the open question.
- **Firestore rules do a `get()` on the user doc for every request** — cost and latency concern at scale.
- Program data is stored as one nested array on a single document. Fine now; may not hold up as programs get long or need per-exercise history.

**Product gaps**

- No notifications or reminders.
- Athletes can't see their own trend charts — data goes in, doesn't come back out visually.
- ~~No way to edit a program after generation~~ — `ProgramEditorModal` does full
  week/day/exercise editing, with an Apple-Calendar-style month view for navigation.
- No offline support (athletes will use this in facilities with bad signal).

---

## Open work, roughly in priority order

**Needs a human, not code — do these first**

1. **Paste both Apps Scripts** (superiorperformance.sp account, Deploy → Manage
   deployments → Edit → New version, same URL). The repo copies in
   `apps-script/` are ahead of what's deployed as of 2026-09-21:
   - *Superior Notifications* — refuses a cancellation alert without a
     receipt. Until it's pasted, any athlete can have the coach emailed
     "Late cancellation — <their name>" for a slot they never booked.
   - *Website Request Form* — escapes spreadsheet formulas and caps sheet
     rows. Only matters if `OVERFLOW_SHEET_ID` is set; unclear whether it is.
   - *Assessment Intake* — 22 new columns for the degree fields, total arcs
     and priority ranking (shipped 2026-09-22). **Ian adds the sheet headers
     first**, then the script is pasted, or the script writes 63 values into a
     41-header sheet. The exact headers, positions and letters are in
     `apps-script/assessment-intake-sheet-columns.md`.
2. **Two Claude accounts ship to this one Firebase project.** Production holds
   `assessmentSlots`, `assessmentBookings`, `assessmentBookingLocks` and
   `filmingExercises` from the other account, with no code in this repo and no
   rules covering them (so its own reads are denied). A rules or hosting deploy
   replaces the whole file/bundle, so whoever deploys next can silently revert
   the other's work. Agree on a protocol before either side deploys again.
3. **Confirm the save fix on real data** — switch an athlete College Remote →
   In-House, re-pull, open a draft, save. That path was broken for weeks.

**Known bugs**

4. `WeightField` stomps an in-progress keystroke when the Firestore listener echoes back
   a just-saved value. Nothing is lost, but it reads as data loss.
5. Deleting a facility slot with active bookings orphans the `bookings` subcollection
   and the athlete-side mirrors.
6. Publishing a draft clones the weeks as they were *before* the edit that
   immediately preceded it (`assignProgram` reads `programs` from a stale
   render closure). The draft keeps the new content; the athlete's published
   copy doesn't. Reads as "my save didn't take".
7. `migrateCompletionKeys` builds one unchunked `writeBatch` — a legacy
   program with >250 completed exercises exceeds Firestore's 500-op limit and
   fails to open for editing. Every other batch in `firestore.js` chunks at 450.

**Athlete privacy — found by the data review 2026-09-21, not yet addressed**

8. Assessment intake sends a minor's injury history **in a URL query string**
   to Apps Script (`sendAssessmentToIntakeSheet`). URLs get logged where
   request bodies don't. A POST carries the same data with far less log
   surface.
9. Profile photo URLs carry a permanent `?token=` that bypasses
   `storage.rules` entirely, and photo deletion is best-effort behind a 5s
   timeout — so "delete my child's data" can report success while the image
   stays publicly reachable.
10. **"Delete my child's data" is not achievable today.** `deleteAthleteCompletely`
    is thorough inside Firestore, but the Auth record, the Assessment Intake
    Sheet, the inquiry overflow Sheet, every booking/inquiry email in Gmail,
    and `teamChat` (undeletable by rule) all survive it.
11. Both Google Sheets' sharing settings are unknown. A link-shared sheet of
    minors' injury histories would be serious; worth 60 seconds in the sharing
    dialog.

**Blocked on the business, not on code**

12. Legal pages need a real entity name, mailing address, state, and refund terms.
    Until then every deploy carves them out — see the routine in the memory note,
    and mind that the carve-out must no longer touch `RequestForm.jsx`.
13. Results-section velocity numbers are placeholders pending real figures.

**Data hygiene**

14. Test accounts still in production — several `zzz-test-*` Auth users, a "big hitter"
    athlete, **"Tre Morris"** (confirmed a tester account 2026-09-22, which is why his
    two backfilled assessments disagree on age and training age), and a couple of
    orphan `ZZZ TEST` programs. Deleting these needs a human. Note they inflate
    roster counts: 32 "athletes", 22 with assessment history, include these.

**Structural, non-urgent** (a full ranked plan exists from the refactor review)

15. `AdminAthleteDetail.jsx` is ~1,600 lines doing three unrelated jobs behind one tab
    switch, and its `saving` flag is one boolean shared by six unrelated actions.
    `SchedulePage.jsx` duplicates an accordion toggle three times. A
    "get script URL or bail" helper exists in `AdminAthletesPage.jsx` and is re-inlined
    three times in `AdminAthleteDetail.jsx`. `cellDate` is implemented three times
    (`ProgramMonthView`, `DayStrip`, `SchedulePage`) — start there: it's the
    smallest, and it lands in a module the tests already cover.
16. No custom domain — everything canonical points at `*.web.app`, which caps local SEO.
    The origin is hardcoded in four files with no single source of truth.

---

## Deploying

Rules and hosting are separate deploys, and **each replaces the whole thing** —
there is no merge. Always:

1. `npx firebase deploy --only firestore:rules` (firebase-tools is a
   devDependency, so `npx`, not a global `firebase`).
2. Build and deploy hosting **with the legal-pages carve-out** — see the memory
   note for the exact steps. It strips `App.jsx`'s legal routes and the footer
   links only; it must **not** touch `RequestForm.jsx` any more (doing so used
   to remove the consent checkbox along with its links).
3. Verify the **served** bundle, never the route — an SPA returns the same shell
   for every path:
   ```
   JS=$(curl -s https://superior-performance-ba102.web.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
   curl -s "https://superior-performance-ba102.web.app$JS" | grep -c 'PrivacyPolicyPage\|refund-policy'
   ```
4. An Apps Script change is a separate manual step (item 1 above).

## Fixed and deployed 2026-09-16

- Athletes could change a facility slot's `bookedCount` without holding a
  booking. The rules now allow ±1 only in the same write that creates or
  deletes the athlete's own booking doc.
- Both Apps Script webhooks were unauthenticated and their URLs world-readable.
  Script source moved into `apps-script/`; the booking script only emails for a
  verified athlete's real booking, reading every detail from Firestore with
  their ID token. The inquiry script stays anonymous but caps volume, dedupes
  senders, and reserves the last 40 of the account's daily mail quota so
  booking alerts keep working.
- Late-cancellation timezone bug — the 24h check moved into the booking script,
  which parses the slot time in America/Chicago.

## Fixed and deployed 2026-09-21

All verified in the served bundle or against production, with tests.

- **The long-standing "can't save this program" bug.** The sheet pull deleted
  existing drafts *before* creating replacements, so anything that threw in
  between left the coach editing a document that no longer existed — every save
  then failed with "no entity to update", permanently. Now creates first,
  deletes after; coerces sheet cells with `String()` (Apps Script sends a JSON
  number for a numeric cell, so an exercise named "3" threw mid-pull); refreshes
  the program list in a `finally`; and uses `allSettled` so one bad tab can't
  abort the other three.
- **Publishing now archives the program it supersedes.** "Inactive and not
  archived" is exactly what the draft list and the sheet pull treat as
  discardable, so an athlete's previous program was showing up as a draft and
  being deleted by the next pull.
- **Calendar days resolve by day number, not array position.** A Mon/Wed/Fri
  program stores three days carrying `dayNum` 1, 3, 5 — indexing by position
  showed Wednesday's work on Tuesday and made Friday unreachable. `dayIndexFor`
  in `programSchedule.js`; completions still key off the real array position.
- **Forged cancellation alerts.** A cancellation now writes a receipt in the
  same transaction that deletes the booking, and the rules only permit creating
  one with that pairing. The script checks it before emailing.
- **Quota exhaustion.** Six collections accepted writes from any signed-in
  account, and anyone can self-register through the public web API key — enough
  to exhaust the Spark daily write quota and take the app down for everyone.
  Writes now require the athlete role.
- **Consent on the public form.** The checkbox asserted the visitor had read a
  Privacy Policy that doesn't exist, and the deploy carve-out stripped the whole
  block along with its links — so the live form collected a minor's details with
  no consent language at all. The label is now link-free and true, and the form
  no longer asks for injury history.
- **Spreadsheet formula injection.** Inquiry rows written to the overflow sheet
  escape a leading `=`/`+`/`-`/`@`, and sheet rows are capped per day.
- **The team-chat agents can no longer read athletes' health data.**
  `scripts/fs-read.mjs` uses a project-owner token that bypasses security rules,
  so `scripts/lib/data-policy.mjs` decides what it may read: `assessments`,
  `chats` and `teamChat` refused at any depth; `email`, `photoURL` and a data
  log's `notes` redacted. Capability, not prompt instruction. The watcher also
  stopped writing agent output to its laptop log on success.
