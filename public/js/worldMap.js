// The maths behind the WorldMap (DESIGN §2, S26a). Pure (no DOM), so it runs in the unit tests.

// A group on one meridian or parallel has no span to scale by; this many degrees stops a divide by zero.
const MIN_SPAN = 1;

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
