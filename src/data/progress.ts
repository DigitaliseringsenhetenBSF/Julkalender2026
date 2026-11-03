import { remainingToNextPiece } from '../domain/pieces.ts';
import type { PieceRules } from './completions.ts';
import type { Queryable } from './db.ts';

export interface Progress {
  totalCompletions: number;
  unlockedPieces: number;
  totalPieces: number;
  completionsPerPiece: number;
  remainingToNextPiece: number;
  participants: number;
  perDay: { day: number; completions: number }[];
  mine: { completed: number; possible: number };
}

/** Collective and personal statistics (SPEC §6), all derived from the tables. */
export async function getProgress(
  db: Queryable,
  userId: number,
  openMissions: number,
  rules: PieceRules,
): Promise<Progress> {
  const [totals] = await db.query<{ total: number; participants: number; mine: number }>(
    `SELECT count(*)::int AS total,
            count(DISTINCT user_id)::int AS participants,
            count(*) FILTER (WHERE user_id = $1)::int AS mine
     FROM completions`,
    [userId],
  );
  const [state] = await db.query<{ unlocked: number }>(
    'SELECT unlocked_pieces AS unlocked FROM campaign_state WHERE id = 1',
  );
  const perDay = await db.query<{ day: number; completions: number }>(
    `SELECT m.day::int AS day, count(c.user_id)::int AS completions
     FROM missions m LEFT JOIN completions c ON c.mission_id = m.id
     WHERE m.day <= $1
     GROUP BY m.day ORDER BY m.day`,
    [openMissions],
  );

  const total = totals?.total ?? 0;
  const unlocked = state?.unlocked ?? 0;
  return {
    totalCompletions: total,
    unlockedPieces: unlocked,
    totalPieces: rules.totalPieces,
    completionsPerPiece: rules.completionsPerPiece,
    remainingToNextPiece: remainingToNextPiece(
      total,
      unlocked,
      rules.completionsPerPiece,
      rules.totalPieces,
    ),
    participants: totals?.participants ?? 0,
    perDay,
    mine: { completed: totals?.mine ?? 0, possible: openMissions },
  };
}
