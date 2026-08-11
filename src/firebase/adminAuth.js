/**
 * Secondary Firebase app instance used exclusively for admin-side user creation.
 * createUserWithEmailAndPassword() on the primary auth signs in as the new user,
 * which would kick the admin out. Using a secondary app avoids that entirely.
 */
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

const secondaryApp =
  getApps().find((a) => a.name === 'secondary') ||
  initializeApp(firebaseConfig, 'secondary')

const secondaryAuth = getAuth(secondaryApp)

/**
 * Creates a Firebase Auth account for a new athlete without affecting
 * the currently signed-in admin session.
 * Returns the UserCredential so the caller can grab the UID for Firestore.
 */
export async function createAthleteAuth(email, password) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  await secondaryAuth.signOut() // clean up secondary session immediately
  return cred
}
