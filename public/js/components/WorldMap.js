import { layoutCastles, borderLinks, shortName, groundOutline } from '../worldMap.js';
import { ownerSlot } from '../players.js';
import { FACES, GATE_FACE, SHADOW, FLAG_POLE, FLAG, FLAG_BOX, CROWN, RING, LABEL_Y } from '../castle.js';
import { flagPath } from '../flags.js';

// DESIGN §2 WorldMap: inline SVG, no map library. Each country is a 2.5D castle on a slightly tilted board:
// far rows sit closer and a little smaller, and every castle stands upright at its own scale. Border links are dashed roads. A castle shows its owner's colour, its soldier count
// on the gate and its name below. Tapping a castle does the same as tapping its card. It is a pointer
// convenience: the NationBoard below has the same information and the keyboard controls, so the map is
// hidden from assistive technology rather than doubling every tab stop. Soldiers marching between castles
// are drawn by MarchLayer, in a layer of their own that survives redraws.

const NS = 'http://www.w3.org/2000/svg';
// Names fit under a castle on the wide canvas; on the phone canvas the 3-letter code is used instead.
const NAME_MAX = 13;

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children.filter(Boolean)); // `cond && svg(...)` leaves false, which must not become text
  return node;
}

/**
 * The country's real flag on its pole (not the owner's: the walls change colour to show who holds it).
 * If the image cannot be loaded, a coloured pennant in the owner's colour takes its place.
 */
function flagFor(code) {
  const url = flagPath(code);
  const pennant = () => svg('path', { class: 'world-map__flag', d: FLAG });
  if (!url) return pennant();
  const image = svg('image', { class: 'world-map__flag-image', href: url, ...FLAG_BOX, preserveAspectRatio: 'none' });
  image.addEventListener('error', () => image.replaceWith(pennant()));
  return svg('g', { class: 'world-map__flag-group' }, image, svg('rect', { class: 'world-map__flag-frame', ...FLAG_BOX }));
}

/** True on a phone, where the portrait canvas keeps a castle finger-sized (DESIGN §4). */
export function isCompact() {
  return globalThis.matchMedia?.('(max-width: 767px)').matches ?? false;
}

/**
 * @param {object} props
 * @param {object} props.game  the public game from the server
 * @param {{ from?: string | null, to?: string | null }} [props.selection]
 * @param {(code: string) => 'selectable-source' | 'valid-target' | null} [props.roleOf]  which castles can be picked
 * @param {(code: string) => void} [props.onPick]
 * @param {boolean} [props.compact]  the phone canvas; read from the screen width when left out
 * @returns {SVGSVGElement}
 */
export function render({ game, selection = {}, roleOf = () => null, onPick = () => {}, compact = isCompact() }) {
  const { nodes, width, height } = layoutCastles(game.countries, { compact, borders: game.borders });
  const from = game.attack?.from ?? selection.from ?? null;
  const to = game.attack?.to ?? selection.to ?? null;
  const home = game.players?.human?.homeCode ?? null;

  const links = borderLinks(game.borders).map(([a, b]) => {
    const onRoute = game.attack && ((a === from && b === to) || (a === to && b === from));
    return svg('line', {
      class: `world-map__link${onRoute ? ' world-map__link--attack' : ''}`,
      x1: nodes[a].x, y1: nodes[a].y, x2: nodes[b].x, y2: nodes[b].y,
    });
  });

  // Far castles first, so a nearer castle is drawn over a farther one.
  const farToNear = Object.entries(game.countries).sort((a, b) => nodes[a[0]].y - nodes[b[0]].y || a[0].localeCompare(b[0]));
  const castles = farToNear.map(([code, c]) => {
    const role = roleOf(code);
    const classes = ['world-map__node'];
    if (role) classes.push('world-map__node--pickable', `world-map__node--${role}`);
    if (code === from) classes.push('world-map__node--source');
    if (code === to) classes.push(game.attack ? 'world-map__node--under-attack' : 'world-map__node--target');
    const { x, y, scale = 1 } = nodes[code];
    const name = c.name ?? code;
    const digits = String(c.soldiers);
    return svg(
      'g',
      {
        class: classes.join(' '),
        'data-code': code,
        transform: `translate(${x} ${y}) scale(${scale})`,
        style: `--owner: var(--owner-${ownerSlot(game, c.owner)})`,
      },
      svg('title', {}, `${name} (${code}): ${digits} soldiers`),
      svg('rect', { class: 'world-map__ring', ...RING }),
      svg('ellipse', { class: 'castle__shadow', ...SHADOW }),
      ...FACES.map((f) => svg('path', { class: `castle__face castle__face--${f.tone}`, d: f.d })),
      svg('path', { class: 'world-map__gate', d: GATE_FACE.d }),
      svg('path', { class: 'world-map__flag-pole', d: FLAG_POLE }),
      flagFor(code),
      code === home && svg('path', { class: 'world-map__crown', d: CROWN }),
      svg('text', { class: digits.length > 2 ? 'world-map__soldiers world-map__soldiers--wide' : 'world-map__soldiers', x: 0, y: 12 }, digits),
      svg('text', { class: 'world-map__name', x: 0, y: LABEL_Y }, compact ? code : shortName(name, NAME_MAX)),
    );
  });

  // The ground the castles stand on: a trapezoid, narrower at the far edge, which is what sells the tilt.
  const ground = svg('polygon', { class: 'world-map__ground', points: groundOutline({ compact }).map((p) => `${p.x},${p.y}`).join(' ') });
  const map = svg('svg', { class: 'world-map', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' }, ground, ...links, ...castles);
  map.addEventListener('click', (event) => {
    const node = event.target.closest('[data-code]');
    if (node && roleOf(node.dataset.code)) onPick(node.dataset.code);
  });
  return map;
}
