# Throwing Program Platform — Where We Are

*Prepared for engineering review — Aug 2026*

## What it is

A web app for coaching pitchers. Two sides:

- **Athlete side (mobile-first):** log in, see this week's workouts, check them off, track velo/weight, message the coach, view Rapsodo data.
- **Admin side (desktop):** athlete roster, enter assessment scores, generate/assign programs, message athletes.

Working prototype. ~3,300 lines of app code across 22 files. Not yet deployed to production.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Auth | Firebase Auth (email/password) |
| Database | Firestore |
| Chat | Firebase Realtime Database |
| Hosting | Firebase Hosting (configured, not deployed) |

No backend server. Everything runs client-side against Firebase.

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

**Data model** (Firestore)

```
users/{uid}                    name, email, role, programId
programs/{id}                  name, athleteId, active, totalWeeks, weeks[]
assessments/{uid}              scores{}, posture{}
dataLogs/{uid}/entries/{id}    type (velo|weight), value, date, notes
completions/{uid}/weeks/{w_d}  completed, completedAt
settings/global                sheetsScriptUrl
```

Firestore security rules are written and role-aware (admins read/write all; athletes scoped to their own docs).

---

## Known gaps / things to discuss

**Infrastructure**

- Not under version control — no git repo, no history, no branches.
- Never deployed. No staging or production environment, no CI.
- No tests of any kind.
- Duplicate config files (`tailwind.config.js` + `.cjs`, same for postcss) — leftover cruft.

**Architecture questions for the engineer**

- **No backend.** Athlete account creation, program generation, and rules enforcement all happen client-side. Should some of this move to Cloud Functions? Custom claims instead of a Firestore-read role check?
- **Sheets dependency.** The programming algorithm lives in a Google Sheet the coach maintains. Good for iteration speed, fragile as a production dependency. Keep it, or port the logic into the app?
- **Rapsodo is an iframe, not an integration.** We embed cloud.rapsodo.com and the athlete logs in separately. No session data flows into our system. Real API access is the open question.
- **Firestore rules do a `get()` on the user doc for every request** — cost and latency concern at scale.
- Program data is stored as one nested array on a single document. Fine now; may not hold up as programs get long or need per-exercise history.

**Product gaps**

- No notifications or reminders.
- Athletes can't see their own trend charts — data goes in, doesn't come back out visually.
- No way to edit a program after generation, only regenerate.
- No offline support (athletes will use this in facilities with bad signal).

---

## What we want from this conversation

1. Sanity-check the Firebase-only architecture — where does it break?
2. Get the repo into git and a real deploy pipeline.
3. Decide whether the Sheets algorithm stays external.
4. Guidance on Rapsodo: is a real integration realistic, or do we live with the iframe?
5. What to prioritize before putting this in front of actual athletes.
