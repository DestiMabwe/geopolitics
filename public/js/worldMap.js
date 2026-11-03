// The maths behind the WorldMap (DESIGN §2, S26a). Pure (no DOM), so it runs in the unit tests.

// A group on one meridian or parallel has no span to scale by; this many degrees stops a divide by zero.
const MIN_SPAN = 1;

// spread(): the passes it may take, the angle (radians) that fans coincident nodes out, and the extra push.
const MAX_SPREAD_PASSES = 500;
const GOLDEN_ANGLE = 2.399963;
const SPREAD_SLACK = 0.01;

/**
 * Places each country at its capital on an equirectangular projection (longitude is x, latitude is y,
 * one scale for both), zoomed so the whole group fits the box with `padding` to spare and sits in
 * the middle. North is up.
 *
 * @param {Record<string, { lat: number, lng: number }>} countries
 * @param {{ width?: number, height?: number, padding?: number }} [box]
 * @returns {Record<string, { x: number, y: number }>}
 */
export function project(countries, { width = 400, height = 300, padding = 36 } = {}) {
  const points = Object.values(countries);
  const lats = points.map((c) => c.lat);
  const lngs = points.map((c) => c.lng);
  const [minLng, maxLng, minLat, maxLat] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const spanLng = Math.max(maxLng - minLng, MIN_SPAN);
  const spanLat = Math.max(maxLat - minLat, MIN_SPAN);

  const scale = Math.min((width - 2 * padding) / spanLng, (height - 2 * padding) / spanLat);
  const offsetX = (width - (maxLng - minLng) * scale) / 2;
  const offsetY = (height - (maxLat - minLat) * scale) / 2;

  return Object.fromEntries(
    Object.entries(countries).map(([code, c]) => [code, { x: offsetX + (c.lng - minLng) * scale, y: offsetY + (maxLat - c.lat) * scale }]),
  );
}

/**
 * Pushes nodes apart until no two are closer than `minDistance`, so countries whose capitals are
 * close do not draw on top of each other (QA 2026-11-03 ISSUE-J). Everything stays inside the box,
 * `padding` from each edge. Deterministic (no randomness): the same input always gives the same map.
 * Nodes that are already far enough apart are not moved. Does not change what it was given.
 *
 * @param {Record<string, { x: number, y: number }>} nodes  from project()
 * @param {{ minDistance: number, width?: number, height?: number, padding?: number }} options
 * @returns {Record<string, { x: number, y: number }>}
 */
