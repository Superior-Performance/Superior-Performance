# Athlete Throwing Program — Setup Guide

## Stack
- **React + Vite** (frontend)
- **Firebase Auth** (login/roles)
- **Firestore** (programs, athletes, data logs)
- **Firebase Realtime Database** (real-time chat)
- **Firebase Hosting** (deployment)
- **Tailwind CSS** (styling)

---

## 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it (e.g. `throwing-program`) → Continue
3. Disable Google Analytics (optional) → Create project

### Enable services
- **Authentication** → Sign-in method → Email/Password → Enable
- **Firestore Database** → Create database → Start in **production mode** → choose a region
- **Realtime Database** → Create database → Start in **locked mode** → choose a region
- **Hosting** → Get started (follow the CLI steps below)

---

## 2. Get Firebase Config

Project Settings (gear icon) → General → Your apps → **Add app** → Web (`</>`) → register app → copy the config object.

---

## 3. Local Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your Firebase values
cp .env.example .env
# Edit .env with your Firebase project values
```

Your `.env` file:
```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

```bash
# Start dev server
npm run dev
```

---

## 4. Create Your First Admin Account

Since registration is not exposed publicly, create the admin account directly in Firebase:

1. Firebase Console → **Authentication** → Add user → enter your email + password
2. Firebase Console → **Firestore** → `users` collection → Add document
   - Document ID: (your uid from Auth tab)
   - Fields: `name` (string), `email` (string), `role` = `"admin"`

---

## 5. Deploy Firestore & Realtime Database Rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
firebase deploy --only firestore:rules,database
```

---

## 6. Deploy to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## 7. Google Sheets → Program Import

To load a program from Google Sheets:

1. Build your program in Google Sheets with these columns:
   ```
   Week | Day | Title | Exercise | Sets | Reps | Load | Notes
   ```
2. File → Download → CSV
3. In the app: Admin → Programs → New Program → import the CSV

Each row is one exercise. Multiple rows with the same Week+Day are grouped into that day's workout.

---

## Firestore Data Model

```
users/{uid}
  name, email, role ('athlete'|'admin'), programId

programs/{programId}
  name, athleteId, active, totalWeeks
  weeks: [{ days: [{ title, exercises: [{name,sets,reps,load,notes}] }] }]

dataLogs/{uid}/entries/{id}
  type ('velo'|'weight'), value, exercise, notes, date

assessments/{uid}
  scores: { gripStrength, shoulderER, shoulderIR, ... }

completions/{uid}/weeks/{weekIdx_dayIdx}
  completed, completedAt
```

---

## Athlete Features (Mobile)
- **Schedule** — weekly workout view with tap-to-expand exercises, mark complete
- **Progress** — overall % ring + per-week completion bars
- **Track** — log velocity (mph) and weight (lbs) with a bottom-sheet form
- **Chat** — real-time messaging with coach
- **Rapsodo** — placeholder tab (ready for API integration)

## Admin Features (Desktop)
- **Athletes** — roster, add athlete, view detail
- **Athlete Detail** — assessment scores, program assignment, data logs
- **Programs** — create programs manually or import from CSV
- **Messages** — chat with any athlete

---

## Adding Rapsodo Integration (Future)

When Rapsodo API access is available, update `src/pages/athlete/RapsodoPage.jsx` to:
1. Call the Rapsodo API with the athlete's credentials/token
2. Display session data in the metric cards (velocity, spin rate, etc.)

The UI scaffolding is already in place.
