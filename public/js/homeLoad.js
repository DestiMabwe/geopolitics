// What Home needs from the server, loaded so the two parts fail independently. A failing "my games"
// list (for example a missing Firestore index) must not stop a player starting a new game.

/**
 * @param {object} deps
 * @param {{ get(path: string): Promise<any> }} deps.api
 * @param {object | null} deps.catalogue  the GET /countries response if already fetched
 * @returns {Promise<{ catalogue: object, games: object[] | null, gamesError: unknown }>}
 * @throws the catalogue's error: without it there is nothing to start a game from
 */
export async function loadHome({ api, catalogue }) {
  const [gamesResult, catalogueResult] = await Promise.allSettled([
    api.get('/games'),
    catalogue ?? api.get('/countries'),
  ]);
  if (catalogueResult.status === 'rejected') throw catalogueResult.reason;
  if (gamesResult.status === 'rejected') {
    return { catalogue: catalogueResult.value, games: null, gamesError: gamesResult.reason };
  }
  return { catalogue: catalogueResult.value, games: gamesResult.value.games, gamesError: null };
}
