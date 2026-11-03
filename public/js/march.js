// Which soldiers walk where on the castle map (agreed design, 2026-11-03). Pure (no DOM), so it runs in
// the unit tests. A march is decoration: the numbers on the castle gates are the server's and change when
// the event is shown. A squad is capped, so a big army is a picture and never a count.

/** The most figures one squad is drawn with, however many soldiers really move. */
export const MAX_FIGURES = 5;
// An attack has no count of its own, so its squad is a fixed small band.
const ATTACK_FIGURES = 3;

const MOVES = new Set(['occupy', 'transfer']);
const ACTIONS = { attackStart: 'advance', conquest: 'enter', attackFailed: 'retreat', attackStopped: 'retreat' };

/**
 * The march for one event, or null when no soldiers walk between castles.
 *
 * - `advance`: a squad leaves `from` and waits on the road toward `to` while the attack lasts
 * - `enter`: that squad marches into the conquered castle
 * - `retreat`: that squad goes home (the attack failed or was stopped)
 * - `march`: soldiers moving in after a conquest, or a transfer, walk from `from` to `to`
 *
 * @param {{ type: string, data?: { player?: string, from?: string, to?: string, count?: number } }} event
 * @returns {{ action: 'advance' | 'enter' | 'retreat' | 'march', from: string, to: string, figures: number, owner: string } | null}
 */
export function marchFor(event) {
  const d = event.data ?? {};
  if (!d.from || !d.to) return null;
  if (MOVES.has(event.type)) {
    const figures = Math.min(MAX_FIGURES, Math.max(1, Math.round(d.count ?? 1)));
    return { action: 'march', from: d.from, to: d.to, figures, owner: d.player };
  }
  const action = ACTIONS[event.type];
  return action ? { action, from: d.from, to: d.to, figures: ATTACK_FIGURES, owner: d.player } : null;
}
