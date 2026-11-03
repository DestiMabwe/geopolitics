import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApi, ApiError, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '../../public/js/api.js';

// QA 2026-11-03 ISSUE-A: a request the server never answers must end in an error, not "Loading…" forever.

/** A fetch that never answers, but rejects like the real one when its signal is aborted. */
function hangingFetch() {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
}

const okFetch = async () =>
  new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const loggedOut = async () => null;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createApi timeouts', () => {
  it('has a longer limit for writes than for reads', () => {
    expect(WRITE_TIMEOUT_MS).toBeGreaterThan(READ_TIMEOUT_MS);
  });

  it('rejects a GET with a timeout error when nothing answers', async () => {
    const api = createApi({ fetch: hangingFetch(), getToken: loggedOut });
    const result = api.get('/games/g1').catch((e) => e);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('timeout');
  });

  it('does not give up on a GET before the read limit', async () => {
    const api = createApi({ fetch: hangingFetch(), getToken: loggedOut });
    let settled = false;
    api.get('/games/g1').then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2); // let the pending request end before the test does
  });

  it('gives a POST longer than a GET', async () => {
    const api = createApi({ fetch: hangingFetch(), getToken: loggedOut });
    let settled = false;
    const result = api.post('/games/g1/roll').catch((e) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
    expect((await result).code).toBe('timeout');
  });

  it('passes an abort signal to fetch', async () => {
    let seen;
    const fetch = async (url, init) => {
      seen = init.signal;
      return okFetch();
    };
    await createApi({ fetch, getToken: loggedOut }).get('/countries');
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it('answers normally and leaves no timer running when the server is quick', async () => {
    const api = createApi({ fetch: okFetch, getToken: loggedOut });
    await expect(api.get('/countries')).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still reports a refused connection as "network", not "timeout"', async () => {
    const fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const err = await createApi({ fetch, getToken: loggedOut })
      .get('/countries')
      .catch((e) => e);
    expect(err.code).toBe('network');
  });
});
