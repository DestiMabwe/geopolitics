// DESIGN §3.1: what AuthForm shows for bad input and for Firebase Auth errors.
// Pure functions (no DOM, no SDK), so they run in the unit tests.

/**
 * Checks the form before anything is sent to Firebase.
 *
 * - email (trimmed) must look like `name@domain.tld`: no spaces, one `@`, a dot in the domain
 *   → otherwise `email: 'Enter a valid email'`
 * - password must be at least 6 characters (Firebase's minimum)
 *   → otherwise `password: 'Password must be at least 6 characters'`
 *
 * @param {{ email: string, password: string }} credentials
 * @returns {{ email?: string, password?: string }} empty when both are valid
 */
export function validateCredentials({ email, password }) {
  // Collect both, so the user sees every problem at once.
  const errors = {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email';
  }
  if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }
  return errors;
}

/**
 * Turns a Firebase Auth error code (`err.code`) into what the user sees.
 * `toast: false` → inline under the form. `toast: true` → a Toast (DESIGN §3.1).
 * See tests/unit/authMessages.test.js for the exact messages per code.
 *
 * @param {string} code  e.g. 'auth/invalid-credential'
 * @returns {{ message: string, toast: boolean }}
 */
export function authErrorMessage(code) {
  switch (code) {
    // One message for all three, so the form never reveals which emails have accounts.
    // Real Firebase sends invalid-credential; the emulator still sends the other two.
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return { message: 'Wrong email or password', toast: false };
    case 'auth/email-already-in-use':
      return { message: 'That email already has an account. Log in instead', toast: false };
    case 'auth/network-request-failed':
      return { message: 'Can’t reach the server. Check your connection', toast: true };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts. Wait a minute and try again', toast: true };
    default:
      return { message: 'Something went wrong. Try again', toast: true };
  }
}
