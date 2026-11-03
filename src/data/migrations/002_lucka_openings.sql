-- Which luckor each user has opened ("vänt"). An opened lucka stays open (SPEC §5.2).
-- A completion also counts as opened, so existing completions need no backfill.
CREATE TABLE lucka_openings (
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mission_id integer NOT NULL REFERENCES missions (id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id)
);
