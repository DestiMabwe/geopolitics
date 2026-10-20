import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /api/health', () => {
  it('answers with 200 and { ok: true }', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('responds with JSON', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('static files', () => {
  it('serves public/index.html at /', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Geopolitics</title>');
  });
});
