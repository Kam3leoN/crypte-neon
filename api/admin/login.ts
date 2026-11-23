import { route, requireAdmin } from '../_lib/http.js';
import { db } from '../_lib/db.js';

/** POST /api/admin/login — vérifie le mot de passe (en-tête x-admin-key) et la connexion à la base. */
export default route({
  POST: async (req, res) => {
    requireAdmin(req);
    const sql = await db();
    const [r] = await sql`SELECT
      (SELECT count(*)::int FROM levels) AS levels,
      (SELECT count(*)::int FROM players) AS players,
      (SELECT count(*)::int FROM endless_scores) AS games`;
    res.status(200).json({ ok: true, stats: r });
  },
});
