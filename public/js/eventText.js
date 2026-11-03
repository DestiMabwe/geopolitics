// A plain line per event for the game page's event log (GAME_RULES §10). Every number in a
// line comes from the event itself; the browser only puts words around it. The LLM
// commentary (S16b) replaces these later. Pure (no DOM), so it runs in the unit tests.

import { playerName, isYou } from './players.js';

/**
 * How the latest attack ended, read from the event list, for the DicePanel (DESIGN §2: conquered /
 * failed / stopped). Looks back for the newest attack event and ignores everything else (rolls,
 * turn starts). An attack that has started but not ended, or no attack at all, gives null.
 * `conquest` and the `occupy` after it both read as 'conquered'.
 *
 * @param {{ type: string, data: object }[]} events  event docs from the server, oldest first
 * @returns {{ kind: 'conquered' | 'failed' | 'stopped', from: string, to: string } | null}
 */
export function attackOutcome(events) {
  const e = events.findLast((ev) => ev.type in ATTACK_EVENTS);
  const kind = e && ATTACK_EVENTS[e.type];
  return kind ? { kind, from: e.data.from, to: e.data.to } : null;
}

// The events that mark an attack's progress. `attackStart` maps to null: the newest attack has not ended.
const ATTACK_EVENTS = {
  attackStart: null,
  conquest: 'conquered',
  occupy: 'conquered',
  attackFailed: 'failed',
  attackStopped: 'stopped',
};

/**
 * The roll the DicePanel should show: the newest `roll` of the attack in progress (or of the newest
 * attack, once it has ended). A roll from an earlier attack is never shown, so a fresh attack starts
 * with an empty panel (QA 2026-11-03 ISSUE-G).
 *
 * @param {{ type: string }[]} events  event docs from the server, oldest first
 * @returns {{ type: string, data: object } | null}  null when the newest attack has not rolled yet, or there is none
 */
export function latestRoll(events) {
  const start = events.findLastIndex((ev) => ev.type === 'attackStart');
  if (start === -1) return null;
  return events.slice(start + 1).findLast((ev) => ev.type === 'roll') ?? null;
}

/**
 * Whether the newest attack is still going: it has started and not yet been conquered, failed or
 * stopped. The DicePanel uses it to say "No dice rolled yet" instead of "Pick a target".
 *
 * @param {{ type: string }[]} events  oldest first
 * @returns {boolean}
 */
export function attackInProgress(events) {
  const newest = events.findLast((ev) => ev.type in ATTACK_EVENTS);
  return newest?.type === 'attackStart';
}

// The NPC decisions that carry a `reason` from the engine (GAME_RULES §10, S33a).
const REASON_EVENTS = new Set(['reinforce', 'attackStart', 'skip', 'attackStopped', 'occupy']);

/**
 * The engine's one-line reason for an NPC decision, for the feed's muted second line (S33b).
 * Only the five decision events carry one; a roll or conquest never does, even if a stray
 * `reason` is present. Gives '' (so nothing is drawn) when there is no usable reason.
 *
 * @param {{ type: string, data?: { reason?: unknown } }} event
 * @returns {string}  the trimmed reason, or ''
 */
export function eventReason(event) {
  const reason = event.data?.reason;
  if (!REASON_EVENTS.has(event.type) || typeof reason !== 'string') return '';
  return reason.trim();
}

// The events worth announcing when a fast-forwarded turn is summarised for a screen reader.
const NOTABLE = new Set(['conquest', 'elimination', 'gameOver']);

/**
 * One short line for a replayed turn, so fast-forward doesn't make a screen reader read every roll
 * (DESIGN §2): who played, then any conquest, elimination or game-ending event, in the usual words.
 *
 * @param {{ type: string, data: object }[]} events  the events of the turn, oldest first
 * @param {object} game
 * @returns {string}  empty when there is nothing to report
 */
export function turnSummary(events, game) {
  const start = events.find((e) => e.type === 'turnStart');
  const lead = start ? `${playerName(game, start.data.player)} played.` : null;
  const notable = events.filter((e) => NOTABLE.has(e.type)).map((e) => eventText(e, game));
  return [lead, ...notable].filter(Boolean).join(' ');
}

// GAME_RULES §9.2: after a loss the `winner` is only whoever owns the most countries, so say that
// instead of "wins" (QA 2026-11-03 ISSUE-C). Shared with the Defeat dialog.
export function mostCountriesLine(game, winner) {
  return winner ? `${playerName(game, winner)} holds the most countries.` : 'Tied for the most countries.';
}

// The last line of a game. The human player is "you" to the owner and a named country to a visitor.
function gameOverText(d, game) {
  const winner = mostCountriesLine(game, d.winner);
  if (isYou(game, 'human')) return d.status === 'won' ? 'You conquer the world. Victory!' : `Defeat. ${winner}`;
  const human = playerName(game, 'human');
  return d.status === 'won' ? `${human} conquers the world. Victory!` : `${human} is defeated. ${winner}`;
}

/**
 * @param {{ type: string, round?: number, data: object }} event  an event doc from the server
 * @param {object} game
 * @returns {string}
 */
export function eventText(event, game) {
  const d = event.data ?? {};
  const who = playerName(game, d.player);
  const name = (code) => game.countries[code]?.name ?? code;
  const you = isYou(game, d.player);
  const verb = (second, third) => (you ? second : third);

  switch (event.type) {
    case 'turnStart': {
      // Stored events keep `round` beside `data` (gameModel.toEventDoc), not inside it.
      const round = event.round ?? d.round;
      return you ? `Round ${round}: your turn.` : `Round ${round}: ${who}'s turn.`;
    }
    case 'attackStart':
      return `${who} ${verb('attack', 'attacks')} ${name(d.to)} from ${name(d.from)}.`;
    case 'roll':
      return `${d.attackerDice.join(', ')} against ${d.defenderDice.join(', ')}: ` +
        `${name(d.from)} loses ${d.attackerLosses}, ${name(d.to)} loses ${d.defenderLosses} ` +
        `(${d.attackerLeft} vs ${d.defenderLeft}).`;
    case 'conquest':
      return `${who} ${verb('conquer', 'conquers')} ${name(d.to)} and ${verb('earn', 'earns')} ${d.bonus} new soldiers.`;
    case 'occupy':
      return `${who} ${verb('move', 'moves')} ${d.count} into ${name(d.to)}.`;
    case 'attackFailed':
      return `The attack on ${name(d.to)} fails. ${name(d.from)} holds with 1 soldier.`;
    case 'attackStopped':
      return `${who} ${verb('stop', 'stops')} the attack on ${name(d.to)}.`;
    case 'skip':
      return `${who} ${verb('hold', 'holds')} position.`;
    case 'reinforce':
      return `${who} ${verb('place', 'places')} ${d.amount} new soldiers.`;
    case 'transfer':
      return `${who} ${verb('move', 'moves')} ${d.count} from ${name(d.from)} to ${name(d.to)}.`;
    case 'elimination':
      return `${who} ${verb('are', 'is')} eliminated by ${playerName(game, d.by)}.`;
    case 'gameOver':
      return gameOverText(d, game);
    default:
      return event.type;
  }
}
