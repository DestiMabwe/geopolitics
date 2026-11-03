// Soldiers marching between castles (DESIGN §2 WorldMap). Decoration only: the numbers on the castle
// gates are the server's and change when the event is shown. This is a layer of its own, laid over the
// map, so a redraw of the map never wipes a march that is half way. The caller decides when to play
// (never in fast-forward or with reduced motion), and march.js decides who walks where.

const NS = 'http://www.w3.org/2000/svg';
// All inside the 1.4 s an event stays on screen at the normal pace.
const ADVANCE_MS = 1000;
const ENTER_MS = 700;
const MARCH_MS = 1000;
const FLASH_MS = 700;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
// How far along the road a waiting squad stands (the castles are well over 100 apart, so this is clear of both).
const HOLD_AT = 0.5;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children);
  return node;
}

/** A small formation of pawns: a round head over a tapering body, in the owner's colour. */
function squad(figures, color) {
  const group = svg('g', { class: 'march__squad', style: `--owner: ${color}` });
  // Drawn 1.5 times larger inside the squad, so a squad reads at a glance without being a crowd.
  const formation = svg('g', { transform: 'scale(1.5)' });
  group.append(formation);
  for (let i = 0; i < figures; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = (col - 1) * 8 + (row ? 4 : 0);
    const y = row * 9;
    formation.append(
      svg(
        'g',
        { class: 'march__figure', transform: `translate(${x} ${y})`, style: `animation-delay: ${i * 90}ms` },
        svg('path', { class: 'march__body', d: 'M-3.2 5.5L-2 -0.5h4L3.2 5.5z' }),
        svg('circle', { class: 'march__head', cx: 0, cy: -3.2, r: 2.6 }),
      ),
    );
  }
  return group;
}

const at = (p) => `translate(${p.x}px, ${p.y}px)`;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * @returns {{ element: SVGSVGElement, play(plan: object, view: object): void, clear(): void }}
 *   `plan` is a marchFor() result. `view` is `{ nodes, width, height, color }`: where the castles are on
 *   the canvas the map was drawn on, and the owner's colour (a CSS value) for the squad.
 */
export function create() {
  const element = svg('svg', { class: 'world-map__march', 'aria-hidden': 'true' });
  let held = null; // the squad waiting on the road during an attack

  const walk = (group, a, b, duration) => {
    group.style.transform = at(a);
    const move = group.animate([{ transform: at(a) }, { transform: at(b) }], { duration, easing: EASE, fill: 'forwards' });
    return move.finished.catch(() => {}); // a cancelled march (clear) is not an error
  };

  const flash = (point, color) => {
    const ring = svg('circle', { class: 'march__flash', cx: point.x, cy: point.y, r: 26, style: `--owner: ${color}` });
    element.append(ring);
    ring.animate(
      [{ transform: 'scale(0.4)', opacity: 0.9 }, { transform: 'scale(1.9)', opacity: 0 }],
      { duration: FLASH_MS, easing: EASE },
    ).finished.catch(() => {}).then(() => ring.remove());
  };

  const dropHeld = () => {
    held?.remove();
    held = null;
  };

  return {
    element,
    play(plan, { nodes, width, height, color }) {
      const a = nodes[plan.from];
      const b = nodes[plan.to];
      if (!a || !b) return;
      element.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const mid = lerp(a, b, HOLD_AT);

      if (plan.action === 'advance') {
        dropHeld();
        held = squad(plan.figures, color);
        element.append(held);
        walk(held, a, mid, ADVANCE_MS);
      } else if (plan.action === 'enter') {
        const group = held ?? squad(plan.figures, color);
        held = null;
        if (!group.isConnected) element.append(group);
        walk(group, mid, b, ENTER_MS).then(() => {
          group.remove();
          flash(b, color);
        });
      } else if (plan.action === 'retreat') {
        const group = held ?? squad(plan.figures, color);
        held = null;
        if (!group.isConnected) element.append(group);
        walk(group, mid, a, ENTER_MS).then(() => group.remove());
      } else if (plan.action === 'march') {
        const group = squad(plan.figures, color);
        element.append(group);
        walk(group, a, b, MARCH_MS).then(() => group.remove());
      }
    },
    clear() {
      held = null;
      element.replaceChildren();
    },
  };
}
