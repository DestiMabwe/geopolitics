import * as NationBoard from './components/NationBoard.js';
import * as TurnOrderBar from './components/TurnOrderBar.js';
import * as DicePanel from './components/DicePanel.js';
import * as EventLog from './components/EventLog.js';
import * as ActionBar from './components/ActionBar.js';
import * as SpectatorBanner from './components/SpectatorBanner.js';
import * as Toast from './components/Toast.js';
import { playerName } from './players.js';
import { startPolling } from './poll.js';
import { el } from './dom.js';

// The game page, /game/:id (DESIGN §3.3, S25b). Anyone with the link sees the board, the dice and
// the log; only the owner gets the ActionBar. Visitors poll every 2 s (ARCHITECTURE §3). Every number
// on screen comes from the server; the client only sends intent (CLAUDE.md hard rules).

const STALE_MS = 10_000;

// tokens.css --poll-interval (DESIGN §1), so the design owns the pace.
function pollMs() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--poll-interval')) || 2000;
}

/** The open game, or null. One game page at a time. */
let page = null;

/**
 * Opens (or redraws) the game page. Calling it again for the same game and user only redraws.
 *
 * @param {object} deps
 * @param {string} deps.id
 * @param {{ uid: string, email: string } | null} deps.user
 * @param {{ get: Function, post: Function }} deps.api
 * @param {(name: string) => HTMLElement} deps.slot  a slot in the visible view
 * @param {(user: object | null, status?: object) => void} deps.renderHeader
 */
export async function openGame(deps) {
  const uid = deps.user?.uid ?? null;
  if (page && page.id === deps.id && page.uid === uid) {
    draw();
    return;
  }
  closeGame();
  const mine = {
    ...deps, uid,
    game: null, events: [], error: null,
    selection: { from: null, to: null },
    pending: false, rolling: false,
    live: true, lastPoll: Date.now(), stopPolling: null,
  };
  page = mine;
  draw();

  try {
    await loadAll(mine);
  } catch (err) {
    if (page !== mine) return;
    mine.error = err.status === 404 ? 'There is no game at this link.' : 'The game could not be loaded. Try refreshing.';
  }
  if (page !== mine) return; // left the page while loading
  draw();
  if (mine.game && !mine.game.isOwner) {
    mine.stopPolling = startPolling(() => poll(mine), pollMs());
  }
}

/** Leaves the game page: stops polling and the keyboard shortcuts. */
export function closeGame() {
  page?.stopPolling?.();
  page = null;
}

// ── Loading and polling ──────────────────────────────────────────────

async function loadAll(p) {
  const { game } = await p.api.get(`/games/${p.id}`);
  p.game = game;
  p.events = await fetchEventsAfter(p, 0);
}

// GET /events returns at most 200 at a time (ARCHITECTURE §3), so keep asking until a short page.
async function fetchEventsAfter(p, after) {
  const all = [];
  for (;;) {
    const { events } = await p.api.get(`/games/${p.id}/events?after=${after}`);
    all.push(...events);
    if (events.length < 200) return all;
    after = events.at(-1).seq;
  }
}

async function poll(p) {
  try {
    const after = p.events.at(-1)?.seq ?? 0;
    const fresh = await fetchEventsAfter(p, after);
    if (page !== p) return;
    if (fresh.length) {
      p.game = (await p.api.get(`/games/${p.id}`)).game;
      p.events.push(...fresh);
    }
    p.live = true;
    p.lastPoll = Date.now();
    draw();
    SpectatorBanner.pulse(p.slot('spectator-banner'));
  } catch {
    if (page === p && Date.now() - p.lastPoll > STALE_MS && p.live) {
      p.live = false;
      draw();
    }
  }
}

// ── Owner actions ────────────────────────────────────────────────────

const ACTIONS = {
  attack: (p) => ['/attack', { from: p.selection.from, to: p.selection.to }],
  skip: () => ['/skip', {}],
  roll: () => ['/attack/roll', {}],
  stop: () => ['/attack/stop', {}],
  occupy: (p, { count, placeOn }) => ['/attack/occupy', { count, placements: { [placeOn]: p.game.attack.bonus } }],
};

