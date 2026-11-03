import * as NationBoard from './components/NationBoard.js';
import * as TurnOrderBar from './components/TurnOrderBar.js';
import * as DicePanel from './components/DicePanel.js';
import * as CommentaryFeed from './components/CommentaryFeed.js';
import * as FastForwardToggle from './components/FastForwardToggle.js';
import * as WorldMap from './components/WorldMap.js';
import * as GameOverDialog from './components/GameOverDialog.js';
import * as ActionBar from './components/ActionBar.js';
import * as SpectatorBanner from './components/SpectatorBanner.js';
import * as Toast from './components/Toast.js';
import * as LoadError from './components/LoadError.js';
import { loadErrorMessage } from './loadError.js';
import { playerName } from './players.js';
import { attackOutcome, attackInProgress, latestRoll, turnSummary } from './eventText.js';
import { gameOverSummary } from './gameOver.js';
import { wantsAiLine, commentaryPath } from './commentary.js';
import { createReplay, readPace, viewAfter, mergeEvents } from './replay.js';
import { loadFast, saveFast } from './fastForward.js';
import { startPolling } from './poll.js';
import { el, replaceKeepingFocus } from './dom.js';

// The game page, /game/:id (DESIGN §3.3, S25b, S28). Anyone with the link sees the board, the dice and
// the feed; only the owner gets the ActionBar. Every number on screen comes from the server; the client
// only sends intent (CLAUDE.md hard rules).
//
// Two copies of the game are kept. `game` is the server's latest. `shown` is what the screen has
// reached: NPC turns and visitors' polled batches come back in one piece, and are replayed one event
// at a time (replay.js) while `shown` catches up. When the replay ends `shown` becomes `game`.

const STALE_MS = 10_000;
// A visitor's poll re-reads this many of the newest events, to pick up commentary saved after they
// first saw the event (ARCHITECTURE §4.3, §4.4).
const POLL_OVERLAP = 12;

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
  const fast = loadFast();
  const mine = {
    ...deps, uid,
    game: null, shown: null, events: [], shownCount: 0, error: null,
    selection: { from: null, to: null },
    pending: false, rolling: false, panel: null,
    fast, replaying: false, npcPaused: false, pendingAi: new Set(),
    replayed: [], summary: '', barKey: null, dialog: null, gameOverDismissed: false,
    live: true, lastPoll: Date.now(), stopPolling: null,
    replay: null,
  };
  mine.replay = createReplay({
    pace: readPace((name) => getComputedStyle(document.documentElement).getPropertyValue(name)),
    fast,
    onEvent: (event) => showEvent(mine, event),
    onIdle: () => finishReplay(mine),
  });
  page = mine;
  draw();
  await load(mine);
}

/** First load, and every Try again after a failure. */
async function load(p) {
  p.retryable = false;
  try {
    await loadAll(p);
  } catch (err) {
    if (page !== p) return;
    p.error = err.status === 404 ? 'There is no game at this link.' : loadErrorMessage(err);
    p.retryable = err.status !== 404; // a missing game stays missing
  }
  if (page !== p) return; // left the page while loading
  draw();
  if (p.game && !p.game.isOwner) {
    p.stopPolling = startPolling(() => poll(p), pollMs());
  } else {
    driveNpc(p);
  }
}

function retryLoad(p) {
  p.error = null;
  draw(); // back to "Loading the game…" while the new attempt runs
  load(p);
}

/** Leaves the game page: stops polling, the replay and the keyboard shortcuts. */
export function closeGame() {
  page?.stopPolling?.();
  page?.replay?.clear();
  GameOverDialog.dismiss(page?.dialog);
  page = null;
}

// ── Loading and polling ──────────────────────────────────────────────

async function loadAll(p) {
  const { game } = await p.api.get(`/games/${p.id}`);
  p.game = game;
  p.events = await fetchEventsAfter(p, 0);
  showAll(p);
}

