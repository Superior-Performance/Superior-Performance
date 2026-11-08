// ⚠️  REPLACE these placeholder values with your own Firebase project credentials.
// Go to: https://console.firebase.google.com → Project Settings → General → Your apps → SDK setup
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import {
  initializeFirestore, getFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
} from 'firebase/firestore'
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
// Firestore — programs, athletes, logs, chat.
//
// The local cache is what makes the app usable in the facility, where wifi
// and cell signal are poor: data already seen is served from the phone, and
// a check-in ticked with no signal is queued and sent when it returns. It
// also saves reads on repeat opens. A browser that refuses IndexedDB (a
// private window, some in-app browsers) falls back to the plain online-only
// client rather than breaking the app. See clearCachedData for sign-out.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return getFirestore(app)
  }
}
export const db      = createDb()
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

// What the cache holds is one athlete's data on one device, so it has to go
// when they sign out — otherwise the next person on a shared phone could open
// it. terminate() first because the cache can't be cleared while the client is
// live; the caller reloads afterward so the app starts from a fresh client.
// Best effort: another open tab keeps the cache locked, and that is fine.
export async function clearCachedData() {
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch { /* locked by another tab or never enabled */ }
}

export default app
