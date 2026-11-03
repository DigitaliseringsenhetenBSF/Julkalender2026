import type { Queryable } from './db.ts';

export interface MissionRow {
  id: number;
  day: number;
  title: string;
  description: string;
}

export async function listMissions(db: Queryable): Promise<MissionRow[]> {
  return db.query<MissionRow>('SELECT id, day, title, description FROM missions ORDER BY day');
}

export async function findMissionIdByDay(db: Queryable, day: number): Promise<number | null> {
  const [row] = await db.query<{ id: number }>('SELECT id FROM missions WHERE day = $1', [day]);
  return row?.id ?? null;
}

export async function listCompletedDays(db: Queryable, userId: number): Promise<Set<number>> {
  const rows = await db.query<{ day: number }>(
    `SELECT m.day FROM completions c JOIN missions m ON m.id = c.mission_id WHERE c.user_id = $1`,
    [userId],
  );
  return new Set(rows.map((r) => r.day));
}
