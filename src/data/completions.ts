import { nextHighWaterMark } from '../domain/pieces.ts';
import type { Db, Queryable } from './db.ts';

export interface PieceRules {
  completionsPerPiece: number;
  totalPieces: number;
}

/**
 * Locks the campaign_state row, recounts completions and raises the high-water mark if the
 * total now earns more pieces. Must run inside a transaction. Taking the row lock first
 * serialises every completion change, so the count is exact even under parallel requests
 * (SPEC §5.3). Returns how many pieces were newly unlocked.
 */
export async function lockAndRaiseHighWaterMark(
  tx: Queryable,
  rules: PieceRules,
  change?: () => Promise<void>,
): Promise<number> {
  const [state] = await tx.query<{ unlocked: number }>(
    'SELECT unlocked_pieces AS unlocked FROM campaign_state WHERE id = 1 FOR UPDATE',
  );
  if (!state) throw new Error('campaign_state row is missing – run migrations');

  if (change) await change();

  const [count] = await tx.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM completions',
  );
  const next = nextHighWaterMark(
    state.unlocked,
    count?.total ?? 0,
    rules.completionsPerPiece,
    rules.totalPieces,
  );
  if (next !== state.unlocked) {
    await tx.query(
      'UPDATE campaign_state SET unlocked_pieces = $1, updated_at = now() WHERE id = 1',
      [next],
    );
  }
  return next - state.unlocked;
}

/** Idempotent tick-off (`completed = true`) or un-tick (`completed = false`). */
export function setCompletion(
  db: Db,
  input: { userId: number; missionId: number; completed: boolean },
  rules: PieceRules,
): Promise<number> {
  return db.transaction((tx) =>
    lockAndRaiseHighWaterMark(tx, rules, async () => {
      if (input.completed) {
        await tx.query(
          `INSERT INTO completions (user_id, mission_id) VALUES ($1, $2)
           ON CONFLICT (user_id, mission_id) DO NOTHING`,
          [input.userId, input.missionId],
        );
      } else {
        await tx.query('DELETE FROM completions WHERE user_id = $1 AND mission_id = $2', [
          input.userId,
          input.missionId,
        ]);
      }
    }),
  );
}