export function spread(nodes, { minDistance, width = 400, height = 300, padding = 36 }) {
  // Sorted, so the result does not depend on the order the server listed the countries in.
  const codes = Object.keys(nodes).sort();
  const pos = Object.fromEntries(codes.map((code) => [code, { ...nodes[code] }]));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const keepInside = (p) => {
    p.x = clamp(p.x, padding, width - padding);
    p.y = clamp(p.y, padding, height - padding);
  };

  for (let pass = 0; pass < MAX_SPREAD_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < codes.length; i += 1) {
      for (let j = i + 1; j < codes.length; j += 1) {
        const a = pos[codes[i]];
        const b = pos[codes[j]];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDistance) continue;
        if (d < 1e-6) {
          // On exactly the same spot there is no direction to push in: fan the pairs out by the golden angle.
          const angle = (i + 1) * GOLDEN_ANGLE + j;
          [dx, dy, d] = [Math.cos(angle), Math.sin(angle), 1];
        }
        // Each takes half the shortfall, plus a hair so the pair ends at the distance, not just short of it.
        const push = (minDistance - d) / 2 + SPREAD_SLACK;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        keepInside(a);
        keepInside(b);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return pos;
}

/**
 * Each border once, as a sorted pair, from the borders map the server sends (both sides list a border).
 *
 * @param {Record<string, string[]>} borders
 * @returns {[string, string][]}
 */
export function borderLinks(borders) {
  const seen = new Set();
  const links = [];
  for (const [code, neighbours] of Object.entries(borders)) {
    for (const other of neighbours) {
      const pair = [code, other].sort();
      const key = pair.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        links.push(pair);
      }
    }
  }
  return links.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

// The castle map's canvases (agreed design, 2026-11-03). Bigger than the old 400 by 300 circle map, because
// a castle with its name needs more room. Wide is about 3:2 for tablets and desktops; compact is portrait,
// so a castle is still a finger-sized target on a phone. `minDistance` keeps one castle, its name and its
// neighbour from touching.
export const BOXES = {
  wide: { width: 640, height: 420, padding: 56, minDistance: 104 },
  compact: { width: 400, height: 520, padding: 44, minDistance: 92 },
};

// The castle grid (agreed 2026-11-03): a staggered honeycomb, so every castle sits the same distance from
// its nearest neighbours. Ten castles in rows of 3-4-3 on the wide canvas, 2-3-2-3 on the phone canvas.
export const GRID_ROWS = { wide: [3, 4, 3], compact: [2, 3, 2, 3] };

/**
 * The ten slots, row by row, left to right. Rows are centred, so a short row sits half a step in from the
 * widest one, which is what makes the spacing even.
 *
 * @param {{ compact?: boolean }} [options]
 * @returns {{ slots: { x: number, y: number, row: number }[], width: number, height: number }}
 */
export function gridSlots({ compact = false } = {}) {
  const { width, height, padding } = compact ? BOXES.compact : BOXES.wide;
  const rows = compact ? GRID_ROWS.compact : GRID_ROWS.wide;
  const widest = Math.max(...rows);
  const dx = (width - 2 * padding) / (widest - 1);
  const dy = (height - 2 * padding) / (rows.length - 1);
  const slots = rows.flatMap((n, row) =>
    Array.from({ length: n }, (_, i) => ({ x: width / 2 + (i - (n - 1) / 2) * dx, y: padding + row * dy, row })),
  );
  return { slots, width, height };
}

const GRID_COUNT = 10;

/**
 * The plain geography snap: countries are dealt into the grid rows from north to south, and left to right
 * within a row, so north stays up and west stays left. Ties break by code, so the order the countries are
 * listed in never matters.
 *
 * @param {Record<string, { lat: number, lng: number }>} countries  exactly ten
 * @param {{ compact?: boolean }} [options]
 * @returns {Record<string, { x: number, y: number }>}
 */
export function snapToSlots(countries, { compact = false } = {}) {
  const { slots, width, height } = gridSlots({ compact });
  const { padding } = compact ? BOXES.compact : BOXES.wide;
  const at = project(countries, { width, height, padding });
  const rows = compact ? GRID_ROWS.compact : GRID_ROWS.wide;
  const byNorth = Object.keys(countries).sort((a, b) => at[a].y - at[b].y || a.localeCompare(b));
  const out = {};
  let next = 0;
  for (const count of rows) {
    const rowCodes = byNorth.slice(next, next + count).sort((a, b) => at[a].x - at[b].x || a.localeCompare(b));
    rowCodes.forEach((code, i) => {
      const { x, y } = slots[next + i];
      out[code] = { x, y };
    });
    next += count;
  }
  return out;
}

/**
 * The total length of the roads for these positions.
 *
 * @param {Record<string, { x: number, y: number }>} nodes
 * @param {[string, string][]} links  from borderLinks()
 * @returns {number}
 */
export function roadLength(nodes, links) {
  return links.reduce((sum, [a, b]) => (nodes[a] && nodes[b] ? sum + Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) : sum), 0);
}

// A road within this distance of a third castle reads as a road to that castle (half a castle's width plus a margin).
const CLEARANCE = 34;
// Large next to a road's length, so the search clears a road off a castle before it saves a few pixels.
const BLOCKED_PENALTY = 400;

