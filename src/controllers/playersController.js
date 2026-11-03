import * as playerModel from '../models/playerModel.js';

/**
 * GET /players/me (token). Responds `200 { stats: { gamesStarted, wins, losses, lastPlayedAt } }`,
 * with `lastPlayedAt` as an ISO string, or null before the first game. ARCHITECTURE §3.
 */
export async function getMe(req, res) {
  const stats = await playerModel.getStats(req.uid);
  res.json({ stats: { ...stats, lastPlayedAt: stats.lastPlayedAt?.toDate().toISOString() ?? null } });
}
