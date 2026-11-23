import { route, readBody } from './_lib/http.js';
import { db, ensurePlayer } from './_lib/db.js';
import { int, levelId, uuid } from './_lib/validate.js';

/** POST /api/progress {playerId, levelId, stars, dots, coins} — fin de niveau. */
export default route({
  POST: async (req, res) => {
    const b = readBody(req);
    const id = uuid(b.playerId);
    const lvl = levelId(b.levelId);
    const stars = int(b.stars ?? 0, 0, 3, 'stars');
    const dots = int(b.dots ?? 0, 0, 100, 'dots');
    const coins = int(b.coins ?? 0, 0, 500, 'coins');
    const sql = await db();
    await ensurePlayer(sql, id);
    if (coins) await sql`UPDATE players SET coins = coins + ${coins}, updated_at = now() WHERE id = ${id}`;
    await sql`INSERT INTO progress (player_id, level_id, stars, dots) VALUES (${id}, ${lvl}, ${stars}, ${dots})
              ON CONFLICT (player_id, level_id) DO UPDATE SET
                stars = GREATEST(progress.stars, EXCLUDED.stars),
                dots = GREATEST(progress.dots, EXCLUDED.dots),
                completions = progress.completions + 1,
                updated_at = now()`;
    res.status(200).json({ ok: true });
  },
});
