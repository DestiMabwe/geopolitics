import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// The Admin SDK reads FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST itself
// and talks to the emulators instead of Google, so no credentials are needed there.
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

function credentialOptions() {
  if (usingEmulator) {
    // emulators:exec sets GCLOUD_PROJECT; the demo- prefix can never reach a real project.
    return { projectId: process.env.GCLOUD_PROJECT ?? 'demo-geopolitics' };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel and .env store the key on one line with literal "\n".
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
    }),
  };
}

// Reuse the app across hot reloads and warm serverless invocations.
const app = getApps()[0] ?? initializeApp(credentialOptions());

export const db = getFirestore(app);
export const auth = getAuth(app);
