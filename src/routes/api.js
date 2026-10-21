import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase.js';
import countries from '../data/countries.json' with { type: 'json' };

export const apiRouter = Router();

// ARCHITECTURE §3: public liveness check.
apiRouter.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ARCHITECTURE §3: public database check. Writes one fixed doc, so it can't be used to fill Firestore.
apiRouter.get('/health/db', async (req, res) => {
  const ref = getDb().collection('_health').doc('ping');
  await ref.set({ at: FieldValue.serverTimestamp() });
  const snap = await ref.get();
  res.json({ ok: snap.exists, firestore: 'ok' });
});

// ARCHITECTURE §3: public country catalogue. `value` (soldierValue) is added once S04 exists.
apiRouter.get('/countries', (req, res) => {
  res.json(countries);
});
