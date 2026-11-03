// Real dice for the dice panel (agreed 2026-11-03): cubes with pips that tumble and land on the server's
// numbers. Pure (no DOM), so it runs in the unit tests. The tumble is decoration: the face a die comes
// to rest on is always the value the server rolled, and nothing here chooses or changes a value.

// Pips as cells of a 3 by 3 grid, numbered 0 to 8 row by row.
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * @param {unknown} value  a die value, 1 to 6
 * @returns {number[]}  the grid cells that carry a pip, or [] for anything that is not on a die
 */
export function pipsFor(value) {
  return Number.isInteger(value) && PIPS[value] ? [...PIPS[value]] : [];
}

/** Which value each face of the cube carries. Opposite faces add up to 7, as on a real die. */
export const FACE_VALUE = { front: 1, back: 6, right: 2, left: 5, top: 3, bottom: 4 };

/** Which way each face points, in screen coordinates (x right, y down, z toward the viewer). */
export const FACE_NORMAL = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

/** How each face is placed on the cube, as a CSS transform (the face is then pushed out by half a die). */
export const FACE_TRANSFORM = {
  front: 'rotateY(0deg)',
  back: 'rotateY(180deg)',
  right: 'rotateY(90deg)',
  left: 'rotateY(-90deg)',
  top: 'rotateX(90deg)',
  bottom: 'rotateX(-90deg)',
};

// The turn that brings each value's face to the front: the opposite of how the face is placed.
const REST = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  2: { x: 0, y: -90 },
  5: { x: 0, y: 90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
};

/**
 * The rotation (degrees about x, then y) at which a cube shows `value` to the viewer.
 *
 * @param {unknown} value
 * @returns {{ x: number, y: number }}  no turn for anything that is not on a die
 */
export function restRotation(value) {
  return REST[value] ? { ...REST[value] } : { x: 0, y: 0 };
}

/** How long after the first die each next die starts, so they land one after another. */
export const STAGGER_MS = 80;

// A small seeded generator, so the same roll always tumbles the same way (a replay looks the same).
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where a die starts its tumble. Whole turns away from where it comes to rest (so it still lands on the
 * right face), one to three on each axis, and later for each next die.
 *
 * @param {number} seed  the roll event's seq
 * @param {number} index  which die in its row, from 0
 * @param {number} value  the value the die lands on
 * @returns {{ fromX: number, fromY: number, delay: number }}
 */
export function tumblePlan(seed, index, value) {
  const rand = mulberry32(seed * 1009 + index * 97 + value * 13);
  const turns = () => (1 + Math.floor(rand() * 3)) * (rand() < 0.5 ? -360 : 360);
  const rest = restRotation(value);
  return { fromX: rest.x + turns(), fromY: rest.y + turns(), delay: index * STAGGER_MS };
}
