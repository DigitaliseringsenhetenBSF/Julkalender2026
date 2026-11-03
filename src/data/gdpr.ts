import type { Db } from './db.ts';

export interface PersonalDataCounts {
  users: number;
  completions: number;
  openings: number;
  boardPieces: number;
}

export async function countPersonalData(db: Db): Promise<PersonalDataCounts> {
  const [row] = await db.query<PersonalDataCounts>(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM completions) AS completions,
            (SELECT count(*)::int FROM lucka_openings) AS openings,
            (SELECT count(*)::int FROM board_pieces) AS "boardPieces"`,
  );
  return row ?? { users: 0, completions: 0, openings: 0, boardPieces: 0 };
}

/**
 * Post-campaign purge (SPEC §9), in one transaction:
 * 1. keep anonymous per-lucka aggregates in campaign_summary,
 * 2. delete every board, opened lucka, completion and user.
 * Missions, puzzle pieces and the unlocked-pieces high-water mark are not personal data and stay.
 */
export function purgePersonalData(db: Db): Promise<PersonalDataCounts> {
  return db.transaction(async (tx) => {
    const [before] = await tx.query<PersonalDataCounts>(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT count(*)::int FROM completions) AS completions,
              (SELECT count(*)::int FROM lucka_openings) AS openings,
              (SELECT count(*)::int FROM board_pieces) AS "boardPieces"`,
    );
    await tx.query(
      `INSERT INTO campaign_summary (day, completions, participants)
       SELECT m.day, count(c.user_id)::int, count(DISTINCT c.user_id)::int
       FROM missions m LEFT JOIN completions c ON c.mission_id = m.id
       GROUP BY m.day
       ON CONFLICT (day) DO UPDATE
       SET completions = EXCLUDED.completions, participants = EXCLUDED.participants,
           captured_at = now()`,
    );
    await tx.query('DELETE FROM board_pieces');
    await tx.query('DELETE FROM lucka_openings');
    await tx.query('DELETE FROM completions');
    await tx.query('DELETE FROM users');
    return before ?? { users: 0, completions: 0, openings: 0, boardPieces: 0 };
  });
}
