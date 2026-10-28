// Firebase Auth for the browser, from the pinned gstatic build (no npm, no build step).
// Keep the version in one place and in step with the `firebase` dev dependency.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { firebaseSettings } from './firebaseConfig.js';

if (!firebaseSettings) {
  throw new Error('No Firebase web config for this host yet (added in S31a)');
}

/** The one Auth instance. Logins persist in the browser across refreshes (Firebase's default). */
export const auth = getAuth(initializeApp(firebaseSettings.config));

if (firebaseSettings.authEmulatorUrl) {
  connectAuthEmulator(auth, firebaseSettings.authEmulatorUrl, { disableWarnings: true });
}

// The Auth functions auth.js needs, re-exported so the pinned URL appears only in this file.
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
