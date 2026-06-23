// Single source of truth for Firebase. Paste your credentials into `.env`
// (see .env.example). Everything else in the app imports from this module.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// True only when real config has been pasted into .env. The app uses this to
// show a friendly setup screen instead of crashing when Firebase isn't set up
// yet (e.g. first run on the MacBook before you create the Firebase project).
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
)

if (!isFirebaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Second Brain] Firebase config missing. Copy .env.example to .env and paste your Firebase web config to enable sign-in and sync.'
  )
}

// Initialize lazily so an unconfigured app still boots (and shows the setup
// screen). When config is present, Firestore runs with OFFLINE PERSISTENCE
// (IndexedDB-backed cache): reads/writes work with no signal and sync on
// reconnect. persistentMultipleTabManager keeps multiple open tabs consistent.
let _app = null
let _db = null
let _auth = null

if (isFirebaseConfigured) {
  _app = initializeApp(firebaseConfig)
  _db = initializeFirestore(_app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
  _auth = getAuth(_app)
}

export const app = _app
export const db = _db
export const auth = _auth
