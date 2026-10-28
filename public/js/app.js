import * as AppHeader from './components/AppHeader.js';
import * as AuthForm from './components/AuthForm.js';
import * as Toast from './components/Toast.js';
import { createApi } from './api.js';
import * as auth from './auth.js';
import { validateCredentials, authErrorMessage } from './authMessages.js';

// ── Shell: views, slots and click wiring ─────────────────────────────

/** The API client. Every request asks auth for a fresh token. */
const api = createApi({ fetch: (...args) => window.fetch(...args), getToken: auth.getToken });

/**
 * Shows one view and hides the others.
 *
 * @param {'home' | 'auth' | 'game'} name
 */
function showView(name) {
  for (const view of document.querySelectorAll('[data-view]')) {
    view.hidden = view.dataset.view !== name;
  }
}

/** A slot inside the visible view (each view has its own header slot). */
function slot(name) {
  return document.querySelector(`[data-view]:not([hidden]) [data-slot="${name}"]`);
}

/** @param {{ email: string } | null} user */
function renderHeader(user) {
  slot('header').replaceChildren(AppHeader.render({ user }));
}

/**
 * Puts a fresh AuthForm in the auth view and focuses the email field.
 *
 * @param {'login' | 'signup'} mode
 * @param {string} [email]  carried over when switching mode
 * @returns {HTMLFormElement}  pass it to AuthForm.update() to show errors or submitting
 */
function mountAuthForm(mode, email = '') {
  const form = AuthForm.render({
    mode,
    email,
    onSubmit: (credentials) => handleAuthSubmit(form, mode, credentials),
    onToggleMode: (nextMode, typed) => mountAuthForm(nextMode, typed),
  });
  slot('auth-form').replaceChildren(form);
  form.elements.email.focus();
  return form;
}

// Header buttons and the Home intro buttons all carry data-action.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) handleAction(button.dataset.action);
});

// ── S25a: yours ──────────────────────────────────────────────────────
// Available: api, showView, slot, renderHeader, mountAuthForm, AuthForm.update, Toast.show,
// auth.*, validateCredentials, authErrorMessage.

/**
 * Runs once on page load. Decide which view to show, and keep the header in step with
 * who is logged in (auth.onUserChange fires on load too, including a login restored after a refresh).
 */
function start() {
  throw new Error('not implemented');
}

/**
 * A click on any `[data-action]` button: 'login', 'signup', 'logout', 'my-games', 'new-game'.
 * ('my-games' and 'new-game' can just go Home until S25b0.)
 *
 * @param {string} action
 */
async function handleAction(action) {
  throw new Error('not implemented');
}

/**
 * The AuthForm was submitted. Show field errors without calling Firebase when the input is bad;
 * show submitting while Firebase works; on failure show the message inline or as a Toast
 * (authErrorMessage says which); on success leave the auth view.
 *
 * @param {HTMLFormElement} form
 * @param {'login' | 'signup'} mode
 * @param {{ email: string, password: string }} credentials
 */
async function handleAuthSubmit(form, mode, credentials) {
  throw new Error('not implemented');
}

start();
