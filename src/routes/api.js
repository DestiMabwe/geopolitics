import { Router } from 'express';
import countries from '../data/countries.json' with { type: 'json' };

export const apiRouter = Router();

// ARCHITECTURE §3: public liveness check.
apiRouter.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ARCHITECTURE §3: public country catalogue. `value` (soldierValue) is added once S04 exists.
apiRouter.get('/countries', (req, res) => {
  res.json(countries);
});
