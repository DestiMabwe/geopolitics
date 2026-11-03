import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestTimeout } from '../../src/middleware/requestTimeout.js';

// QA 2026-11-03 ISSUE-A: a database that never answers must become a quick 503, not a hung request.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function appWith(handler, ms = 50) {
  const app = express();
  app.use(requestTimeout(ms));
  app.get('/x', handler);
  return app;
}

describe('requestTimeout', () => {
  it('answers 503 when the handler never responds', async () => {
    const res = await request(appWith(() => {})).get('/x');
    expect(res.status).toBe(503);
  });

  it('uses the ARCHITECTURE §3 error shape with code "unavailable"', async () => {
    const res = await request(appWith(() => {})).get('/x');
    expect(res.body.error.code).toBe('unavailable');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('leaves a quick handler alone', async () => {
    const res = await request(appWith((req, res) => res.json({ ok: true }))).get('/x');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('does not crash when a handler finishes after the 503 was sent', async () => {
    const slow = async (req, res) => {
      await sleep(120);
      res.json({ late: true }); // headers already sent: must not throw out of the process
    };
    const res = await request(appWith(slow, 30)).get('/x');
    expect(res.status).toBe(503);
    await sleep(150); // give the late handler time to run; a crash would fail the test run
  });

  it('does not time out a handler that answers just before the limit', async () => {
    const res = await request(
      appWith(async (req, res) => {
        await sleep(20);
        res.json({ ok: true });
      }, 200),
    ).get('/x');
    expect(res.status).toBe(200);
  });
});
