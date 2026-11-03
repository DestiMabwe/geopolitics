// The castle drawn on the map: exact geometry, no illustration (DESIGN §2 WorldMap). An oblique 2.5D
// solid lit from the top-left: a keep with a lit top and a darker right side, and two round towers with
// cone roofs, each shaded in flat facets so it stays crisp and cheap to draw. Shading is by tone (the
// owner's colour made lighter or darker in CSS), so a capture still recolours the whole castle.
// Local coordinates: the castle is centred on (0, 0), its base on y = 19.

const boxOf = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])),
  x1: Math.max(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  y1: Math.max(...pts.map((p) => p[1])),
});
const shape = (...pts) => ({ d: `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`, box: boxOf(pts) });
const rect = (x, y, w, h) => shape([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const face = (solid, tone, s) => ({ solid, tone, ...s });

// The keep: a box 20 wide. Its front faces the viewer, its right side turns away from the light, its top
// catches it. Three merlons stand on the front edge, each with a light cap.
const KEEP = [
  face('keep', 'shade', shape([10, -12], [16, -16], [16, 15], [10, 19])),
  face('keep', 'lit', shape([-10, -12], [-4, -16], [16, -16], [10, -12])),
  face('keep', 'front', rect(-10, -12, 20, 31)),
  ...[-10, -2.5, 5].flatMap((x) => [face('keep', 'front', rect(x, -15.5, 5, 3.5)), face('keep', 'lit', rect(x, -16.5, 5, 1))]),
];

// A round tower in three facets (light, front, shade), an eave, and a cone roof split down the middle.
function tower(solid, left, right, apexX) {
  const w = right - left;
  const roofL = left - 1.5;
  const roofR = right + 1.5;
  return [
    face(solid, 'lit', rect(left, -6, w * 0.28, 25)),
    face(solid, 'front', rect(left + w * 0.28, -6, w * 0.44, 25)),
    face(solid, 'shade', rect(left + w * 0.72, -6, w * 0.28, 25)),
    face(solid, 'shade', rect(roofL, -6, roofR - roofL, 1.5)),
    face(solid, 'roofLit', shape([roofL, -6], [apexX, -6], [apexX, -20])),
    face(solid, 'roofShade', shape([apexX, -6], [roofR, -6], [apexX, -20])),
  ];
}

/** Every solid face, in paint order (back to front): the keep, then the left tower, then the right. */
export const FACES = [...KEEP, ...tower('leftTower', -26, -12, -19), ...tower('rightTower', 10, 24, 17)];

/** The arched gate on the keep's front. Dark, so the soldier count reads against it. */
export const GATE_FACE = { d: 'M-8 19V9a8 8 0 0 1 16 0V19z', box: { x0: -8, x1: 8, y0: 1, y1: 19 } };

/** A soft shadow on the ground, thrown to the right and down, away from the light. */
export const SHADOW = { cx: 4, cy: 20, rx: 28, ry: 6 };

/** A tall pole above the keep, in the owner's colour. The country's real flag flies from it. */
export const FLAG_POLE = rect(-0.6, -36, 1.2, 22).d;
/** The real flag: 4:3, like the vendored flag files, large enough to recognise. */
export const FLAG_BOX = { x: 0.6, y: -36, width: 18, height: 13.5 };
/** The coloured pennant shown instead if a flag image cannot be loaded. */
export const FLAG = 'M0.6 -36h9l-3 3.5l3 3.5h-9z';

/** A small crown above the left tower's roof, marking the player's own home country. */
export const CROWN = 'M-23.5 -21l1-4.5 2.7 2.2 1.8-3.7 1.8 3.7 2.7-2.2 1 4.5z';

/** The outline that shows a castle is selected, a valid target or under attack. Also its click area. */
export const RING = { x: -32, y: -42, width: 64, height: 70, rx: 8 };

/** Where the name goes, and how far down. */
export const LABEL_Y = 38;
