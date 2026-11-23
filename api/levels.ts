import { route } from './_lib/http.js';
import { db, toLevel } from './_lib/db.js';

/** GET /api/levels — niveaux publiés, dans l'ordre de la campagne. */
export default route({
  GET: async (_req, res) => {
    const sql = await db();
    const rows = await sql`SELECT id, name, lava, map, published, sort_order FROM levels WHERE published ORDER BY sort_order, id`;
    res.status(200).json({ levels: rows.map(toLevel) });
  },
});
