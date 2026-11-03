import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { layoutCastles, shortName, project, borderLinks, gridSlots, snapToSlots, roadLength, roadsThroughCastles, GRID_ROWS, BOXES } from '../../public/js/worldMap.js';

// The roomier castle layout (agreed design, 2026-11-03): real capital geography on a bigger canvas,
// nudged apart enough that a castle, its name and its neighbours never touch.

const catalogue = JSON.parse(readFileSync(new URL('../../src/data/countries.json', import.meta.url))).countries;

// A small seeded generator, so "random" games are the same every run.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGame(seed) {
  const rand = mulberry32(seed);
  const pool = [...catalogue];
  const picked = {};
  for (let i = 0; i < 10; i += 1) {
    const [c] = pool.splice(Math.floor(rand() * pool.length), 1);
    picked[c.code] = { lat: c.lat, lng: c.lng, name: c.name };
  }
  return picked;
}

const minPairDistance = (nodes) => {
  const pts = Object.values(nodes);
  let min = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  }
  return min;
};

describe.each([
  ['wide', false],
  ['compact', true],
])('layoutCastles (%s)', (_name, compact) => {
  const box = compact ? BOXES.compact : BOXES.wide;

  it('is a roomier canvas than the old 400 by 300 circle map', () => {
    expect(box.width * box.height).toBeGreaterThan(400 * 300);
  });

  it('keeps every castle apart by the minimum gap, for 150 different games', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const { nodes } = layoutCastles(randomGame(seed), { compact });
      expect(minPairDistance(nodes)).toBeGreaterThanOrEqual(box.minDistance - 0.5);
    }
  });

  it('keeps every castle inside the box, clear of the padding', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { nodes } = layoutCastles(randomGame(seed), { compact });
      for (const { x, y } of Object.values(nodes)) {
        expect(x).toBeGreaterThanOrEqual(box.padding - 0.5);
        expect(x).toBeLessThanOrEqual(box.width - box.padding + 0.5);
        expect(y).toBeGreaterThanOrEqual(box.padding - 0.5);
        expect(y).toBeLessThanOrEqual(box.height - box.padding + 0.5);
      }
    }
  });

  it('reports the canvas size it laid out for, and gives the same answer every time', () => {
    const game = randomGame(7);
    const a = layoutCastles(game, { compact });
    expect(a.width).toBe(box.width);
    expect(a.height).toBe(box.height);
    expect(layoutCastles(game, { compact })).toEqual(a);
  });

  it('does not change the countries it was given', () => {
    const game = randomGame(3);
    const before = JSON.stringify(game);
    layoutCastles(game, { compact });
    expect(JSON.stringify(game)).toBe(before);
  });
});

describe('layoutCastles uses the room it has', () => {
  // Capitals are spread wider than tall, so a single scale leaves the canvas half empty. The short axis
  // stretches to use it, but by at most double, so the map still looks like the world.
  const wideRow = {
    A: { lat: 10, lng: -100 }, B: { lat: 12, lng: -30 }, C: { lat: 8, lng: 30 }, D: { lat: 14, lng: 100 },
  };
  const extent = (nodes, axis) => {
    const v = Object.values(nodes).map((n) => n[axis]);
    return Math.max(...v) - Math.min(...v);
  };

  it('stretches the short axis, by at most double, and leaves the long one alone', () => {
    const { nodes } = layoutCastles(wideRow);
    const plain = project(wideRow, BOXES.wide);
    expect(extent(nodes, 'x')).toBeCloseTo(extent(plain, 'x'), 1);
    expect(extent(nodes, 'y')).toBeCloseTo(2 * extent(plain, 'y'), 1);
  });

  it('keeps north above south and west left of east', () => {
    const { nodes } = layoutCastles(wideRow);
    expect(nodes.D.y).toBeLessThan(nodes.C.y); // D (14N) is north of C (8N)
    expect(nodes.A.x).toBeLessThan(nodes.B.x);
    expect(nodes.B.x).toBeLessThan(nodes.D.x);
  });

  it('stretches less when the countries already fill that axis', () => {
    const tall = { A: { lat: 60, lng: 0 }, B: { lat: -60, lng: 4 }, C: { lat: 0, lng: 10 } };
    const { nodes } = layoutCastles(tall);
    const plain = project(tall, BOXES.wide);
    expect(extent(nodes, 'y')).toBeCloseTo(extent(plain, 'y'), 1);
  });
});

// Each country borders its three nearest, like the server's map, so there are roads to shorten.
function bordersFor(game) {
  const codes = Object.keys(game);
  const borders = Object.fromEntries(codes.map((c) => [c, []]));
  for (const a of codes) {
    const nearest = codes
      .filter((b) => b !== a)
      .sort((b1, b2) => Math.hypot(game[a].lat - game[b1].lat, game[a].lng - game[b1].lng) - Math.hypot(game[a].lat - game[b2].lat, game[a].lng - game[b2].lng) || b1.localeCompare(b2))
      .slice(0, 3);
    for (const b of nearest) {
      if (!borders[a].includes(b)) borders[a].push(b);
      if (!borders[b].includes(a)) borders[b].push(a);
    }
  }
  return borders;
}

