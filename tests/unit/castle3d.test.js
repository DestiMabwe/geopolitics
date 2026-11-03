import { describe, it, expect } from 'vitest';
import { FACES, GATE_FACE, RING, SHADOW, FLAG_BOX } from '../../public/js/castle.js';

// The 2.5D castle (agreed 2026-11-03): oblique solids lit from the top-left, built from exact geometry.
// Shading is by tone (the owner colour lightened or darkened), so a capture still recolours the castle.

const TONES = new Set(['front', 'lit', 'shade', 'roofLit', 'roofShade']);
const inside = (b) => b.x0 >= RING.x && b.x1 <= RING.x + RING.width && b.y0 >= RING.y && b.y1 <= RING.y + RING.height;
const centreX = (f) => (f.box.x0 + f.box.x1) / 2;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('castle faces', () => {
  it('has faces, each with a path, a box and a known tone', () => {
    expect(FACES.length).toBeGreaterThan(10);
    for (const f of FACES) {
      expect(f.d).toMatch(/^M[-\d. LZ]+Z$/);
      expect(TONES.has(f.tone)).toBe(true);
      expect(f.box.x0).toBeLessThan(f.box.x1);
      expect(f.box.y0).toBeLessThan(f.box.y1);
    }
  });

  it('keeps every face, the gate and the shadow inside the outline of the castle (its tap area)', () => {
    for (const f of FACES) expect(inside(f.box)).toBe(true);
    expect(inside(GATE_FACE.box)).toBe(true);
    expect(inside({ x0: SHADOW.cx - SHADOW.rx, x1: SHADOW.cx + SHADOW.rx, y0: SHADOW.cy - SHADOW.ry, y1: SHADOW.cy + SHADOW.ry })).toBe(true);
  });

  it('uses every tone, so the castle has a lit side, a shaded side and roofs', () => {
    expect(new Set(FACES.map((f) => f.tone))).toEqual(TONES);
  });

  it('is lit from the left: within each solid the lit faces sit left of the shaded ones', () => {
    for (const solid of new Set(FACES.map((f) => f.solid))) {
      const faces = FACES.filter((f) => f.solid === solid);
      const lit = faces.filter((f) => f.tone === 'lit' || f.tone === 'roofLit').map(centreX);
      const shade = faces.filter((f) => f.tone === 'shade' || f.tone === 'roofShade').map(centreX);
      if (lit.length && shade.length) expect(mean(lit)).toBeLessThan(mean(shade));
    }
  });

  it('draws the three solids: the keep and two towers, towers in front of the keep', () => {
    const order = FACES.map((f) => f.solid);
    expect(new Set(order)).toEqual(new Set(['keep', 'leftTower', 'rightTower']));
    expect(order.indexOf('keep')).toBeLessThan(order.indexOf('leftTower'));
    expect(order.lastIndexOf('keep')).toBeLessThan(order.indexOf('rightTower'));
  });

  it('leaves the flag clear of the tower roofs', () => {
    const roofs = FACES.filter((f) => f.tone === 'roofLit' || f.tone === 'roofShade');
    for (const r of roofs) {
      const overlapsX = r.box.x0 < FLAG_BOX.x + FLAG_BOX.width && r.box.x1 > FLAG_BOX.x;
      const overlapsY = r.box.y0 < FLAG_BOX.y + FLAG_BOX.height && r.box.y1 > FLAG_BOX.y;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });
});
