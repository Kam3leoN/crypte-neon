import { route, readBody, query, requireAdmin, HttpError } from '../_lib/http.js';
import { db, toLevel } from '../_lib/db.js';
import { int, levelMap, num, text } from '../_lib/validate.js';

const levelIdParam = (v: string | undefined) => int(v, 1, 2_147_483_647, 'id');

/**
 * Administration des niveaux (en-tête x-admin-key requis)
 * GET    /api/admin/levels            — tous les niveaux (brouillons inclus)
 * POST   /api/admin/levels            — création {name, lava, map, published}
 * PUT    /api/admin/levels?id=        — mise à jour
 * PATCH  /api/admin/levels            — réordonner {order: [id, id, ...]}
 * DELETE /api/admin/levels?id=        — suppression
 */
export default route({
  GET: async (req, res) => {
    requireAdmin(req);
    const sql = await db();
    const rows = await sql`SELECT id, name, lava, map, published, sort_order, updated_at FROM levels ORDER BY sort_order, id`;
    res.status(200).json({ levels: rows.map(toLevel) });
  },
  POST: async (req, res) => {
    requireAdmin(req);
    const b = readBody(req);
    const name = text(b.name, 60, 'name', true);
    const lava = num(b.lava ?? 0, 0, 5, 'lava');
    const map = levelMap(b.map);
    const published = b.published === true;
    const sql = await db();
    const [row] = await sql`
      INSERT INTO levels (name, lava, map, published, sort_order)
      VALUES (${name}, ${lava}, ${JSON.stringify(map)}::jsonb, ${published},
              (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM levels))
      RETURNING id, name, lava, map, published, sort_order, updated_at`;
    res.status(201).json({ level: toLevel(row) });
  },
  PUT: async (req, res) => {
    requireAdmin(req);
    const id = levelIdParam(query(req, 'id'));
    const b = readBody(req);
    const name = text(b.name, 60, 'name', true);
    const lava = num(b.lava ?? 0, 0, 5, 'lava');
    const map = levelMap(b.map);
    const published = b.published === true;
    const sql = await db();
    const [row] = await sql`
      UPDATE levels SET name = ${name}, lava = ${lava}, map = ${JSON.stringify(map)}::jsonb,
             published = ${published}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, name, lava, map, published, sort_order, updated_at`;
    if (!row) throw new HttpError(404, 'Niveau introuvable');
    res.status(200).json({ level: toLevel(row) });
  },
  PATCH: async (req, res) => {
    requireAdmin(req);
    const b = readBody(req);
    if (!Array.isArray(b.order) || b.order.length > 1000) throw new HttpError(400, 'order invalide');
    const ids = b.order.map((v) => levelIdParam(String(v)));
    const sql = await db();
    for (let i = 0; i < ids.length; i++) await sql`UPDATE levels SET sort_order = ${i + 1} WHERE id = ${ids[i]}`;
    res.status(200).json({ ok: true });
  },
  DELETE: async (req, res) => {
    requireAdmin(req);
    const id = levelIdParam(query(req, 'id'));
    const sql = await db();
    const rows = await sql`DELETE FROM levels WHERE id = ${id} RETURNING id`;
    if (!rows.length) throw new HttpError(404, 'Niveau introuvable');
    res.status(200).json({ ok: true });
  },
});
