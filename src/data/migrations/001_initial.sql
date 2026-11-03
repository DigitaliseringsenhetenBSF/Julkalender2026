-- Initial schema. See docs/SPEC.md §7 and docs/ARCHITECTURE.md.

CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stable identifier from the identity provider (e.g. "dev:testanvandare-1", later an Entra oid).
  external_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE missions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day smallint NOT NULL UNIQUE CHECK (day BETWEEN 1 AND 24),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (user, mission): the primary key makes tick-offs idempotent.
CREATE TABLE completions (
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mission_id integer NOT NULL REFERENCES missions (id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id)
);
CREATE INDEX completions_mission_idx ON completions (mission_id);

CREATE TABLE puzzle_pieces (
  id smallint PRIMARY KEY,
  grid_row smallint NOT NULL,
  grid_col smallint NOT NULL,
  -- 0-based position in the shared, seeded unlock order.
  unlock_rank smallint NOT NULL UNIQUE,
  image_file text NOT NULL,
  alt_text text NOT NULL,
  UNIQUE (grid_row, grid_col)
);

-- Singleton holding the high-water mark of unlocked pieces (never decreases).
CREATE TABLE campaign_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  unlocked_pieces integer NOT NULL DEFAULT 0 CHECK (unlocked_pieces >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO campaign_state (id) VALUES (1);

CREATE TABLE board_pieces (
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  piece_id smallint NOT NULL REFERENCES puzzle_pieces (id),
  area text NOT NULL CHECK (area IN ('tray_left', 'tray_right', 'board')),
  x double precision NOT NULL CHECK (x BETWEEN 0 AND 1),
  y double precision NOT NULL CHECK (y BETWEEN 0 AND 1),
  z integer NOT NULL DEFAULT 0,
  placed boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, piece_id)
);

-- Anonymous aggregates kept after the GDPR purge.
CREATE TABLE campaign_summary (
  day smallint PRIMARY KEY,
  completions integer NOT NULL,
  participants integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
