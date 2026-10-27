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

  it('hides the message of an unexpected error behind a 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(appThrowing(new Error('secret key abc123 leaked'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal');
    expect(JSON.stringify(res.body)).not.toContain('abc123');
  });
});
