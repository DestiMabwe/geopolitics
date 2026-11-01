import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validate } from '../../src/middleware/validate.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// A one-route app that echoes what reached the handler, so each test sees exactly what passed.
function appWith(shape) {
  const app = express();
  app.use(express.json());
  app.post('/t', validate(shape), (req, res) => res.json({ reached: true, body: req.body ?? null }));
  app.use(errorHandler);
  return app;
}

const post = (shape, body) => request(appWith(shape)).post('/t').send(body);

describe('validate (ARCHITECTURE §5.2)', () => {
  it('passes a valid body on unchanged', async () => {
    const body = { version: 3, from: 'AAA', count: 2, placements: { BBB: 2 } };
    const res = await post({ version: 'version', from: 'code', count: 'count', placements: 'placements' }, body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true, body });
  });

  it('rejects an unknown key and names it', async () => {
    const res = await post({ version: 'version' }, { version: 1, soldiers: 99 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(res.body.error.message).toContain('soldiers');
  });

  it('rejects a missing field and names it', async () => {
    const res = await post({ version: 'version', count: 'count' }, { version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('count');
  });

  it.each([['1'], [0], [-1], [1.5], [null]])('rejects a version of %j', async (version) => {
    const res = await post({ version: 'version' }, { version });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('version');
  });

  it.each([['3'], [null], [true]])('rejects a count of %j', async (count) => {
    const res = await post({ count: 'count' }, { count });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('count');
  });

  // Range is the engine's call (GAME_RULES §6.1: it answers 422), so validate only checks the type.
  it.each([[0], [-2], [1.5]])('leaves a count of %j to the engine', async (count) => {
    expect((await post({ count: 'count' }, { count })).status).toBe(200);
  });

  it.each([[7], [''], [null]])('rejects a code of %j', async (from) => {
    const res = await post({ from: 'code' }, { from });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('from');
  });

  it.each([[null], [['AAA']], ['AAA'], [{ AAA: '2' }], [{ AAA: null }]])(
    'rejects placements of %j',
    async (placements) => {
      const res = await post({ placements: 'placements' }, { placements });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('placements');
    }
  );

  it.each([[{}], [{ AAA: 0 }], [{ AAA: -1 }]])('leaves placements of %j to the engine', async (placements) => {
    expect((await post({ placements: 'placements' }, { placements })).status).toBe(200);
  });

  it('takes no body when the shape is empty', async () => {
    expect((await request(appWith({})).post('/t').send()).status).toBe(200);
    const res = await post({}, { aiText: 'Made up by the client' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('aiText');
  });

  it('never reaches the handler on a bad body', async () => {
    const res = await post({ version: 'version' }, { version: 'x' });
    expect(res.body.reached).toBeUndefined();
  });
});
