import express from 'express';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';

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
  app.use('/api', apiRouter);
  app.use(express.static(publicDir));
  return app;
}