const distanceToSegment = (p, a, b) => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * How many (road, castle) pairs have a road passing through a castle that is not one of its two ends.
 *
 * @param {Record<string, { x: number, y: number }>} nodes
 * @param {[string, string][]} links  from borderLinks()
 * @returns {number}
 */
export function roadsThroughCastles(nodes, links) {
  let count = 0;
  for (const [a, b] of links) {
    if (!nodes[a] || !nodes[b]) continue;
    for (const [code, p] of Object.entries(nodes)) {
      if (code !== a && code !== b && distanceToSegment(p, nodes[a], nodes[b]) < CLEARANCE) count += 1;
    }
  }
  return count;
}

// How much a castle's pull toward its real position counts against shorter roads. Small: roads decide,
// geography only keeps the map from being turned upside down.
const GEOGRAPHY_PULL = 0.15;
const MAX_SWAP_PASSES = 60;

/**
 * Swaps castles between slots while that makes the roads shorter, starting from the geography snap. Each
 * pass tries every pair in code order and keeps a swap only if the cost strictly falls, so it always
 * stops and always gives the same answer.
 */
function shortenRoads(snapped, anchors, links) {
  const codes = Object.keys(snapped).sort();
  const pos = Object.fromEntries(codes.map((c) => [c, { ...snapped[c] }]));
  const cost = () =>
    roadLength(pos, links) + BLOCKED_PENALTY * roadsThroughCastles(pos, links) + GEOGRAPHY_PULL * codes.reduce((sum, c) => sum + Math.hypot(pos[c].x - anchors[c].x, pos[c].y - anchors[c].y), 0);
  let best = cost();
  for (let pass = 0; pass < MAX_SWAP_PASSES; pass += 1) {
    let improved = false;
    for (let i = 0; i < codes.length; i += 1) {
      for (let j = i + 1; j < codes.length; j += 1) {
        [pos[codes[i]], pos[codes[j]]] = [pos[codes[j]], pos[codes[i]]];
        const trial = cost();
        if (trial < best - 1e-9) {
          best = trial;
          improved = true;
        } else {
          [pos[codes[i]], pos[codes[j]]] = [pos[codes[j]], pos[codes[i]]];
        }
      }
    }
    if (!improved) break;
  }
  return pos;
}

/**
 * Lays the countries out for the castle map: ten castles on an even honeycomb grid, placed so that
 * neighbours sit close and the roads stay short, with north still up (visual only, no game rule changes).
 * A game without exactly ten countries gets the old geographic layout. Same input, same map.
 *
 * @param {Record<string, { lat: number, lng: number }>} countries
 * @param {{ compact?: boolean, borders?: Record<string, string[]> }} [options]  compact is the portrait phone
 *   canvas; `borders` (the game's own) lets the roads decide who sits where
 * @returns {{ nodes: Record<string, { x: number, y: number }>, width: number, height: number }}
 */
export function layoutCastles(countries, { compact = false, borders = null } = {}) {
  const { width, height, padding, minDistance } = compact ? BOXES.compact : BOXES.wide;
  const box = { width, height, padding };
  if (Object.keys(countries).length !== GRID_COUNT) {
    const nodes = spread(stretchToFill(project(countries, box), box), { minDistance, ...box });
    return { nodes, ground: nodes, width, height };
  }
  const snapped = snapToSlots(countries, { compact });
  const links = borders ? borderLinks(borders).filter(([a, b]) => a in countries && b in countries) : [];
  const ground = links.length ? shortenRoads(snapped, snapped, links) : snapped;
  // The tilt comes last, so the search above works on the flat ground and the roads stay short on it.
  const nodes = Object.fromEntries(Object.entries(ground).map(([code, p]) => [code, tiltPoint(p, box)]));
  return { nodes, ground, width, height };
}

