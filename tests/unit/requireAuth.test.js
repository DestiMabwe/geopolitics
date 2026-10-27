import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const verifyIdToken = vi.fn();
vi.mock('../../src/config/firebase.js', () => ({
  getAuthClient: () => ({ verifyIdToken }),
}));

const { requireAuth, optionalAuth } = await import('../../src/middleware/requireAuth.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');

// A one-route app that echoes req.uid, so each test sees exactly what the middleware set.
function appWith(middleware) {
  const app = express();
  app.get('/who', middleware, (req, res) => res.json({ uid: req.uid }));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async (token) => {
    if (token === 'good-token') return { uid: 'user-1' };
    throw new Error('auth/argument-error');
  });
});

describe('requireAuth (ARCHITECTURE §5.2)', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(appWith(requireAuth)).get('/who');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('returns 401 when the header is not a Bearer token', async () => {
    const res = await request(appWith(requireAuth)).get('/who').set('Authorization', 'Basic good-token');
    expect(res.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 401 when the token fails verification', async () => {
    const res = await request(appWith(requireAuth)).get('/who').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(verifyIdToken).toHaveBeenCalledWith('bad-token');
  });

  it('sets req.uid from a verified token', async () => {
    const res = await request(appWith(requireAuth)).get('/who').set('Authorization', 'Bearer good-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'user-1' });
  });
});

describe('optionalAuth', () => {
  it('optionalAuth sets req.uid to null without a token', async () => {
    const res = await request(appWith(optionalAuth)).get('/who');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: null });
  });

  it('optionalAuth treats an invalid token as a visitor', async () => {
    const res = await request(appWith(optionalAuth)).get('/who').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: null });
  });

  it('optionalAuth sets req.uid from a verified token', async () => {
    const res = await request(appWith(optionalAuth)).get('/who').set('Authorization', 'Bearer good-token');
    expect(res.body).toEqual({ uid: 'user-1' });
  });
});
