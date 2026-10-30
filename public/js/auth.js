import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from './firebase.js';

// Sign up, log in and log out with email + password (ARCHITECTURE §5.2). The ID token from
// getToken() goes on every write request; the server verifies it with verifyIdToken.
// Firebase errors are thrown as-is: their `code` (e.g. 'auth/invalid-credential') feeds authErrorMessage.

/**
 * Creates an account and logs it in.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ uid: string, email: string }>}
 */
export async function signUp(email, password) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return toUser(user);
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ uid: string, email: string }>}
 */
export async function logIn(email, password) {
  // Trimmed the same way as signUp, or " a@b.com " could sign up but never log in.
  // The password is not trimmed: spaces are legal in it.
  const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
  return toUser(user);
}

/** Only what the app needs from a Firebase user. */
function toUser(user) {
  return { uid: user.uid, email: user.email };
}

/** @returns {Promise<void>} */
export async function logOut() {
  await signOut(auth);
}

/**
 * Calls `callback` now with the current user (or null), and again whenever someone
 * logs in or out, including when a saved login is restored after a refresh.
 *
 * @param {(user: { uid: string, email: string } | null) => void} callback
 * @returns {() => void} call it to stop listening
 */
export function onUserChange(callback) {
  // onAuthStateChanged already calls back once straight away, so no extra call here.
  return onAuthStateChanged(auth, (user) => callback(user ? toUser(user) : null));
}

/**
 * The current user's ID token, or null when logged out. Firebase refreshes it when it's
 * about to expire, so ask for it on every request rather than storing it.
 *
 * @returns {Promise<string | null>}
 */
export async function getToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
