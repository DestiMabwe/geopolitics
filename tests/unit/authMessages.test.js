import { describe, it, expect } from 'vitest';
import { validateCredentials, authErrorMessage } from '../../public/js/authMessages.js';

// DESIGN §3.1: inline messages for bad input, wrong password and email in use; a Toast for network errors.

describe('validateCredentials', () => {
  it('returns no errors for a valid email and a 6-character password', () => {
    expect(validateCredentials({ email: 'me@test.local', password: '123456' })).toEqual({});
  });

  it.each(['', 'abc', 'me@', '@test.local', 'me@test', 'm e@test.local'])(
    'rejects the email %j',
    (email) => {
      expect(validateCredentials({ email, password: '123456' })).toEqual({ email: 'Enter a valid email' });
    },
  );

  it('ignores spaces around the email', () => {
    expect(validateCredentials({ email: '  me@test.local ', password: '123456' })).toEqual({});
  });

  it('rejects a password shorter than 6 characters', () => {
    expect(validateCredentials({ email: 'me@test.local', password: '12345' })).toEqual({
      password: 'Password must be at least 6 characters',
    });
  });

  it('reports both fields at once', () => {
    expect(validateCredentials({ email: 'abc', password: '' })).toEqual({
      email: 'Enter a valid email',
      password: 'Password must be at least 6 characters',
    });
  });
});

describe('authErrorMessage', () => {
  it.each(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'])(
    'shows %s inline as a wrong email or password',
    (code) => {
      expect(authErrorMessage(code)).toEqual({ message: 'Wrong email or password', toast: false });
    },
  );

  it('shows an email already in use inline, pointing to Log in', () => {
    expect(authErrorMessage('auth/email-already-in-use')).toEqual({
      message: 'That email already has an account. Log in instead',
      toast: false,
    });
  });

  it('shows a network failure as a toast', () => {
    expect(authErrorMessage('auth/network-request-failed')).toEqual({
      message: 'Can’t reach the server. Check your connection',
      toast: true,
    });
  });

  it('shows too many attempts as a toast', () => {
    expect(authErrorMessage('auth/too-many-requests')).toEqual({
      message: 'Too many attempts. Wait a minute and try again',
      toast: true,
    });
  });

  it('falls back to a generic toast for any other code', () => {
    expect(authErrorMessage('auth/something-new')).toEqual({
      message: 'Something went wrong. Try again',
      toast: true,
    });
  });
});