async function act(action, detail) {
  const p = page;
  if (action === 'copy-link') return copyLink(p);
  if (!p || p.pending || !ACTIONS[action]) return;

  const [path, body] = ACTIONS[action](p, detail);
  p.pending = true;
  p.rolling = action === 'roll';
  draw();
  try {
    const res = await p.api.post(`/games/${p.id}${path}`, { version: p.game.version, ...body });
    if (page !== p) return;
    p.game = res.game;
    p.events.push(...res.events);
    p.selection = { from: null, to: null };
  } catch (err) {
    if (page !== p) return;
    Toast.show(err.message, 'error');
    // DESIGN §3.3: a 409 (stale version, wrong phase) refetches the game and re-renders.
    if (err.status === 409) await loadAll(p).catch(() => {});
  } finally {
    if (page === p) {
      p.pending = false;
      p.rolling = false;
      draw();
    }
  }
}

async function copyLink(p) {
  try {
    await navigator.clipboard.writeText(`${location.origin}/game/${p.id}`);
    Toast.show('Link copied. Anyone with it can watch.');
  } catch {
    Toast.show(`Copy this link: ${location.origin}/game/${p.id}`);
  }
}

// DESIGN §2 accessibility: R = roll, S = stop, while an attack is in progress.
document.addEventListener('keydown', (event) => {
  if (!page?.game?.isOwner || page.game.phase !== 'attacking' || page.game.turnOrder[page.game.currentTurn] !== 'human') return;
  if (event.target.closest?.('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'r') act('roll');
  if (key === 's') act('stop');
});

// ── Picking source and target ───────────────────────────────────────

function canPick(p) {
  const g = p.game;
  return g.isOwner && !p.pending && g.status === 'active' && g.phase === 'manoeuvre' && g.turnOrder[g.currentTurn] === 'human';
}

// Only a hint for the board; the server re-checks every rule in GAME_RULES §5.1.
function roleOf(p, code) {
  if (!canPick(p)) return null;
  const c = p.game.countries[code];
  const { from } = p.selection;
  if (c.owner === 'human' && c.soldiers >= 2) return 'selectable-source';
  if (from && c.owner !== 'human' && p.game.borders[from].includes(code)) return 'valid-target';
  return null;
}

function pick(code) {
  const p = page;
  const role = roleOf(p, code);
  if (code === p.selection.from) p.selection = { from: null, to: null };
  else if (role === 'selectable-source') p.selection = { from: code, to: null };
  else if (role === 'valid-target') p.selection = { ...p.selection, to: code };
  draw();
}

// ── Drawing ──────────────────────────────────────────────────────────

function draw() {
  const p = page;
  if (!p) return;
  const { slot, game } = p;
  const banner = slot('spectator-banner');
  const actionBar = slot('action-bar');

  if (!game) {
    p.renderHeader(p.user);
    banner.hidden = true;
    actionBar.hidden = true;
    slot('turn-order').replaceChildren();
    slot('board').replaceChildren(el('p', { class: 'game-message', 'aria-busy': String(!p.error) }, p.error ?? 'Loading the game…'));
    slot('dice').replaceChildren();
    slot('feed').replaceChildren();
    return;
  }

  p.renderHeader(p.user, {
    round: game.round,
    status: game.status,
    currentPlayer: game.status === 'active' ? playerName(game, game.turnOrder[game.currentTurn]) : null,
  });

  banner.hidden = game.isOwner;
  if (!game.isOwner) banner.replaceChildren(SpectatorBanner.render({ live: p.live, loggedIn: Boolean(p.user) }));

  slot('turn-order').replaceChildren(TurnOrderBar.render({ game }));
  slot('board').replaceChildren(
    NationBoard.render({ game, selection: p.selection, roleOf: (code) => roleOf(p, code), onPick: pick }),
  );

  actionBar.hidden = !game.isOwner;
  if (game.isOwner) {
    actionBar.replaceChildren(ActionBar.render({ game, selection: p.selection, pending: p.pending, onAction: act }));
  }

  const lastRoll = p.events.findLast((e) => e.type === 'roll') ?? null;
  slot('dice').replaceChildren(DicePanel.render({ roll: lastRoll, game, rolling: p.rolling }));

  const feed = slot('feed');
  feed.replaceChildren(EventLog.render({ events: p.events, game }));
  feed.scrollTop = feed.scrollHeight;
}
