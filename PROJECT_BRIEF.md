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
- Athlete detail: assessment scores (8 numeric fields + 5 postural dropdowns), program assignment, data log history
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

**Fixed and deployed 2026-09-16** — rules, app, and both Apps Scripts (booking "Superior Notifications" v5, inquiry "Website Request Form" v2), same URLs.

1. ~~Athletes could change a slot's `bookedCount` without holding a booking.~~
   `firestore.rules` now only allows ±1 in the same write as creating/deleting
   the athlete's own booking doc, and requires the athlete role. Covered by
   `npm run test:rules`.
2. ~~Apps Script webhooks unauthenticated.~~ Script source now lives in
   `apps-script/` (the Settings page shows it from there). The booking script
   only emails for a verified athlete's real booking, reading every detail from
   Firestore with the athlete's ID token. The inquiry script (which has to stay
   anonymous) caps volume, dedupes senders, and never uses the last 40 of the
   account's daily mail quota, so booking alerts keep working.
3. ~~Late-cancellation timezone bug.~~ The 24h check moved into the booking
   script, which parses the slot time in America/Chicago.

**Known bugs**

4. `WeightField` stomps an in-progress keystroke when the Firestore listener echoes back
   a just-saved value. Nothing is lost, but it reads as data loss.
5. Deleting a facility slot with active bookings orphans the `bookings` subcollection
   and the athlete-side mirrors.

**Blocked on the business, not on code**

6. Legal pages need a real entity name, mailing address, state, and refund terms. Until
   then every deploy has to carve them out.
7. Results-section velocity numbers are placeholders pending real figures.

**Data hygiene**

8. Test accounts still in production — several `zzz-test-*` Auth users, a "big hitter"
   athlete, and a couple of orphan `ZZZ TEST` programs. Deleting these needs a human.

**Structural, non-urgent**

9. `AdminAthleteDetail.jsx` is ~1,500 lines doing three unrelated jobs behind one tab
   switch. `SchedulePage.jsx` duplicates an accordion toggle three times. A
   "get script URL or bail" helper exists in `AdminAthletesPage.jsx` and is re-inlined
   three times in `AdminAthleteDetail.jsx`.
10. No custom domain — everything canonical points at `*.web.app`, which caps local SEO.
    The origin is hardcoded in four files with no single source of truth.

---

## Deploying the booking/webhook fix

The rules, the app, and the two Apps Scripts have to go out together. The new
app sends booking alerts as a signed-in POST, which the old script ignores.
The new script refuses the old app's GET. Either mismatch just drops alert
emails (bookings themselves still work), so do all three in one sitting:

1. `firebase deploy --only firestore:rules`. This is safe on its own because
   the current app already writes bookings the way the new rules require.
2. Build and deploy hosting, with the legal-pages carve-out.
3. In the superiorperformance.sp account, open each Apps Script, paste the new
   code from Admin → Settings (or `apps-script/*.gs`), then use Deploy →
   Manage deployments → Edit → New version so the URL stays the same. For the
   booking script, run `authorize` once first; it now needs permission to
   make external requests. Optionally set `OVERFLOW_SHEET_ID` on the inquiry
   script.
4. Book and cancel a slot inside 24h from a test athlete account. That should
   send two emails. Opening the booking URL in a browser should show an error.
