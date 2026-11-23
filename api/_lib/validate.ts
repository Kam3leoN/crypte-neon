import { HttpError } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TILES = new Set(['#', 'S', ' ', 'P', 'E', '*', 'o', 'b', 'v', 'x']);

export function uuid(v: unknown, field = 'playerId'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, `${field} invalide`);
  return v.toLowerCase();
}

export function int(v: unknown, min: number, max: number, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} invalide`);
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function num(v: unknown, min: number, max: number, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} invalide`);
  return Math.max(min, Math.min(max, n));
}

export function text(v: unknown, max: number, field: string, required = false): string {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `${field} requis`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} invalide`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  if (required && !s) throw new HttpError(400, `${field} requis`);
  return s;
}

export function levelId(v: unknown): string {
  const s = text(v, 64, 'levelId', true);
  if (!/^[\w-]+$/.test(s)) throw new HttpError(400, 'levelId invalide');
  return s;
}

/** Vérifie la forme d'une carte : lignes de même largeur, caractères autorisés, un départ, une sortie. */
export function levelMap(v: unknown): string[] {
  if (!Array.isArray(v) || v.length < 5 || v.length > 300) throw new HttpError(400, 'La carte doit contenir entre 5 et 300 lignes');
  const rows = v.map((r) => {
    if (typeof r !== 'string') throw new HttpError(400, 'Ligne de carte invalide');
    return r;
  });
  const w = rows[0].length;
  if (w < 5 || w > 25) throw new HttpError(400, 'La largeur doit être comprise entre 5 et 25');
  let p = 0, e = 0;
  for (const r of rows) {
    if (r.length !== w) throw new HttpError(400, 'Toutes les lignes doivent avoir la même largeur');
    for (const c of r) {
      if (!TILES.has(c)) throw new HttpError(400, `Caractère interdit dans la carte : "${c}"`);
      if (c === 'P') p++;
      if (c === 'E') e++;
    }
  }
  if (p !== 1 || e !== 1) throw new HttpError(400, 'La carte doit contenir exactement un départ (P) et une sortie (E)');
  return rows;
}
