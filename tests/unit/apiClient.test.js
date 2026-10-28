import { describe, it, expect } from 'vitest';
import { createApi, ApiError } from '../../public/js/api.js';

// The browser's API client (ARCHITECTURE §3, §5.2). It runs in Node too: fetch and the
// token source are passed in, so these tests use fakes and no network.

/** A fake fetch that records each call and answers with `status` and `body`. */
function fakeFetch(status = 200, body = { ok: true }) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch, calls };
}

const loggedOut = async () => null;
const loggedIn = async () => 'token-abc';

describe('createApi', () => {
  it('calls /api plus the path', async () => {
    const { fetch, calls } = fakeFetch();
    await createApi({ fetch, getToken: loggedOut }).get('/countries');
    expect(calls[0].url).toBe('/api/countries');
  });

  it('sends no Authorization header when logged out', async () => {
    const { fetch, calls } = fakeFetch();
    await createApi({ fetch, getToken: loggedOut }).get('/games/g1');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('sends Bearer <token> when logged in', async () => {
    const { fetch, calls } = fakeFetch();
    await createApi({ fetch, getToken: loggedIn }).get('/games');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-abc');
  });

  it('sends a GET with no body', async () => {
    const { fetch, calls } = fakeFetch();
    await createApi({ fetch, getToken: loggedOut }).get('/countries');
    expect(calls[0].init.method ?? 'GET').toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('sends a POST body as JSON', async () => {
    const { fetch, calls } = fakeFetch(201);
    await createApi({ fetch, getToken: loggedIn }).post('/games', { countryCode: 'ZAF' });
    const { init } = calls[0];
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ countryCode: 'ZAF' });
  });

  it('sends an empty JSON object when a POST has no body', async () => {
    const { fetch, calls } = fakeFetch();
    await createApi({ fetch, getToken: loggedIn }).post('/games/g1/attack/stop');
    expect(JSON.parse(calls[0].init.body)).toEqual({});
  });

  it('returns the parsed JSON on 2xx', async () => {
    const { fetch } = fakeFetch(201, { game: { id: 'g1' }, events: [] });
    const body = await createApi({ fetch, getToken: loggedIn }).post('/games', { countryCode: 'ZAF' });
    expect(body).toEqual({ game: { id: 'g1' }, events: [] });
  });

  it('asks for the token on every request, so a refreshed token is used', async () => {
    const { fetch, calls } = fakeFetch();
    let n = 0;
    const api = createApi({ fetch, getToken: async () => `t${++n}` });
    await api.get('/games');
    await api.get('/games');
    expect(new Headers(calls[1].init.headers).get('Authorization')).toBe('Bearer t2');
  });

  it('throws ApiError with status, code and message from { error }', async () => {
    const { fetch } = fakeFetch(409, { error: { code: 'stale_version', message: 'Someone moved first' } });
    const err = await createApi({ fetch, getToken: loggedIn })
      .post('/games/g1/attack/roll', { version: 3 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'stale_version', message: 'Someone moved first' });
  });

  it('throws ApiError with code unknown when an error response is not JSON', async () => {
    const fetch = async () => new Response('Bad Gateway', { status: 502 });
    const err = await createApi({ fetch, getToken: loggedOut }).get('/countries').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'unknown' });
  });

  it('throws ApiError status 0 code network when fetch rejects', async () => {
    const fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const err = await createApi({ fetch, getToken: loggedOut }).get('/countries').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'network' });
  });
});