// Everything is on screen: nothing left to replay.
function showAll(p) {
  p.shown = p.game;
  p.shownCount = p.events.length;
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
    const after = Math.max(0, (p.events.at(-1)?.seq ?? 0) - POLL_OVERLAP);
    const fetched = await fetchEventsAfter(p, after);
    if (page !== p) return;
    const { events, fresh } = mergeEvents(p.events, fetched);
    if (fresh.length) {
      p.game = (await p.api.get(`/games/${p.id}`)).game;
      if (page !== p) return;
    }
    // Same order and length for old events, so what the replay has shown so far still lines up.
    p.events = events;
    if (fresh.length) replayEvents(p, fresh);
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

// ── Replaying events ─────────────────────────────────────────────────

// `p.events` already holds `fresh` (they are the newest); the screen reaches them one at a time.
function replayEvents(p, fresh) {
  if (!fresh.length) return finishReplay(p);
  p.replaying = true;
  p.summary = '';
  p.replay.push(fresh);
}

function showEvent(p, event) {
  if (page !== p) return;
  p.shown = viewAfter(p.shown, event);
  p.shownCount += 1;
  p.replayed.push(event);
  draw();
  // DESIGN §3.3: fast-forward uses the template lines and skips the LLM.
  if (!p.fast) requestCommentary(p, event);
}

function finishReplay(p) {
  if (page !== p) return;
  p.replaying = false;
  // DESIGN §2: with fast-forward on, a screen reader hears one line per turn instead of every event.
  p.summary = p.fast ? turnSummary(p.replayed, p.game) : '';
  p.replayed = [];
  showAll(p);
  draw();
  driveNpc(p);
}

// ARCHITECTURE §4.3: the template line is already on screen; the LLM line swaps in when it arrives,
// and a failure leaves the template. Never blocks play. Only the owner can ask (the endpoint needs a login).
async function requestCommentary(p, event) {
  if (!p.game?.isOwner || !wantsAiLine(event) || p.pendingAi.has(event.seq)) return;
  p.pendingAi.add(event.seq);
  draw();
  try {
    const { text } = await p.api.post(commentaryPath(p.id, event.seq), {});
    event.aiText = text;
  } catch {
    // The template line stays.
  } finally {
    p.pendingAi.delete(event.seq);
    if (page === p) draw();
  }
}

function toggleFast() {
  const p = page;
  if (!p) return;
  p.fast = !p.fast;
  saveFast(p.fast);
  p.replay.setFast(p.fast);
  draw();
}

// ── NPC turns ────────────────────────────────────────────────────────

const isNpcTurn = (g) => g.status === 'active' && g.turnOrder[g.currentTurn] !== 'human';

// ARCHITECTURE §4.2: one request plays one NPC's whole turn; its events are then replayed. When the
// replay ends, this runs again, so the NPCs play in turn until it is the human's turn or the game ends.
async function driveNpc(p) {
  if (page !== p || !p.game?.isOwner || p.pending || p.replaying || p.npcPaused || !isNpcTurn(p.game)) return;

  p.pending = true;
  draw();
  try {
    const res = await p.api.post(`/games/${p.id}/npc-turn`, { version: p.game.version });
    if (page !== p) return;
    p.game = res.game;
    p.events.push(...res.events);
    replayEvents(p, res.events);
  } catch (err) {
    if (page !== p) return;
    Toast.show(err.message, 'error');
    p.npcPaused = true;
    if (err.status === 409) await loadAll(p).catch(() => {});
  } finally {
    if (page === p) {
      p.pending = false;
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
  occupy: (p, { count, placements }) => ['/attack/occupy', { count, placements }],
  reinforce: (p, { placements }) => ['/reinforce', { placements }],
  transfer: (p, { from, to, count }) => ['/transfer', { from, to, count }],
};

async function act(action, detail) {
  const p = page;
  if (action === 'copy-link') return copyLink(p);
  if (action === 'toggle-transfer') {
    if (p && !p.pending && !p.replaying) {
      p.panel = p.panel === 'transfer' ? null : 'transfer';
      draw();
    }
    return;
  }
  if (action === 'npc-continue') {
    if (p) {
      p.npcPaused = false;
      driveNpc(p);
    }
    return;
  }
  if (!p || p.pending || p.replaying || !ACTIONS[action]) return;

  const [path, body] = ACTIONS[action](p, detail);
  p.pending = true;
  p.rolling = action === 'roll';
  draw();
  try {
    const res = await p.api.post(`/games/${p.id}${path}`, { version: p.game.version, ...body });
    if (page !== p) return;
    p.game = res.game;
    p.events.push(...res.events);
    showAll(p); // the player's own move is shown at once; only NPC turns are replayed
    p.selection = { from: null, to: null };
    // Transfers can repeat, so that panel stays open; any other move closes it.
    if (action !== 'transfer') p.panel = null;
    for (const event of res.events) requestCommentary(p, event);
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
      driveNpc(p);
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

// DESIGN §2 accessibility: R = roll, S = stop, while an attack is in progress; F = fast-forward.
document.addEventListener('keydown', (event) => {
  if (!page?.game || event.target.closest?.('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'f' && fastForwardVisible(page)) toggleFast();
  if (!page.game.isOwner || page.replaying || page.game.phase !== 'attacking' || page.game.turnOrder[page.game.currentTurn] !== 'human') return;
  if (key === 'r') act('roll');
  if (key === 's') act('stop');
});

// ── Picking source and target ───────────────────────────────────────

function canPick(p) {
  const g = p.game;
  return g.isOwner && !p.pending && !p.replaying && g.status === 'active' && g.phase === 'manoeuvre' && g.turnOrder[g.currentTurn] === 'human';
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

// DESIGN §2: the switch shows while NPC turns are playing or being replayed, to the owner and to visitors.
function fastForwardVisible(p) {
  return p.replaying || (p.game.isOwner && isNpcTurn(p.game));
}

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
    slot('map').replaceChildren();
    slot('board').replaceChildren(
      p.error
        ? LoadError.render({ message: p.error, onRetry: p.retryable ? () => retryLoad(p) : null })
        : el('p', { class: 'game-message', 'aria-busy': 'true' }, 'Loading the game…'),
    );
    slot('dice').replaceChildren();
    slot('feed').replaceChildren();
    return;
  }

  // The screen's view of the game: it trails `game` while a replay is playing.
  const view = p.shown ?? game;
  const events = p.events.slice(0, p.shownCount);

  p.renderHeader(p.user, {
    round: view.round,
    status: view.status,
    isOwner: game.isOwner,
    currentPlayer: view.status === 'active' ? playerName(view, view.turnOrder[view.currentTurn]) : null,
  });

  banner.hidden = game.isOwner;
  if (!game.isOwner) banner.replaceChildren(SpectatorBanner.render({ live: p.live, loggedIn: Boolean(p.user), status: view.status }));

  slot('turn-order').replaceChildren(TurnOrderBar.render({ game: view }));
  const boardProps = { game: view, selection: p.selection, roleOf: (code) => roleOf(p, code), onPick: pick };
  slot('map').replaceChildren(WorldMap.render(boardProps));
  replaceKeepingFocus(slot('board'), NationBoard.render(boardProps));

  actionBar.hidden = !game.isOwner;
  if (game.isOwner) {
    // Rebuilt only when something it shows has changed. Commentary arriving mid-occupy would otherwise
    // wipe the bonus the player has half placed.
    const barKey = JSON.stringify([game.version, game.status, game.phase, game.currentTurn, p.selection, p.pending, p.panel, p.replaying, p.npcPaused]);
    if (barKey !== p.barKey || !actionBar.hasChildNodes()) {
      p.barKey = barKey;
      replaceKeepingFocus(
        actionBar,
        ActionBar.render({ game, selection: p.selection, pending: p.pending, panel: p.panel, replaying: p.replaying, npcPaused: p.npcPaused, onAction: act }),
      );
    }
  }

  // Only the current attack's dice: the previous fight's must not linger when a new attack starts (QA ISSUE-G).
  slot('dice').replaceChildren(
    DicePanel.render({ roll: latestRoll(events), game: view, rolling: p.rolling, attacking: attackInProgress(events), outcome: attackOutcome(events) }),
  );

  const feed = slot('feed');
  replaceKeepingFocus(
    feed,
    ...(fastForwardVisible(p) ? [FastForwardToggle.render({ on: p.fast, onToggle: toggleFast })] : []),
    ...(p.summary ? [el('p', { class: 'visually-hidden', role: 'status' }, p.summary)] : []),
    CommentaryFeed.render({ events, game: view, pendingAi: p.pendingAi, fast: p.fast }),
  );
  feed.scrollTop = feed.scrollHeight;

  showGameOver(p);
}

// DESIGN §3.3 game-over: the dialog opens over the board once the replay has played out, for the owner.
function showGameOver(p) {
  const { game } = p;
  if (!game.isOwner || p.replaying || game.status === 'active' || p.dialog || p.gameOverDismissed) return;
  p.dialog = GameOverDialog.show({
    summary: gameOverSummary(game),
    onClose: () => {
      p.dialog = null;
      p.gameOverDismissed = true;
    },
  });
}
