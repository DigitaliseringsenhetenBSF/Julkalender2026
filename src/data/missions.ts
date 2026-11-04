import type { Queryable } from './db.ts';

export interface MissionRow {
  id: number;
  day: number;
  title: string;
  /** "Gör så här" */
  howTo: string;
  /** "Om du vill" */
  ifYouWant: string;
  icon: string;
}

/** A mission as seen by one user, with the collective completion count for that uppdrag. */
export interface UserMissionRow extends MissionRow {
  completed: boolean;
  opened: boolean;
  completions: number;
}

export async function listMissionsForUser(
  db: Queryable,
  userId: number,
): Promise<UserMissionRow[]> {
  return db.query<UserMissionRow>(
    `SELECT m.id, m.day, m.title, m.how_to AS "howTo", m.if_you_want AS "ifYouWant", m.icon,
            EXISTS (SELECT 1 FROM completions c
                    WHERE c.mission_id = m.id AND c.user_id = $1) AS completed,
            EXISTS (SELECT 1 FROM lucka_openings o
                    WHERE o.mission_id = m.id AND o.user_id = $1) AS opened,
            (SELECT count(*)::int FROM completions c WHERE c.mission_id = m.id) AS completions
     FROM missions m
     ORDER BY m.day`,
    [userId],
  );
}

export async function findMissionIdByDay(db: Queryable, day: number): Promise<number | null> {
  const [row] = await db.query<{ id: number }>('SELECT id FROM missions WHERE day = $1', [day]);
  return row?.id ?? null;
}

/** Idempotent: a lucka is opened once and stays open. */
export async function openLucka(db: Queryable, userId: number, missionId: number): Promise<void> {
  await db.query(
    `INSERT INTO lucka_openings (user_id, mission_id) VALUES ($1, $2)
     ON CONFLICT (user_id, mission_id) DO NOTHING`,
    [userId, missionId],
  );
}
