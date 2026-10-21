import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Vercel and .env store the key on one line with literal "\n" (backslash + n).
 * cert() needs real newlines.
 *
 * @param {string | undefined} key
 * @returns {string | undefined}
 */
export function normalisePrivateKey(key) {
  return key?.replace(/\\n/g, '\n');
}

function credentialOptions() {
  // The Admin SDK reads FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST itself
  // and talks to the emulators instead of Google, so no credentials are needed there.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // emulators:exec sets GCLOUD_PROJECT; the demo- prefix can never reach a real project.
    return { projectId: process.env.GCLOUD_PROJECT ?? 'demo-geopolitics' };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalisePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    }),
  };
}

// Started on first use, not on import, so routes can import this file in unit tests
// that have no credentials. Reused across hot reloads and warm serverless invocations.
function firebaseApp() {
  return getApps()[0] ?? initializeApp(credentialOptions());
}

/** @returns {import('firebase-admin/firestore').Firestore} */
export function getDb() {
  return getFirestore(firebaseApp());
}

/** @returns {import('firebase-admin/auth').Auth} */
export function getAuthClient() {
  return getAuth(firebaseApp());
}