// The slight tabletop tilt (agreed 2026-11-03). SVG cannot tilt in 3D, and a flat tilt would squash the
// castles, so the tilt lives in the layout: the ground plane is projected in perspective, far rows closer
// together and a little smaller, near rows full size, and every castle then stands upright at its own scale.
// A straight road stays straight under this projection, so the roads and marches need no special case.
const TILT = 0.19; // the far edge is 1 / (1 + TILT), about 84%, of the near edge

const tiltScale = (t) => 1 / (1 + TILT * (1 - t));
// Where depth t (0 far, 1 near) lands on screen, as a share of the height: the running total of the scale.
const tiltDepth = (t) => (Math.log(1 + TILT) - Math.log(1 + TILT * (1 - t))) / Math.log(1 + TILT);

/**
 * One ground point, tilted. x moves toward the middle with distance, y packs the far rows closer, and
 * `scale` is how big a castle standing there is drawn (1 at the near edge).
 *
 * @param {{ x: number, y: number }} p  a point on the flat ground
 * @param {{ width: number, height: number, padding: number }} box
 * @returns {{ x: number, y: number, scale: number }}
 */
export function tiltPoint(p, { width, height, padding }) {
  const span = height - 2 * padding;
  const t = (p.y - padding) / span;
  const scale = tiltScale(t);
  return { x: width / 2 + (p.x - width / 2) * scale, y: padding + tiltDepth(t) * span, scale };
}

/**
 * The ten grid slots after the tilt (what a laid-out castle's position is always one of).
 *
 * @param {{ compact?: boolean }} [options]
 * @returns {{ slots: { x: number, y: number, row: number, scale: number }[], width: number, height: number }}
 */
export function tiltedSlots({ compact = false } = {}) {
  const { slots, width, height } = gridSlots({ compact });
  const { padding } = compact ? BOXES.compact : BOXES.wide;
  return { slots: slots.map((s) => ({ ...tiltPoint(s, { width, height, padding }), row: s.row })), width, height };
}

// How far past the outermost castles the ground reaches, on the flat ground.
const GROUND_MARGIN = 20;

/**
 * The four corners of the ground the castles stand on, tilted: far left, far right, near right, near left.
 * The far edge comes out narrower than the near edge, which is what makes the board look tilted.
 *
 * @param {{ compact?: boolean }} [options]
 * @returns {{ x: number, y: number }[]}
 */
export function groundOutline({ compact = false } = {}) {
  const box = compact ? BOXES.compact : BOXES.wide;
  const [l, r, t, b] = [GROUND_MARGIN, box.width - GROUND_MARGIN, GROUND_MARGIN, box.height - GROUND_MARGIN];
  return [
    tiltPoint({ x: l, y: t }, box),
    tiltPoint({ x: r, y: t }, box),
    tiltPoint({ x: r, y: b }, box),
    tiltPoint({ x: l, y: b }, box),
  ].map(({ x, y }) => ({ x, y }));
}

// Capitals are spread wider than tall, so one scale leaves much of the canvas empty. The short axis is
// stretched about the middle to use the room, by at most double, so the map still looks like the world.
const MAX_STRETCH = 2;

function stretchToFill(nodes, { width, height, padding }) {
  const pts = Object.values(nodes);
  const [xs, ys] = [pts.map((p) => p.x), pts.map((p) => p.y)];
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const factor = (span, room) => (span < 1 ? 1 : Math.min(MAX_STRETCH, Math.max(1, room / span)));
  const sx = factor(maxX - minX, width - 2 * padding);
  const sy = factor(maxY - minY, height - 2 * padding);
  const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
  return Object.fromEntries(
    Object.entries(nodes).map(([code, p]) => [code, { x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }]),
  );
}

/**
 * A name cut to fit under a castle: kept whole when it fits, otherwise shortened with an ellipsis
 * (never leaving a space before it), and never longer than `max` characters.
 *
 * @param {string} name
 * @param {number} max
 * @returns {string}
 */
export function shortName(name, max) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1).trimEnd()}…`;
}
