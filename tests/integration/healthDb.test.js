import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/config/firebase.js';

// S31a: proves the deployed server can reach Firestore. Kept as a permanent health check.
describe('GET /api/health/db', () => {
  it('writes and reads back the health doc', async () => {
    const before = Date.now();
    const res = await request(createApp()).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, firestore: 'ok' });

    const snap = await getDb().collection('_health').doc('ping').get();
    expect(snap.exists).toBe(true);
    expect(snap.data().at.toMillis()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('needs no login', async () => {
    const res = await request(createApp()).get('/api/health/db');
    expect(res.status).not.toBe(401);
  });
});
