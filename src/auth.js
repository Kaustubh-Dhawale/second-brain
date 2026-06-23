// Thin wrappers over Firebase Auth (email/password). Keeps Firebase imports
// out of the components.
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase.js'

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb)
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function signOutUser() {
  return signOut(auth)
}

// Turn Firebase's error codes into friendly messages for the auth screen.
export function authErrorMessage(err) {
  const code = err?.code || ''
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.'
    case 'auth/missing-password':
      return 'Please enter a password.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/email-already-in-use':
      return 'An account already exists for that email — try signing in.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.'
    default:
      return err?.message || 'Something went wrong. Please try again.'
  }
}
