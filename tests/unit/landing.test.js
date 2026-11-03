import { describe, it, expect, beforeEach } from 'vitest';
import { parseGameLink, HOW_IT_WORKS, npcCards, sampleGame } from '../../public/js/landing.js';
import { profileLabel, profileBlurb } from '../../public/js/profiles.js';
import { project, spread } from '../../public/js/worldMap.js';

// The logged-out landing page: a visitor with a link can watch without an account, and the page
// shows the game before asking anyone to sign up.

const ID = 'p10RED9EW4gg43VgKhRu'; // a real-looking Firestore auto id

describe('parseGameLink', () => {
  it('takes the id from a full link', () => {
    expect(parseGameLink(`https://geopolitics-peach.vercel.app/game/${ID}`)).toBe(ID);
  });

  it('ignores a trailing slash, a query string and a hash', () => {
    expect(parseGameLink(`https://example.test/game/${ID}/`)).toBe(ID);
    expect(parseGameLink(`https://example.test/game/${ID}?utm=1`)).toBe(ID);
    expect(parseGameLink(`https://example.test/game/${ID}#top`)).toBe(ID);
  });

  it('works on a local link too', () => {
    expect(parseGameLink(`http://localhost:3000/game/${ID}`)).toBe(ID);
  });

  it('takes the id from just the path', () => {
    expect(parseGameLink(`/game/${ID}`)).toBe(ID);
    expect(parseGameLink(`game/${ID}`)).toBe(ID);
  });

  it('accepts the bare id', () => {
    expect(parseGameLink(ID)).toBe(ID);
  });

  it('trims spaces and line breaks around what was pasted', () => {
    expect(parseGameLink(`  https://example.test/game/${ID}\n`)).toBe(ID);
    expect(parseGameLink(`\t${ID} `)).toBe(ID);
  });

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['words', 'hello there'],
    ['a link that is not a game', 'https://example.test/'],
    ['a game path with no id', '/game/'],
    ['a path with extra parts', `/game/${ID}/extra`],
    ['an id that is too short', 'abc'],
    ['an id with odd characters', 'abc$%^def123'],
    ['a different route', `https://example.test/games/${ID}`],
  ])('gives null for %s', (_label, input) => {
    expect(parseGameLink(input)).toBeNull();
  });

  it('gives null rather than throwing for a value that is not text', () => {
    expect(parseGameLink(undefined)).toBeNull();
    expect(parseGameLink(null)).toBeNull();
    expect(parseGameLink(42)).toBeNull();
  });
});

describe('HOW_IT_WORKS', () => {
  it('has four steps, each with a title and a sentence', () => {
    expect(HOW_IT_WORKS).toHaveLength(4);
    for (const step of HOW_IT_WORKS) {
      expect(step.title.trim()).not.toBe('');
      expect(step.text.trim()).not.toBe('');
    }
  });

  it('says what a visitor needs to know about watching', () => {
    const all = HOW_IT_WORKS.map((s) => `${s.title} ${s.text}`).join(' ');
    expect(all).toMatch(/watch|link/i);
  });
});

describe('npcCards', () => {
  it('gives Warlord, Fortress and Opportunist in that order', () => {
    expect(npcCards().map((c) => c.profile)).toEqual(['warlord', 'fortress', 'opportunist']);
  });

  it('takes each name and blurb from profiles.js, so the wording lives in one place', () => {
    for (const card of npcCards()) {
      expect(card.name).toBe(profileLabel(card.profile));
      expect(card.blurb).toBe(profileBlurb(card.profile));
      expect(card.name).not.toBe('');
      expect(card.blurb).not.toBe('');
    }
  });
});

describe('sampleGame', () => {
  let game;
  let codes;
  beforeEach(() => {
    game = sampleGame();
    codes = Object.keys(game.countries);
  });

  it('has ten countries with a name, an owner, soldiers and a capital position', () => {
    expect(codes).toHaveLength(10);
    for (const c of Object.values(game.countries)) {
      expect(c.name).toEqual(expect.any(String));
      expect(c.owner).toEqual(expect.any(String));
      expect(Number.isInteger(c.soldiers) && c.soldiers >= 1).toBe(true);
      expect(Number.isFinite(c.lat) && Number.isFinite(c.lng)).toBe(true);
    }
  });

  it('gives the human one country and every other country to a different NPC', () => {
    const owners = codes.map((code) => game.countries[code].owner);
    expect(owners.filter((o) => o === 'human')).toHaveLength(1);
    expect(new Set(owners).size).toBe(10);
  });

  it('knows every owner, with its home country, and an NPC profile for each NPC', () => {
    for (const code of codes) {
      const owner = game.countries[code].owner;
      expect(game.players[owner]).toBeDefined();
      expect(codes).toContain(game.players[owner].homeCode);
      if (owner !== 'human') expect(['warlord', 'fortress', 'opportunist']).toContain(game.players[owner].profile);
    }
  });

  it('lists the turn order with every player once', () => {
    expect(new Set(game.turnOrder).size).toBe(10);
    expect(game.turnOrder.every((id) => game.players[id])).toBe(true);
  });

  it('has borders that only name real countries and are listed from both sides', () => {
    for (const [code, neighbours] of Object.entries(game.borders)) {
      expect(codes).toContain(code);
      expect(neighbours).not.toContain(code);
      for (const other of neighbours) {
        expect(codes).toContain(other);
        expect(game.borders[other]).toContain(code);
      }
    }
    expect(codes.every((c) => (game.borders[c] ?? []).length >= 1)).toBe(true);
  });

  it('is only a picture: it is not a game anyone can play or watch', () => {
    expect(game.isOwner).toBe(false);
    expect(game.attack ?? null).toBeNull();
  });

  it('draws with no two nodes on top of each other once the map has spread them', () => {
    const box = { width: 400, height: 300, padding: 36 };
    const nodes = spread(project(game.countries, box), { minDistance: 52, ...box });
    const pts = Object.values(nodes);
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(51.9);
      }
    }
  });

  it('is built fresh each time, so one caller cannot change what another sees', () => {
    const a = sampleGame();
    a.countries[Object.keys(a.countries)[0]].soldiers = 999;
    expect(sampleGame().countries[Object.keys(a.countries)[0]].soldiers).not.toBe(999);
  });
});
