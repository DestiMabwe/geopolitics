import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase.js';
import countries from '../data/countries.json' with { type: 'json' };
import { requireAuth, optionalAuth } from '../middleware/requireAuth.js';
import * as games from '../controllers/gamesController.js';
import { soldierValue } from '../game/soldiers.js';

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

// ARCHITECTURE §3: public country catalogue, with each soldier value (GAME_RULES §1.2) worked out
// here so the browser never computes a number it shows.
const catalogue = {
  ...countries,
  countries: countries.countries.map((c) => ({ ...c, value: soldierValue(c.population) })),
};
apiRouter.get('/countries', (req, res) => {
  res.json(catalogue);
});

// ARCHITECTURE §3: games. Creating and listing need a login; reading a game or its events is public.
apiRouter.post('/games', requireAuth, games.createGame);
apiRouter.get('/games', requireAuth, games.listGames);
apiRouter.get('/games/:id', optionalAuth, games.getGame);
apiRouter.get('/games/:id/events', games.listEvents);

// ARCHITECTURE §3, §4.1: the human's attack. Each roll is its own request; the server rolls the dice.
apiRouter.post('/games/:id/attack', requireAuth, games.startAttack);
apiRouter.post('/games/:id/attack/roll', requireAuth, games.rollAttack);
apiRouter.post('/games/:id/attack/stop', requireAuth, games.stopAttack);
apiRouter.post('/games/:id/attack/occupy', requireAuth, games.occupy);
apiRouter.post('/games/:id/skip', requireAuth, games.skip);

// ARCHITECTURE §3: the human's reinforce and manoeuvre phases.
apiRouter.post('/games/:id/reinforce', requireAuth, games.reinforce);
apiRouter.post('/games/:id/transfer', requireAuth, games.transfer);

// ARCHITECTURE §3, §4.2: one request plays one NPC's whole turn.
apiRouter.post('/games/:id/npc-turn', requireAuth, games.npcTurn);

// ARCHITECTURE §3, §4.3: one LLM line for one saved event.
apiRouter.post('/games/:id/events/:eventId/commentary', requireAuth, games.commentary);
