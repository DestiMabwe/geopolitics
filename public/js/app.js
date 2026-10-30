import * as AppHeader from './components/AppHeader.js';
import * as AuthForm from './components/AuthForm.js';
import * as Toast from './components/Toast.js';
import * as GameList from './components/GameList.js';
import * as StartScreen from './components/StartScreen.js';
import { createApi } from './api.js';
import * as auth from './auth.js';
import { validateCredentials, authErrorMessage } from './authMessages.js';
import { openGame, closeGame } from './gamePage.js';
import { el } from './dom.js';

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

/**
 * @param {{ email: string } | null} user
 * @param {{ round?: number, currentPlayer?: string | null, status?: string }} [game]  on the game page
 */
function renderHeader(user, game = {}) {
  slot('header').replaceChildren(AppHeader.render({ user, ...game }));
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
  // Back / Forward, and a # typed into the address bar.
  window.addEventListener('popstate', () => render());
  window.addEventListener('hashchange', () => render());
  auth.onUserChange((user) => {
    currentUser = user;
    render();
  });
}

/** Who is logged in, kept in step by auth.onUserChange. null when logged out. */
let currentUser = null;

/** Counts renders, so a slow Home load can tell that the screen has moved on. */
let renderCount = 0;

/**
 * Draws the screen for the address and the current user. showView comes first because slot()
 * only searches the visible view.
 * - `#login` / `#signup` → the AuthForm, for a logged-out visitor
 * - `/game/:id` → the game page, for anyone (DESIGN §3.3)
 * - anything else → Home: the intro when logged out, My games + Start a new game when logged in
 *
 * @param {{ focus?: 'games' | 'start' }} [options]  a Home section to scroll to once it's drawn
 */
function render({ focus } = {}) {
  renderCount += 1;
  const mode = { '#login': 'login', '#signup': 'signup' }[location.hash];
  const gameId = location.pathname.match(/^\/game\/([^/]+)\/?$/)?.[1];

  if (mode && !currentUser) {
    closeGame();
    showView('auth');
    mountAuthForm(mode);
    renderHeader(currentUser);
  } else if (gameId) {
    showView('game');
    openGame({ id: decodeURIComponent(gameId), user: currentUser, api, slot, renderHeader });
  } else {
    closeGame();
    showView('home');
    renderHeader(currentUser);
    renderHome(focus);
  }
}

/** Goes to `path` (adding a history entry) and draws it. */
function navigate(path, options) {
  history.pushState(null, '', path);
  render(options);
}

/** Home, optionally scrolled to My games or Start a new game. */
function goHome(focus) {
  navigate('/', { focus });
}

/** The cached GET /countries response; the catalogue never changes while the page is open. */
let catalogue = null;

/** DESIGN §3.2. Fills Home for a logged-in player: GameList above StartScreen. */
async function renderHome(focus) {
  const intro = slot('intro');
  const games = slot('games');
  const startSection = slot('start');
  intro.hidden = Boolean(currentUser);
  games.hidden = !currentUser;
  startSection.hidden = !currentUser;
  if (!currentUser) return;

  const mine = renderCount;
  games.replaceChildren(GameList.render({ games: null, onOpen: openFromList }));
  if (!catalogue) startSection.replaceChildren(el('p', { class: 'game-list__empty', 'aria-busy': 'true' }, 'Loading countries…'));
  try {
    const [{ games: list }, countries] = await Promise.all([api.get('/games'), catalogue ?? api.get('/countries')]);
    catalogue = countries;
    if (mine !== renderCount) return; // the screen moved on while loading
    games.replaceChildren(GameList.render({ games: list, onOpen: openFromList }));
    const form = StartScreen.render({ countries: catalogue.countries, onBegin: (code) => beginGame(form, code) });
    startSection.replaceChildren(form);
    if (focus) slot(focus).scrollIntoView({ block: 'start' });
    if (focus === 'start') form.querySelector('input').focus();
  } catch (err) {
    if (mine === renderCount) Toast.show(err.message, 'error');
  }
}

function openFromList(id) {
  navigate(`/game/${encodeURIComponent(id)}`);
}

/** StartScreen's Begin: the server creates the game (and picks the other 9), then open it. */
async function beginGame(form, countryCode) {
  StartScreen.update(form, { submitting: true });
  try {
    const { game } = await api.post('/games', { countryCode });
    navigate(`/game/${encodeURIComponent(game.id)}`);
  } catch (err) {
    Toast.show(err.message, 'error');
    StartScreen.update(form, { submitting: false });
  }
}

/**
 * A click on any `[data-action]` button: 'login', 'signup', 'logout', 'my-games', 'new-game'.
 *
 * @param {string} action
 */
async function handleAction(action) {
  // The header menu is a <details>, which stays open until something closes it.
  document.querySelector('.app-header__menu[open]')?.removeAttribute('open');

  switch (action) {
    case 'login':
    case 'signup':
      // Keep the path, so logging in from a game link returns to that game (DESIGN §3.1).
      navigate(`${location.pathname}#${action}`);
      break;
    case 'logout':
      await auth.logOut();
      goHome();
      break;
    case 'my-games':
      goHome('games');
      break;
    case 'new-game':
      goHome('start');
      break;
  }
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
  // Bad input never reaches Firebase, and never disables the form.
  const errors = validateCredentials(credentials);
  if (Object.keys(errors).length) {
    AuthForm.update(form, { errors });
    return;
  }

  AuthForm.update(form, { submitting: true });
  try {
    const { email, password } = credentials;
    await (mode === 'signup' ? auth.signUp(email, password) : auth.logIn(email, password));
    // Drop #login / #signup but keep the path: Home, or back to the game link (DESIGN §3.1).
    navigate(location.pathname);
  } catch (err) {
    const { message, toast } = authErrorMessage(err.code);
    if (toast) Toast.show(message, 'error');
    // Either way the form comes back usable; inline errors sit under the form, not one field.
    AuthForm.update(form, { formError: toast ? null : message });
  }
}

start();
