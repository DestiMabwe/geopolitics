import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { layoutCastles, shortName, project, BOXES } from '../../public/js/worldMap.js';

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
