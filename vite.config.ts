import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * En développement, exécute les fonctions /api/*.ts (format Vercel) directement dans Vite.
 * Si DATABASE_URL n'est pas défini, une base PostgreSQL locale (PGlite, dossier .pglite) est utilisée.
 * En production, Vercel exécute ces mêmes fichiers comme fonctions serverless.
 */
function devApi(): Plugin {
  return {
    name: 'crypte-dev-api',
    apply: 'serve',
    async configureServer(server: ViteDevServer) {
      if (!process.env.DATABASE_URL) {
        const { PGlite } = await import('@electric-sql/pglite');
        const pg = new PGlite(resolve(root, '.pglite'));
        (globalThis as Record<string, unknown>).__CRYPTE_SQL__ = async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.reduce((acc, s, i) => `${acc}$${i}${s}`);
          return (await pg.query(text, values)).rows;
        };
        server.config.logger.info('  ➜  API : DATABASE_URL absent, base locale PGlite (.pglite) utilisée');
      }
      if (!process.env.ADMIN_PASSWORD) {
        process.env.ADMIN_PASSWORD = 'admin';
        server.config.logger.info('  ➜  Admin : ADMIN_PASSWORD absent, mot de passe de dev = "admin"');
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url === '/admin' || req.url === '/admin/') { req.url = '/admin.html'; return next(); }
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const file = resolve(root, `.${url.pathname}.ts`);
        if (url.pathname.includes('/_') || !existsSync(file)) {
          res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' })); return;
        }
        try {
          const raw = await new Promise<string>((ok, ko) => {
            let data = ''; req.on('data', (c) => (data += c)); req.on('end', () => ok(data)); req.on('error', ko);
          });
          let body: unknown = raw;
          if (raw && String(req.headers['content-type']).includes('application/json')) body = JSON.parse(raw);
          const mod = await server.ssrLoadModule(file);
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams), body });
          const vres = Object.assign(res, {
            status(code: number) { res.statusCode = code; return vres; },
            json(obj: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return vres; },
            send(data: string) { res.end(data); return vres; },
          });
          await mod.default(vreq, vres);
        } catch (e) {
          if (e instanceof Error) server.ssrFixStacktrace(e);
          console.error(e);
          res.statusCode = 500; res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;
  return {
    plugins: [devApi()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(root, 'index.html'),
          admin: resolve(root, 'admin.html'),
        },
      },
    },
  };
});
