import { project, spread, borderLinks } from '../worldMap.js';
import { ownerSlot } from '../players.js';

// DESIGN §2 WorldMap (S26a): inline SVG, no map library. Each country sits at its capital, border links
// are lines, and a node shows its owner colour and soldiers. Tapping a node does the same as tapping its
// card. It is a pointer convenience: the NationBoard below has the same information and the keyboard
// controls, so the map is hidden from assistive technology rather than doubling every tab stop.

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 400;
const HEIGHT = 300;
const PADDING = 36;
const RADIUS = 18;
// Two discs and the code label under each, so no two nodes are drawn closer than this (QA ISSUE-J).
const MIN_DISTANCE = 2 * RADIUS + 16;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children);
  return node;
}

/**
 * @param {object} props
 * @param {object} props.game  the public game from the server
 * @param {{ from?: string | null, to?: string | null }} [props.selection]
 * @param {(code: string) => 'selectable-source' | 'valid-target' | null} [props.roleOf]  which nodes can be picked
 * @param {(code: string) => void} [props.onPick]
 * @returns {SVGSVGElement}
 */
export function render({ game, selection = {}, roleOf = () => null, onPick = () => {} }) {
  const box = { width: WIDTH, height: HEIGHT, padding: PADDING };
  // Capitals can be close together, so the true positions are nudged apart until nothing overlaps.
  const nodes = spread(project(game.countries, box), { minDistance: MIN_DISTANCE, ...box });
  const from = game.attack?.from ?? selection.from ?? null;
  const to = game.attack?.to ?? selection.to ?? null;

  const links = borderLinks(game.borders).map(([a, b]) =>
    svg('line', { class: 'world-map__link', x1: nodes[a].x, y1: nodes[a].y, x2: nodes[b].x, y2: nodes[b].y }),
  );

  const dots = Object.entries(game.countries).map(([code, c]) => {
    const role = roleOf(code);
    const classes = ['world-map__node'];
    if (role) classes.push('world-map__node--pickable', `world-map__node--${role}`);
    if (code === from) classes.push('world-map__node--source');
    if (code === to) classes.push(game.attack ? 'world-map__node--under-attack' : 'world-map__node--target');
    const { x, y } = nodes[code];
    return svg(
      'g',
      { class: classes.join(' '), 'data-code': code, style: `--owner: var(--owner-${ownerSlot(game, c.owner)})` },
      svg('circle', { class: 'world-map__disc', cx: x, cy: y, r: RADIUS }),
      svg('text', { class: 'world-map__soldiers', x, y }, String(c.soldiers)),
      svg('text', { class: 'world-map__code', x, y: y + RADIUS + 12 }, code),
    );
  });

  const map = svg('svg', { class: 'world-map', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, 'aria-hidden': 'true' }, ...links, ...dots);
  map.addEventListener('click', (event) => {
    const node = event.target.closest('[data-code]');
    if (node && roleOf(node.dataset.code)) onPick(node.dataset.code);
  });
  return map;
}
