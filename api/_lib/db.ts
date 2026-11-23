import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';

export type Row = Record<string, unknown>;
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

let client: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function getSql(): Sql {
  // En dev sans DATABASE_URL, vite.config.ts injecte une base PGlite locale.
  const injected = (globalThis as { __CRYPTE_SQL__?: Sql }).__CRYPTE_SQL__;
  if (injected) return injected;
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new HttpError(500, 'DATABASE_URL n\'est pas configurée sur le serveur');
    client = neon(url) as unknown as Sql;
  }
  return client;
}

/** Client SQL prêt à l'emploi ; crée les tables au premier appel de chaque instance (idempotent). */
export async function db(): Promise<Sql> {
  const sql = getSql();
  schemaReady ??= ensureSchema(sql).catch((e: unknown) => {
    schemaReady = null;
    throw e;
  });
  await schemaReady;
  return sql;
}

async function ensureSchema(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS players (
    id uuid PRIMARY KEY,
    name text NOT NULL DEFAULT '',
    coins integer NOT NULL DEFAULT 0,
    best_endless integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS levels (
    id serial PRIMARY KEY,
    name text NOT NULL,
    lava real NOT NULL DEFAULT 0,
    map jsonb NOT NULL,
    published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS progress (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    level_id text NOT NULL,
    stars smallint NOT NULL DEFAULT 0,
    dots integer NOT NULL DEFAULT 0,
    completions integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, level_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS endless_scores (
    id bigserial PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score integer NOT NULL,
    height integer NOT NULL,
    coins integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS endless_scores_score_idx ON endless_scores (score DESC)`;
}

export interface LevelRow { id: string; name: string; lava: number; map: string[]; published: boolean; sortOrder: number; updatedAt?: string }

export function toLevel(r: Row): LevelRow {
  const map = typeof r.map === 'string' ? (JSON.parse(r.map) as string[]) : (r.map as string[]);
  return {
    id: String(r.id),
    name: String(r.name),
    lava: Number(r.lava),
    map,
    published: Boolean(r.published),
    sortOrder: Number(r.sort_order),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
  };
}

/** Crée le joueur s'il n'existe pas encore. */
export async function ensurePlayer(sql: Sql, id: string): Promise<void> {
  await sql`INSERT INTO players (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
}
