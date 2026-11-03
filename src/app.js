import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { apiRouter } from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestTimeout } from './middleware/requestTimeout.js';

const READ_TIMEOUT_MS = 8_000;

// Resolved from this file, not the working directory, so Vercel and tests find it too.
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Builds the Express app. Exported so Supertest (tests) and Vercel (api/index.js)
 * can use the same app without opening a port.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();
  app.use(express.json());
  // Reads only: a 503 on a write could say "failed" while the write still lands. Under the
  // browser's 10 s read limit, so the player gets the server's message, not a bare timeout.
  const readTimeout = requestTimeout(READ_TIMEOUT_MS);
  app.use('/api', (req, res, next) => (req.method === 'GET' ? readTimeout(req, res, next) : next()));
  app.use('/api', apiRouter);
  app.use(express.static(publicDir));
  // Mirrors the vercel.json rewrite, so a shared game link opens in local dev too.
  app.get('/game/*rest', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
  // Last, so it catches errors from every route above.
  app.use(errorHandler);
  return app;
}
