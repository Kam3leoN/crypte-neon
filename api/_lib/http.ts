import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

/** Routeur par méthode HTTP avec gestion d'erreurs homogène (JSON). */
export function route(methods: Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>>): Handler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const h = methods[(req.method ?? 'GET') as keyof typeof methods];
    if (!h) {
      res.setHeader('Allow', Object.keys(methods).join(', '));
      return res.status(405).json({ error: 'Méthode non autorisée' });
    }
    try {
      await h(req, res);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      const msg = e instanceof Error ? e.message : '';
      // Aide au diagnostic sans exposer la chaîne de connexion.
      if (/password authentication failed|ENOTFOUND|getaddrinfo|connection|DATABASE_URL|NeonDbError/i.test(msg)) {
        return res.status(500).json({
          error: 'Base Neon injoignable. Vérifie DATABASE_URL (URL pooled) sur Vercel.',
        });
      }
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

export function readBody(req: VercelRequest): Record<string, unknown> {
  const b: unknown = req.body;
  if (b && typeof b === 'object') return b as Record<string, unknown>;
  if (typeof b === 'string' && b) {
    try { return JSON.parse(b) as Record<string, unknown>; } catch { throw new HttpError(400, 'JSON invalide'); }
  }
  return {};
}

export function query(req: VercelRequest, name: string): string | undefined {
  const v = req.query?.[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Vérifie l'en-tête x-admin-key contre la variable ADMIN_PASSWORD. */
export function requireAdmin(req: VercelRequest): void {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new HttpError(500, 'ADMIN_PASSWORD n\'est pas configuré sur le serveur');
  const raw = req.headers['x-admin-key'];
  const got = Array.isArray(raw) ? raw[0] : raw;
  const a = Buffer.from(String(got ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Mot de passe administrateur incorrect');
}
