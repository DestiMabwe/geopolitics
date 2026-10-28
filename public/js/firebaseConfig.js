// ARCHITECTURE §5.3: the Firebase web config lives here and nowhere else. It is public by design
// (it names the project; it grants nothing). Only Auth uses it: the browser has no Firestore SDK.

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// Local dev talks to the Auth emulator (npm run dev:emu). The demo- project can never reach Google.
const local = {
  config: { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-geopolitics' },
  authEmulatorUrl: 'http://127.0.0.1:9099',
};

// The real project's web config arrives with the first deploy (S31a).
const production = null;

export const firebaseSettings = isLocal ? local : production;