describe.each([
  ['wide', false],
  ['compact', true],
])('the castle grid (%s): even spacing, agreed 2026-11-03', (_name, compact) => {
  const box = compact ? BOXES.compact : BOXES.wide;
  const key = (n) => `${Math.round(n.x)},${Math.round(n.y)}`;

  it('has a slot for each of the ten castles, in staggered rows', () => {
    const rows = compact ? GRID_ROWS.compact : GRID_ROWS.wide;
    expect(rows.reduce((a, b) => a + b, 0)).toBe(10);
    expect(gridSlots({ compact }).slots).toHaveLength(10);
  });

  it('puts every castle on a slot, each slot used once, the same slots in every game', () => {
    const expected = gridSlots({ compact }).slots.map(key).sort();
    for (let seed = 1; seed <= 40; seed += 1) {
      const game = randomGame(seed);
      const { nodes } = layoutCastles(game, { compact, borders: bordersFor(game) });
      expect(Object.values(nodes).map(key).sort()).toEqual(expected);
    }
  });

  it('gives every castle the same distance to its nearest neighbour', () => {
    const { slots } = gridSlots({ compact });
    const nearest = slots.map((a) => Math.min(...slots.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    expect(Math.max(...nearest) / Math.min(...nearest)).toBeLessThan(1.08);
  });

  it('keeps every slot inside the canvas, clear of the padding, and well apart', () => {
    const { slots } = gridSlots({ compact });
    for (const { x, y } of slots) {
      expect(x).toBeGreaterThanOrEqual(box.padding - 0.5);
      expect(x).toBeLessThanOrEqual(box.width - box.padding + 0.5);
      expect(y).toBeGreaterThanOrEqual(box.padding - 0.5);
      expect(y).toBeLessThanOrEqual(box.height - box.padding + 0.5);
    }
    expect(minPairDistance(Object.fromEntries(slots.map((p, i) => [i, p])))).toBeGreaterThanOrEqual(box.minDistance);
  });

  it('keeps north above south: the starting placement orders the rows by latitude', () => {
    const game = randomGame(11);
    const { nodes } = layoutCastles(game, { compact }); // no borders: pure geography snap
    const byLat = Object.keys(game).sort((a, b) => game[b].lat - game[a].lat);
    const northThree = byLat.slice(0, 2).map((c) => nodes[c].y);
    const southTwo = byLat.slice(-2).map((c) => nodes[c].y);
    expect(Math.max(...northThree)).toBeLessThanOrEqual(Math.min(...southTwo));
  });

  // The search trades road length against roads running through castles (a road through a castle reads as a
  // road to it), so a single game's roads can get a little longer to clear one. The cost never rises, and
  // across games the roads are still shorter.
  it('never makes the layout worse than the plain geography snap, and shortens the roads overall', () => {
    const cost = (nodes, links) => roadLength(nodes, links) + 400 * roadsThroughCastles(nodes, links);
    let snappedTotal = 0;
    let laidOutTotal = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const game = randomGame(seed);
      const borders = bordersFor(game);
      const links = borderLinks(borders);
      const snapped = snapToSlots(game, { compact });
      const { nodes } = layoutCastles(game, { compact, borders });
      expect(cost(nodes, links)).toBeLessThanOrEqual(cost(snapped, links) + 1e-6);
      snappedTotal += roadLength(snapped, links);
      laidOutTotal += roadLength(nodes, links);
    }
    expect(laidOutTotal).toBeLessThan(snappedTotal);
  });

  it('keeps roads from passing through a third castle, which would read as a road to it', () => {
    let before = 0;
    let after = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const game = randomGame(seed);
      const borders = bordersFor(game);
      const links = borderLinks(borders);
      const snapped = roadsThroughCastles(snapToSlots(game, { compact }), links);
      const laidOut = roadsThroughCastles(layoutCastles(game, { compact, borders }).nodes, links);
      expect(laidOut).toBeLessThanOrEqual(snapped);
      before += snapped;
      after += laidOut;
    }
    expect(after).toBeLessThan(before);
  });

  it('counts a road that passes through a castle, and not one that only has castles at its ends', () => {
    const nodes = { A: { x: 0, y: 0 }, B: { x: 100, y: 0 }, C: { x: 200, y: 0 }, D: { x: 100, y: 120 } };
    expect(roadsThroughCastles(nodes, [['A', 'C']])).toBe(1); // B stands on the road
    expect(roadsThroughCastles(nodes, [['A', 'B'], ['B', 'C'], ['B', 'D']])).toBe(0);
  });

  it('gives the same layout every time, in whatever order the countries are listed', () => {
    const game = randomGame(5);
    const borders = bordersFor(game);
    const reversed = Object.fromEntries(Object.entries(game).reverse());
    expect(layoutCastles(reversed, { compact, borders }).nodes).toEqual(layoutCastles(game, { compact, borders }).nodes);
  });
});

describe('a game that does not have exactly ten countries', () => {
  it('still gets a layout (the geographic one), without throwing', () => {
    const { nodes } = layoutCastles({ A: { lat: 1, lng: 1 }, B: { lat: 5, lng: 9 }, C: { lat: -3, lng: 20 } });
    expect(Object.keys(nodes).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('shortName', () => {
  it('leaves a short name alone', () => {
    expect(shortName('Peru', 12)).toBe('Peru');
  });
  it('cuts a long name with an ellipsis, within the limit', () => {
    const s = shortName('United Arab Emirates', 12);
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s.endsWith('…')).toBe(true);
  });
  it('does not leave a trailing space before the ellipsis', () => {
    expect(shortName('Burkina Faso Republic', 7)).not.toMatch(/\s…$/);
  });
});
