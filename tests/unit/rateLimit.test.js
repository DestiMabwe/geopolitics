import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// A fake clock, so no test waits for real time to pass.
function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms) => { c.t += ms; } };
  return c;
}

// The caller's uid comes from a header, standing in for requireAuth.
function appWith(options) {
  const app = express();
  app.use((req, res, next) => { req.uid = req.get('x-uid'); next(); });
  app.get('/t', rateLimit(options), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

const hit = (app, uid = 'alice') => request(app).get('/t').set('x-uid', uid);

describe('rateLimit (ARCHITECTURE §5.2)', () => {
  it('lets requests through up to the limit', async () => {
    const app = appWith({ limit: 3, windowMs: 60_000, now: clock().now });
    for (let i = 0; i < 3; i++) {
      expect((await hit(app)).status).toBe(200);
    }
  });

  it('returns 429 on the request after the limit', async () => {
    const app = appWith({ limit: 3, windowMs: 60_000, now: clock().now });
    for (let i = 0; i < 3; i++) await hit(app);
    const res = await hit(app);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('too_many_requests');
  });

  it('tells the caller how long to wait, in whole seconds', async () => {
    const c = clock();
    const app = appWith({ limit: 1, windowMs: 60_000, now: c.now });
    await hit(app);
    c.advance(10_500);
    const res = await hit(app);
    expect(res.headers['retry-after']).toBe('50');
  });

  it('never tells the caller to wait 0 seconds', async () => {
    const c = clock();
    const app = appWith({ limit: 1, windowMs: 60_000, now: c.now });
    await hit(app);
    c.advance(59_999);
    expect((await hit(app)).headers['retry-after']).toBe('1');
  });

  it('counts each user separately', async () => {
    const app = appWith({ limit: 1, windowMs: 60_000, now: clock().now });
    await hit(app, 'alice');
    expect((await hit(app, 'alice')).status).toBe(429);
    expect((await hit(app, 'bob')).status).toBe(200);
  });

  it('counts by the key function when one is given', async () => {
    const app = appWith({ limit: 1, windowMs: 60_000, now: clock().now, key: (req) => req.get('x-room') });
    const inRoom = (room) => request(app).get('/t').set('x-uid', 'alice').set('x-room', room);
    await inRoom('one');
    expect((await inRoom('one')).status).toBe(429);
    expect((await inRoom('two')).status).toBe(200);
  });

  it('does not count a refused request', async () => {
    const c = clock();
    const app = appWith({ limit: 1, windowMs: 60_000, now: c.now });
    await hit(app);
    for (let i = 0; i < 5; i++) await hit(app);
    c.advance(60_000);
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(429);
  });

  it('lets requests through again once the window has ended', async () => {
    const c = clock();
    const app = appWith({ limit: 1, windowMs: 60_000, now: c.now });
    await hit(app);
    expect((await hit(app)).status).toBe(429);
    c.advance(60_000);
    expect((await hit(app)).status).toBe(200);
  });
});
