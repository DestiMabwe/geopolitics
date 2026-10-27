// Talks to the Auth emulator's REST API, the same way the browser SDK would sign up.
// The emulator accepts any API key.
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

let counter = 0;

/**
 * Creates a fresh user (unique email each call) and returns a real ID token for it.
 *
 * @returns {Promise<{ uid: string, idToken: string }>}
 */
export async function signUp() {
  counter++;
  const email = `player${Date.now()}-${counter}@test.local`;
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`signUp failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return { uid: body.localId, idToken: body.idToken };
}
