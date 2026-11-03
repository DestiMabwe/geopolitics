// Replaying events one at a time (ARCHITECTURE §4.2, DESIGN §3.3). NPC turns come back from the server
// in one response, and a visitor's polls bring batches, so this plays them at a readable pace.
// Fast-forward only shortens the gaps: every event is still shown. Pacing never touches the game;
// the numbers on screen are the server's (CLAUDE.md hard rules). Pure (no DOM), so it runs in the unit tests.

// Slowed after human testers could not follow the replay. `turn` is how long "X's turn" stays up.
const DEFAULT_PACE = { roll: 1800, step: 1400, turn: 1500, rollFast: 120, stepFast: 120 };

/**
 * The pacing from tokens.css (`--replay-*`), in milliseconds.
 *
 * @param {(name: string) => string} getValue  e.g. a computed style's `getPropertyValue`
 * @returns {{ roll: number, step: number, turn: number, rollFast: number, stepFast: number }}
 */
export function readPace(getValue) {
  const ms = (name, fallback) => parseFloat(getValue(name)) || fallback;
  return {
    roll: ms('--replay-roll', DEFAULT_PACE.roll),
    step: ms('--replay-step', DEFAULT_PACE.step),
    turn: ms('--replay-turn', DEFAULT_PACE.turn),
    rollFast: ms('--replay-roll-fast', DEFAULT_PACE.rollFast),
    stepFast: ms('--replay-step-fast', DEFAULT_PACE.stepFast),
  };
}

/**
 * How long an event stays on screen before the next one.
 *
 * @param {{ type: string }} event
 * @param {boolean} fast
 * @param {typeof DEFAULT_PACE} pace
 * @returns {number} milliseconds
 */
export function delayFor(event, fast, pace) {
  const roll = event.type === 'roll';
  if (fast) return roll ? pace.rollFast : pace.stepFast; // fast-forward drops the turn pause too
  if (event.type === 'turnStart') return pace.turn;
  return roll ? pace.roll : pace.step;
}

/**
 * A queue that hands events to `onEvent` one at a time. The first is shown at once; each one then
 * holds the screen for its own delay. `onIdle` runs once the queue has emptied.
 *
 * @param {object} props
 * @param {typeof DEFAULT_PACE} props.pace
 * @param {boolean} [props.fast]
 * @param {(event: object) => void} props.onEvent
 * @param {() => void} props.onIdle
 * @returns {{ push(events: object[]): void, setFast(on: boolean): void, busy(): boolean, clear(): void }}
 */
export function createReplay({ pace, fast = false, onEvent, onIdle }) {
  let queue = [];
  let timer = null;
  let running = false;

  const next = () => {
    timer = null;
    const event = queue.shift();
    if (!event) {
      running = false;
      onIdle();
      return;
    }
    onEvent(event);
    timer = setTimeout(next, delayFor(event, fast, pace));
  };

  return {
    push(events) {
      queue.push(...events);
      if (!running && queue.length) {
        running = true;
        next();
      }
    },
    setFast(on) {
      fast = on;
    },
    busy: () => running,
    clear() {
      clearTimeout(timer);
      queue = [];
      running = false;
    },
  };
}

/**
 * The board as it looks once the replay reaches `event`: the server's own numbers from the event
 * (soldiers left, the new owner), nothing worked out here. Other events change nothing on the board.
 * The final server state replaces this view when the replay ends. Never changes `game`.
 *
 * @param {object} game  the public game
 * @param {{ type: string, round?: number, data: object }} event
 * @returns {object} a new game
 */
export function viewAfter(game, event) {
  const d = event.data ?? {};
  const withCountry = (code, change) => ({ ...game.countries, [code]: { ...game.countries[code], ...change } });

  switch (event.type) {
    case 'turnStart': {
      const index = game.turnOrder.indexOf(d.player);
      return { ...game, round: event.round ?? game.round, currentTurn: index === -1 ? game.currentTurn : index };
    }
    case 'attackStart':
      return { ...game, attack: { from: d.from, to: d.to } };
    case 'roll':
      return {
        ...game,
        countries: { ...withCountry(d.from, { soldiers: d.attackerLeft }), [d.to]: { ...game.countries[d.to], soldiers: d.defenderLeft } },
      };
    case 'conquest':
      return { ...game, countries: withCountry(d.to, { owner: d.player }), attack: null };
    case 'occupy':
    case 'attackFailed':
    case 'attackStopped':
      return { ...game, attack: null };
    default:
      return game;
  }
}

/**
 * Folds freshly fetched events into the list. A seq already held is replaced (it may have gained its
 * saved commentary); a new seq is appended and reported as fresh, to be replayed.
 *
 * @param {{ seq: number }[]} existing
 * @param {{ seq: number }[]} fetched
 * @returns {{ events: object[], fresh: object[] }} the merged list in seq order, and the new events
 */
export function mergeEvents(existing, fetched) {
  const bySeq = new Map(existing.map((e) => [e.seq, e]));
  const fresh = [];
  for (const event of fetched) {
    if (!bySeq.has(event.seq)) fresh.push(event);
    bySeq.set(event.seq, event);
  }
  return {
    events: [...bySeq.values()].sort((a, b) => a.seq - b.seq),
    fresh: fresh.sort((a, b) => a.seq - b.seq),
  };
}
