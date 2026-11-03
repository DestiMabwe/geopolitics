// The castle drawn on the map: exact geometry, no illustration (DESIGN §2 WorldMap). Every shape is a
// rectangle or an arch, so it stays crisp at any size and takes the owner's colour cleanly.
// Local coordinates: the castle is centred on (0, 0), its base on y = 19, about 48 wide and 46 tall.

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** Walls, two side towers and a taller keep, each with square battlements. One shape, one fill. */
export const WALLS = [
  rect(-24, -8, 13, 27), rect(-24, -12, 4, 4), rect(-15, -12, 4, 4),
  rect(11, -8, 13, 27), rect(11, -12, 4, 4), rect(20, -12, 4, 4),
  rect(-11, -14, 22, 33), rect(-11, -18, 5, 4), rect(-2.5, -18, 5, 4), rect(6, -18, 5, 4),
].join('');

/** The arched gate the soldier count sits in. Dark, so the number reads against it. */
export const GATE = 'M-9 19V8a9 9 0 0 1 18 0V19z';

/** A pole and a flag above the keep, in the owner's colour. */
export const FLAG_POLE = rect(-0.6, -28, 1.2, 10);
export const FLAG = 'M0.6 -28h9l-3 3.5l3 3.5h-9z';

/** A small crown on the left tower, marking the player's own home country. */
export const CROWN = 'M-25 -12.5l1-5 2.7 2.4 2.8-4 2.8 4 2.7-2.4 1 5z';

/** The outline that shows a castle is selected, a valid target or under attack. Also its click area. */
export const RING = { x: -30, y: -32, width: 60, height: 56, rx: 8 };

/** Where the name goes, and how far down. */
export const LABEL_Y = 36;
