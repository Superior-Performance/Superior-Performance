// ⚠️  REPLACE these placeholder values with your own Firebase project credentials.
// Go to: https://console.firebase.google.com → Project Settings → General → Your apps → SDK setup
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "YOUR_API_KEY",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "YOUR_PROJECT.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "YOUR_PROJECT_ID",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "YOUR_PROJECT.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "YOUR_SENDER_ID",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "YOUR_APP_ID",
}

const app = initializeApp(firebaseConfig)

export const auth    = getAuth(app)
export const db      = getFirestore(app)    // Firestore — programs, athletes, logs, chat
export const storage = getStorage(app)      // Storage — athlete profile photos

// Local QA against the Firebase emulators instead of the real project, so
// clicking through the coach and athlete flows never touches a real athlete's
// data. Off unless VITE_USE_EMULATORS=1 — see scripts/seed-emulator.mjs for
// the accounts it creates and `npm run dev:emulator` to start both together.
if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  console.info('Firebase: using local emulators (seeded data, not production)')
}

export default app
