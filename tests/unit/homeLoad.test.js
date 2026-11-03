import { describe, it, expect } from 'vitest';
import { loadHome } from '../../public/js/homeLoad.js';

// Production bug: a failing "my games" list (a missing Firestore index) also blocked the Start
// form, so no one could play. The two loads must fail independently.

const countries = { countries: [{ code: 'ZA' }] };
const boom = new Error('Something went wrong');

const fakeApi = ({ games, countries: c = countries }) => ({
  get: async (path) => {
    const result = path === '/games' ? games : c;
    if (result instanceof Error) throw result;
    return result;
  },
});

describe('loadHome', () => {
  it('returns the games and the catalogue when both load', async () => {
    const out = await loadHome({ api: fakeApi({ games: { games: [{ id: 'g1' }] } }), catalogue: null });
    expect(out).toEqual({ catalogue: countries, games: [{ id: 'g1' }], gamesError: null });
  });

  it('still returns the catalogue when only the games list fails', async () => {
    const out = await loadHome({ api: fakeApi({ games: boom }), catalogue: null });
    expect(out.catalogue).toBe(countries);
    expect(out.games).toBeNull();
    expect(out.gamesError).toBe(boom);
  });

  it('throws when the catalogue fails, because nothing can start without it', async () => {
    await expect(loadHome({ api: fakeApi({ games: { games: [] }, countries: boom }), catalogue: null })).rejects.toBe(boom);
  });

  it('reuses a catalogue it already has instead of fetching it again', async () => {
    const cached = { countries: [] };
    const paths = [];
    const api = { get: async (p) => (paths.push(p), { games: [] }) };
    const out = await loadHome({ api, catalogue: cached });
    expect(paths).toEqual(['/games']);
    expect(out.catalogue).toBe(cached);
  });
});
