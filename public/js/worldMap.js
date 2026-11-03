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

/**
 * Lays the countries out for the castle map: the real capital geography (project), zoomed to fit the
 * canvas and then pushed apart until every castle has its room (spread). Same input, same map.
 *
 * @param {Record<string, { lat: number, lng: number }>} countries
 * @param {{ compact?: boolean }} [options]  compact is the portrait phone canvas
 * @returns {{ nodes: Record<string, { x: number, y: number }>, width: number, height: number }}
 */
export function layoutCastles(countries, { compact = false } = {}) {
  const { width, height, padding, minDistance } = compact ? BOXES.compact : BOXES.wide;
  const box = { width, height, padding };
  const nodes = spread(stretchToFill(project(countries, box), box), { minDistance, ...box });
  return { nodes, width, height };
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
