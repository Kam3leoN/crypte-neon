-- Schéma Crypte Néon (PostgreSQL / Neon). L'API le crée aussi automatiquement au premier appel.

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  coins integer NOT NULL DEFAULT 0,
  best_endless integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS levels (
  id serial PRIMARY KEY,
  name text NOT NULL,
  lava real NOT NULL DEFAULT 0,
  map jsonb NOT NULL,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level_id text NOT NULL,
  stars smallint NOT NULL DEFAULT 0,
  dots integer NOT NULL DEFAULT 0,
  completions integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, level_id)
);

CREATE TABLE IF NOT EXISTS endless_scores (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score integer NOT NULL,
  height integer NOT NULL,
  coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endless_scores_score_idx ON endless_scores (score DESC);
