import { route, readBody } from './_lib/http.js';
import { db, ensurePlayer } from './_lib/db.js';
import { int, uuid } from './_lib/validate.js';

/**
 * GET  /api/endless — top 10 (meilleur score par joueur)
 * POST /api/endless {playerId, score, height, coins} — enregistre une partie
 */
export default route({
  GET: async (_req, res) => {
    const sql = await db();
    const rows = await sql`
      SELECT COALESCE(NULLIF(p.name, ''), 'Anonyme') AS name, MAX(e.score)::int AS score
      FROM endless_scores e JOIN players p ON p.id = e.player_id
      GROUP BY p.id, p.name
      ORDER BY score DESC
      LIMIT 10`;
    res.status(200).json({ scores: rows.map((r) => ({ name: String(r.name), score: Number(r.score) })) });
  },
  POST: async (req, res) => {
    const b = readBody(req);
    const id = uuid(b.playerId);
    const score = int(b.score, 0, 1_000_000, 'score');
    const height = int(b.height ?? 0, 0, 10_000, 'height');
    const coins = int(b.coins ?? 0, 0, 1_000, 'coins');
    const sql = await db();
    await ensurePlayer(sql, id);
    await sql`INSERT INTO endless_scores (player_id, score, height, coins) VALUES (${id}, ${score}, ${height}, ${coins})`;
    await sql`UPDATE players SET coins = coins + ${coins}, best_endless = GREATEST(best_endless, ${score}), updated_at = now() WHERE id = ${id}`;
    res.status(200).json({ ok: true });
  },
});
