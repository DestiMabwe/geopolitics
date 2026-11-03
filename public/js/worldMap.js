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
