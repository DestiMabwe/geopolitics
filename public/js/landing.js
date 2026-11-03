// The words and data behind the logged-out landing page (DESIGN §3.2). Pure (no DOM), so it runs in
// the unit tests. Nothing here is a game number the player relies on: the example board is only a
// picture, and the profile texts come from profiles.js.

import { profileLabel, profileBlurb } from './profiles.js';

// A Firestore auto id is 20 letters and digits; the range leaves room without accepting short words.
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Pulls a game id out of whatever a visitor pasted: a full link, just its path, or the bare id.
 *
 * - `https://host/game/ID`, with or without a trailing slash, query or hash → `ID`
 * - `/game/ID` → `ID`
 * - a bare id, 6 to 64 letters, digits, `-` or `_` → itself
 * - anything else (empty, spaces, another kind of link, a `/game/` with no id) → null
 *
 * @param {string} input
 * @returns {string | null}
 */
export function parseGameLink(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  if (ID_PATTERN.test(text)) return text;

  let path = text;
  if (/^https?:\/\//i.test(text)) {
    try {
      path = new URL(text).pathname; // drops the query string and the hash
    } catch {
      return null;
    }
  }
  const match = path.match(/^\/?game\/([^/]+)\/?$/);
  return match && ID_PATTERN.test(match[1]) ? match[1] : null;
}

/** The four steps shown under "How a game works". */
export const HOW_IT_WORKS = [
  {
    title: 'Pick your country',
    text: 'Choose a real country. The server adds nine more at random and gives each its soldiers by population.',
  },
  {
    title: 'Take your turn',
    text: 'Place your reinforcements, move soldiers between your countries, then attack a neighbour by rolling dice.',
  },
  {
    title: 'Watch every battle',
    text: 'Each roll, loss and conquest appears as it happens, with commentary written by an LLM. Fast-forward speeds up the rivals and still shows every move.',
  },
  {
    title: 'Take all ten',
    text: 'Nine rivals play to win too, each with its own strategy. Conquer all ten countries to win. Anyone with a game link can watch it live.',
  },
];

/**
 * The three NPC profile cards, in the order Warlord, Fortress, Opportunist.
 *
 * @returns {{ profile: string, name: string, blurb: string }[]}
 */
export function npcCards() {
  return ['warlord', 'fortress', 'opportunist'].map((profile) => ({
    profile,
    name: profileLabel(profile),
    blurb: profileBlurb(profile),
  }));
}

// code, name, capital latitude and longitude, soldiers, and the NPC's profile (null for the human).
const SAMPLE = [
  ['ZAF', 'South Africa', -25.74, 28.19, 5, null],
  ['KEN', 'Kenya', -1.29, 36.82, 3, 'warlord'],
  ['EGY', 'Egypt', 30.04, 31.24, 6, 'fortress'],
  ['BRA', 'Brazil', -15.79, -47.88, 4, 'opportunist'],
  ['ARG', 'Argentina', -34.6, -58.38, 2, 'warlord'],
  ['USA', 'United States', 38.9, -77.04, 7, 'fortress'],
  ['FRA', 'France', 48.86, 2.35, 3, 'opportunist'],
  ['IND', 'India', 28.61, 77.21, 5, 'warlord'],
  ['JPN', 'Japan', 35.68, 139.69, 4, 'fortress'],
  ['AUS', 'Australia', -35.28, 149.13, 2, 'opportunist'],
];
// Each pair is a border, written once; the board lists it from both sides, as the server does.
const SAMPLE_BORDERS = [
  ['ZAF', 'KEN'], ['ZAF', 'BRA'], ['KEN', 'EGY'], ['KEN', 'IND'], ['EGY', 'FRA'], ['EGY', 'IND'],
  ['FRA', 'USA'], ['USA', 'BRA'], ['BRA', 'ARG'], ['IND', 'JPN'], ['JPN', 'AUS'], ['AUS', 'IND'],
];

/**
 * A made-up board for the landing page's picture, in the same shape as the server's public game so the
 * real WorldMap can draw it. Ten real countries at their capitals, the human on one of them.
 *
 * @returns {object}
 */
export function sampleGame() {
  const ownerOf = (code, profile) => (profile ? `npc:${code}` : 'human');
  const countries = {};
  const players = {};
  const borders = {};
  for (const [code, name, lat, lng, soldiers, profile] of SAMPLE) {
    const owner = ownerOf(code, profile);
    countries[code] = { name, lat, lng, soldiers, owner };
    players[owner] = profile ? { homeCode: code, profile } : { homeCode: code };
    borders[code] = [];
  }
  for (const [a, b] of SAMPLE_BORDERS) {
    borders[a].push(b);
    borders[b].push(a);
  }
  // The human sits second, so the picture's owner colours are not all in one corner.
  const order = SAMPLE.map(([code, , , , , profile]) => ownerOf(code, profile));
  const turnOrder = [order[2], order[0], ...order.filter((_, i) => i !== 0 && i !== 2)];
  return { status: 'active', round: 1, isOwner: false, attack: null, countries, players, borders, turnOrder };
}
