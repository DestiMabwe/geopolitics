import { describe, it, expect } from 'vitest';
import { project, borderLinks } from '../../public/js/worldMap.js';

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
