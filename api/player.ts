import { route, readBody, query } from './_lib/http.js';
import { db } from './_lib/db.js';
import { text, uuid } from './_lib/validate.js';

/**
 * GET  /api/player?id=<uuid>      — sauvegarde du joueur
 * POST /api/player {playerId,name} — crée / renomme le joueur
 */
export default route({
  GET: async (req, res) => {
    const id = uuid(query(req, 'id'), 'id');
    const sql = await db();
    const [player] = await sql`SELECT name, coins, best_endless FROM players WHERE id = ${id}`;
    if (!player) return res.status(200).json({ exists: false });
    const rows = await sql`SELECT level_id, stars, dots FROM progress WHERE player_id = ${id}`;
    const progress: Record<string, { stars: number; dots: number }> = {};
    for (const r of rows) progress[String(r.level_id)] = { stars: Number(r.stars), dots: Number(r.dots) };
    res.status(200).json({ name: player.name, coins: Number(player.coins), bestEndless: Number(player.best_endless), progress });
  },
  POST: async (req, res) => {
    const b = readBody(req);
    const id = uuid(b.playerId);
    const name = text(b.name, 16, 'name');
    const sql = await db();
    await sql`INSERT INTO players (id, name) VALUES (${id}, ${name})
              ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`;
    res.status(200).json({ ok: true });
  },
});
