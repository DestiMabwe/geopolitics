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
  throw new Error('not implemented');
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
  throw new Error('not implemented');
}
