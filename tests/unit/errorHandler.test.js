import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler, HttpError } from '../../src/middleware/errorHandler.js';
import { IllegalMoveError, WrongPhaseError } from '../../src/game/errors.js';

// A one-route app whose handler throws `err`, so each test checks only the handler's mapping.
function appThrowing(err) {
  const app = express();
  app.use(express.json());
  app.all('/boom', () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorHandler (ARCHITECTURE §3 error shape)', () => {
  it('sends an HttpError with its own status and code', async () => {
    const res = await request(appThrowing(new HttpError(404, 'not_found', 'No such game'))).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No such game' } });
  });

  it('maps IllegalMoveError to 422', async () => {
    const res = await request(appThrowing(new IllegalMoveError('not a neighbour'))).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'illegal_move', message: 'not a neighbour' });
  });

  it('maps WrongPhaseError to 409', async () => {
    const res = await request(appThrowing(new WrongPhaseError('not attacking'))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'wrong_phase', message: 'not attacking' });
  });

  it('maps malformed JSON to 400', async () => {
    const res = await request(appThrowing(new Error('never reached')))
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_json');
  });

  // QA 2026-11-03 ISSUE-A: the Firestore client reports gRPC status 14 (UNAVAILABLE) when it
  // cannot connect and 4 (DEADLINE_EXCEEDED) when it gives up waiting. Neither is the caller's fault.
  it.each([
    ['UNAVAILABLE', 14],
    ['DEADLINE_EXCEEDED', 4],
  ])('maps a Firestore %s error to 503 "unavailable"', async (_name, code) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('14 UNAVAILABLE: No connection established at C:\\secret'), { code });
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('unavailable');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('still hides an unexpected error that has some other code behind a 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThrowing(Object.assign(new Error('x'), { code: 7 }))).get('/boom');
    expect(res.status).toBe(500);
  });

  it('hides the message of an unexpected error behind a 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThrowing(new Error('secret key abc123 leaked'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal');
    expect(JSON.stringify(res.body)).not.toContain('abc123');
  });
});
