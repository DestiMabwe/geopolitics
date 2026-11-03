import { describe, it, expect } from 'vitest';
import { pipsFor, FACE_VALUE, FACE_NORMAL, restRotation, tumblePlan, STAGGER_MS } from '../../public/js/dice3d.js';

// Real dice for the dice panel (agreed 2026-11-03): cubes with pips that tumble and land on the server's
// numbers. Pure maths, so it runs here; the browser only draws it. The tumble is decoration: the face a
// die comes to rest on is always the value the server rolled.

const VALUES = [1, 2, 3, 4, 5, 6];

describe('pipsFor: the dots on a face, as cells of a 3 by 3 grid (0 to 8, row by row)', () => {
  it('shows as many pips as the value', () => {
    for (const v of VALUES) expect(pipsFor(v)).toHaveLength(v);
  });
  it('is point-symmetric, like a real die: a pip at cell c has a partner at cell 8 - c', () => {
    for (const v of VALUES) {
      const cells = new Set(pipsFor(v));
      for (const c of cells) if (c !== 4) expect(cells.has(8 - c)).toBe(true);
    }
  });
  it('puts a pip in the middle exactly for odd values', () => {
    for (const v of VALUES) expect(pipsFor(v).includes(4)).toBe(v % 2 === 1);
  });
  it('uses distinct cells inside the grid', () => {
    for (const v of VALUES) {
      const cells = pipsFor(v);
      expect(new Set(cells).size).toBe(cells.length);
      for (const c of cells) expect(c >= 0 && c <= 8).toBe(true);
    }
  });
  it('gives nothing for a value that is not on a die', () => {
    for (const bad of [0, 7, -1, 2.5, NaN, null, undefined, '3']) expect(pipsFor(bad)).toEqual([]);
  });
});

describe('the cube: six faces, opposite faces adding up to 7', () => {
  const faces = Object.keys(FACE_VALUE);
  it('has each value on exactly one face', () => {
    expect(faces).toHaveLength(6);
    expect(Object.values(FACE_VALUE).sort()).toEqual(VALUES);
  });
  it('has opposite faces adding up to seven, as on a real die', () => {
    const opposite = { front: 'back', right: 'left', top: 'bottom' };
    for (const [a, b] of Object.entries(opposite)) expect(FACE_VALUE[a] + FACE_VALUE[b]).toBe(7);
  });
});

// Turns a face normal by `rotateX(x) rotateY(y)`, the way the browser does (y axis points down on screen).
function rotate([nx, ny, nz], { x, y }) {
  const rad = (d) => (d * Math.PI) / 180;
  const [cy, sy, cx, sx] = [Math.cos(rad(y)), Math.sin(rad(y)), Math.cos(rad(x)), Math.sin(rad(x))];
  const [x1, y1, z1] = [nx * cy + nz * sy, ny, -nx * sy + nz * cy]; // rotateY first
  return [x1, y1 * cx - z1 * sx, y1 * sx + z1 * cx]; // then rotateX
}

describe('restRotation: the turn that brings a value face to the front', () => {
  it.each(VALUES)('turns the face carrying %i to face the viewer', (value) => {
    const face = Object.keys(FACE_VALUE).find((f) => FACE_VALUE[f] === value);
    const [x, y, z] = rotate(FACE_NORMAL[face], restRotation(value));
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(1, 6);
  });
  it('gives nothing to turn for a value that is not on a die', () => {
    expect(restRotation(9)).toEqual({ x: 0, y: 0 });
  });
});

describe('tumblePlan: the decorative spin before a die lands', () => {
  it('is the same every time for the same roll, so a replay looks the same', () => {
    expect(tumblePlan(42, 1, 5)).toEqual(tumblePlan(42, 1, 5));
  });
  it('spins whole turns only, so the die still ends on the right face', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const value of VALUES) {
        const rest = restRotation(value);
        const plan = tumblePlan(seed, 0, value);
        expect(Math.abs((plan.fromX - rest.x) % 360)).toBe(0); // abs: -360 % 360 is -0 in JavaScript
        expect(Math.abs((plan.fromY - rest.y) % 360)).toBe(0);
        expect(Math.abs(plan.fromX - rest.x) + Math.abs(plan.fromY - rest.y)).toBeGreaterThanOrEqual(360);
      }
    }
  });
  it('spins between one and three turns on each axis', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rest = restRotation(3);
      const plan = tumblePlan(seed, 2, 3);
      for (const turns of [Math.abs(plan.fromX - rest.x) / 360, Math.abs(plan.fromY - rest.y) / 360]) {
        expect(turns).toBeGreaterThanOrEqual(1);
        expect(turns).toBeLessThanOrEqual(3);
      }
    }
  });
  it('staggers the dice, so they land one after another', () => {
    expect(tumblePlan(7, 0, 1).delay).toBe(0);
    expect(tumblePlan(7, 1, 1).delay).toBe(STAGGER_MS);
    expect(tumblePlan(7, 2, 1).delay).toBe(2 * STAGGER_MS);
  });
  it('does not spin every die in the same way', () => {
    const spins = [0, 1, 2].map((i) => `${tumblePlan(11, i, 4).fromX},${tumblePlan(11, i, 4).fromY}`);
    expect(new Set(spins).size).toBeGreaterThan(1);
  });
});
