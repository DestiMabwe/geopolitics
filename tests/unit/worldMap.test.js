import { describe, it, expect } from 'vitest';
import { project, borderLinks, spread } from '../../public/js/worldMap.js';

// DESIGN §2 WorldMap: an equirectangular projection, zoomed to fit the 10 countries with padding.

const countries = {
  ZAF: { lat: -25.7, lng: 28.2 },
  KEN: { lat: -1.3, lng: 36.8 },
  BRA: { lat: -15.8, lng: -47.9 },
  CHN: { lat: 39.9, lng: 116.4 },
};
const box = { width: 400, height: 300, padding: 36 };

describe('project', () => {
  it('puts every node inside the box, clear of the padding', () => {
    for (const { x, y } of Object.values(project(countries, box))) {
      expect(x).toBeGreaterThanOrEqual(box.padding);
      expect(x).toBeLessThanOrEqual(box.width - box.padding);
      expect(y).toBeGreaterThanOrEqual(box.padding);
      expect(y).toBeLessThanOrEqual(box.height - box.padding);
    }
  });

  it('puts north above south', () => {
    const nodes = project(countries, box);
    expect(nodes.CHN.y).toBeLessThan(nodes.KEN.y);
    expect(nodes.KEN.y).toBeLessThan(nodes.ZAF.y);
  });

  it('puts east to the right of west', () => {
    const nodes = project(countries, box);
    expect(nodes.BRA.x).toBeLessThan(nodes.ZAF.x);
    expect(nodes.ZAF.x).toBeLessThan(nodes.CHN.x);
  });

  it('uses one scale on both axes, so the map is not stretched', () => {
    const nodes = project(countries, box);
    const perDegreeX = (nodes.CHN.x - nodes.BRA.x) / (116.4 - -47.9);
    const perDegreeY = (nodes.KEN.y - nodes.CHN.y) / (39.9 - -1.3);
    expect(perDegreeX).toBeCloseTo(perDegreeY, 6);
  });

  it('centres the group in the box', () => {
    const xs = Object.values(project(countries, box)).map((n) => n.x);
    const ys = Object.values(project(countries, box)).map((n) => n.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(box.width / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(box.height / 2, 6);
  });

  it('copes with countries on one line, or a single country, without NaN', () => {
    const line = project({ A: { lat: 10, lng: 0 }, B: { lat: 10, lng: 20 } }, box);
    const one = project({ A: { lat: 10, lng: 0 } }, box);
    for (const { x, y } of [...Object.values(line), ...Object.values(one)]) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('does not change what it was given', () => {
    const before = structuredClone(countries);
    project(countries, box);
    expect(countries).toEqual(before);
  });
});

describe('borderLinks', () => {
  it('gives each border once, even though both countries list it', () => {
    const borders = { A: ['B', 'C'], B: ['A'], C: ['A'] };
    expect(borderLinks(borders)).toEqual([['A', 'B'], ['A', 'C']]);
  });

  it('keeps a link when only one side lists it', () => {
    expect(borderLinks({ A: ['B'], B: [] })).toEqual([['A', 'B']]);
  });

  it('gives no links for no borders', () => {
    expect(borderLinks({ A: [], B: [] })).toEqual([]);
  });
});

// QA 2026-11-03 ISSUE-J: nodes for countries with nearby capitals were drawn on top of each other.
describe('spread', () => {
  const BOX = { width: 400, height: 300, padding: 36 };
  const MIN = 52;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pairs = (nodes) => {
    const codes = Object.keys(nodes);
    return codes.flatMap((a, i) => codes.slice(i + 1).map((b) => [a, b]));
  };
  const minGap = (nodes) => Math.min(...pairs(nodes).map(([a, b]) => dist(nodes[a], nodes[b])));

  it('leaves nodes that are already far enough apart exactly where they are', () => {
    const nodes = { A: { x: 60, y: 60 }, B: { x: 200, y: 60 }, C: { x: 340, y: 240 } };
    expect(spread(nodes, { minDistance: MIN, ...BOX })).toEqual(nodes);
  });

  it('pulls two nodes on the very same spot at least minDistance apart', () => {
    const out = spread({ A: { x: 200, y: 150 }, B: { x: 200, y: 150 } }, { minDistance: MIN, ...BOX });
    expect(dist(out.A, out.B)).toBeGreaterThanOrEqual(MIN - 0.01);
  });

  it('separates a tight cluster of ten so that no two nodes are closer than minDistance', () => {
    const cluster = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`N${i}`, { x: 200 + (i % 3) * 4, y: 150 + Math.floor(i / 3) * 4 }]),
    );
    expect(minGap(spread(cluster, { minDistance: MIN, ...BOX }))).toBeGreaterThanOrEqual(MIN - 0.01);
  });

  it('keeps every node inside the box, clear of the padding, even when it starts in a corner', () => {
    const corner = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`N${i}`, { x: 36 + i, y: 36 }]));
    const out = spread(corner, { minDistance: MIN, ...BOX });
    for (const { x, y } of Object.values(out)) {
      expect(x).toBeGreaterThanOrEqual(36 - 0.01);
      expect(x).toBeLessThanOrEqual(400 - 36 + 0.01);
      expect(y).toBeGreaterThanOrEqual(36 - 0.01);
      expect(y).toBeLessThanOrEqual(300 - 36 + 0.01);
    }
    expect(minGap(out)).toBeGreaterThanOrEqual(MIN - 0.01);
  });

  it('moves only the nodes that were too close, and not far', () => {
    const nodes = { A: { x: 60, y: 60 }, B: { x: 300, y: 200 }, C: { x: 310, y: 200 } };
    const out = spread(nodes, { minDistance: MIN, ...BOX });
    expect(out.A).toEqual(nodes.A);
    expect(dist(out.B, nodes.B)).toBeLessThan(MIN);
    expect(dist(out.C, nodes.C)).toBeLessThan(MIN);
  });

  it('gives the same answer every time', () => {
    const nodes = { A: { x: 200, y: 150 }, B: { x: 201, y: 150 }, C: { x: 200, y: 151 } };
    expect(spread(nodes, { minDistance: MIN, ...BOX })).toEqual(spread(nodes, { minDistance: MIN, ...BOX }));
  });

  it('keeps the same codes, and does not change what it was given', () => {
    const nodes = { A: { x: 200, y: 150 }, B: { x: 200, y: 150 } };
    const copy = JSON.parse(JSON.stringify(nodes));
    const out = spread(nodes, { minDistance: MIN, ...BOX });
    expect(Object.keys(out).sort()).toEqual(['A', 'B']);
    expect(nodes).toEqual(copy);
  });

  it('copes with no nodes and with one node', () => {
    expect(spread({}, { minDistance: MIN, ...BOX })).toEqual({});
    expect(spread({ A: { x: 100, y: 100 } }, { minDistance: MIN, ...BOX })).toEqual({ A: { x: 100, y: 100 } });
  });
});
