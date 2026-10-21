import { describe, it, expect } from 'vitest';
import request from 'supertest';
import vercelApp from '../../api/index.js';
import config from '../../vercel.json' with { type: 'json' };

// ARCHITECTURE §6: Vercel runs api/index.js; vercel.json routes requests to it.
describe('Vercel entry (api/index.js)', () => {
  it('exports the Express app for Vercel', async () => {
    const res = await request(vercelApp).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('vercel.json', () => {
  const rewrite = (source) => config.rewrites.find((r) => r.source === source);

  it('rewrites /api/* to the serverless function', () => {
    expect(rewrite('/api/(.*)')).toEqual({ source: '/api/(.*)', destination: '/api' });
  });

  it('rewrites /game/* to index.html', () => {
    expect(rewrite('/game/(.*)')).toEqual({ source: '/game/(.*)', destination: '/index.html' });
  });

  it('serves public/ as the static site', () => {
    expect(config.outputDirectory).toBe('public');
  });

  it('runs the function in Cape Town, near Firestore in Johannesburg', () => {
    expect(config.regions).toEqual(['cpt1']);
  });
});
