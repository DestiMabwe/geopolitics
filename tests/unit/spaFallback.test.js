import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// Local dev mirrors vercel.json: /game/* serves index.html, so a shared game link opens.

describe('GET /game/:id', () => {
  it('serves index.html for a game link', async () => {
    const res = await request(createApp()).get('/game/abc123');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('data-view="game"');
  });

  it('serves it for a nested path too', async () => {
    const res = await request(createApp()).get('/game/abc123/anything');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
