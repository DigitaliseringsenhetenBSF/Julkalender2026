import { correctSlot } from '../domain/board.ts';
import { shuffledUnlockOrder } from '../domain/unlockOrder.ts';
import { lockAndRaiseHighWaterMark, type PieceRules } from './completions.ts';
import type { Content } from './content.ts';
import type { Db, Queryable } from './db.ts';
import { DEV_USER_PREFIX } from './users.ts';

/** Test identities for AUTH_MODE=dev. Never created in production. */
export const DEV_USERS = [
  ...Array.from({ length: 5 }, (_, i) => ({
    externalId: `${DEV_USER_PREFIX}testanvandare-${i + 1}`,
    displayName: `Testanvändare ${i + 1}`,
    role: 'user' as const,
  })),
  { externalId: `${DEV_USER_PREFIX}testadmin`, displayName: 'Testadmin', role: 'admin' as const },
];

/**
 * Demo data: 59 completions = 3 pieces unlocked (with the default threshold 15), and the next
 * tick-off unlocks the 4th. Handy for trying the unlock moment locally and in e2e tests.
 */
export const DEMO_COMPLETIONS = 59;

export function pieceRules(content: Content): PieceRules {
  return {
    completionsPerPiece: content.campaign.completionsPerPiece,
    totalPieces: content.puzzle.columns * content.puzzle.rows,
  };
}

async function seedMissions(tx: Queryable, content: Content): Promise<void> {
  for (const mission of content.missions) {
    await tx.query(
      `INSERT INTO missions (day, title, description) VALUES ($1, $2, $3)
       ON CONFLICT (day) DO UPDATE
       SET title = EXCLUDED.title, description = EXCLUDED.description, updated_at = now()
       WHERE (missions.title, missions.description)
             IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.description)`,
      [mission.day, mission.title, mission.description],
    );
  }
}

/**
 * Writes the puzzle pieces with their seeded unlock order. Once a piece has been unlocked the
 * order is frozen (SPEC §5.4): only alt texts and file names may change.
 */
async function seedPuzzle(tx: Queryable, content: Content): Promise<void> {
  const { puzzle } = content;
  const grid = { columns: puzzle.columns, rows: puzzle.rows };
  const order = shuffledUnlockOrder(
    puzzle.pieces.map((p) => p.id).sort((a, b) => a - b),
    puzzle.unlockSeed,
  );
  const rankOf = new Map(order.map((id, rank) => [id, rank]));

  const [state] = await tx.query<{ unlocked: number }>(
    'SELECT unlocked_pieces AS unlocked FROM campaign_state WHERE id = 1 FOR UPDATE',
  );

  if ((state?.unlocked ?? 0) === 0) {
    await tx.query('DELETE FROM puzzle_pieces');
    for (const piece of puzzle.pieces) {
      const slot = correctSlot(piece.id, grid);
      await tx.query(
        `INSERT INTO puzzle_pieces (id, grid_row, grid_col, unlock_rank, image_file, alt_text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [piece.id, slot.row, slot.col, rankOf.get(piece.id), piece.file, piece.alt],
      );
    }
    return;
  }

  const existing = await tx.query<{ id: number; rank: number }>(
    'SELECT id::int AS id, unlock_rank::int AS rank FROM puzzle_pieces',
  );
  const changed =
    existing.length !== puzzle.pieces.length || existing.some((p) => rankOf.get(p.id) !== p.rank);
  if (changed) {
    throw new Error(
      'The unlock order is frozen because pieces are already unlocked. ' +
        'Restore the original unlockSeed and piece list in content/puzzle.json.',
    );
  }
  for (const piece of puzzle.pieces) {
    await tx.query('UPDATE puzzle_pieces SET image_file = $2, alt_text = $3 WHERE id = $1', [
      piece.id,
      piece.file,
      piece.alt,
    ]);
  }
}

/** Idempotent: missions, puzzle, (optionally) test users, then a high-water-mark recount. */
export function seedBase(
  db: Db,
  content: Content,
  options: { includeDevUsers: boolean },
): Promise<void> {
  return db.transaction(async (tx) => {
    await seedMissions(tx, content);
    await seedPuzzle(tx, content);
    if (options.includeDevUsers) {
      for (const user of DEV_USERS) {
        await tx.query(
          `INSERT INTO users (external_id, display_name, role) VALUES ($1, $2, $3)
           ON CONFLICT (external_id) DO NOTHING`,
          [user.externalId, user.displayName, user.role],
        );
      }
    }
    await lockAndRaiseHighWaterMark(tx, pieceRules(content));
  });
}

/**
 * Adds demo colleagues and DEMO_COMPLETIONS completions spread over the luckor that are open
 * on the given day count. Idempotent. Development/test only.
 */
export function seedDemo(db: Db, content: Content, openMissions: number): Promise<void> {
  if (openMissions < 1) {
    throw new Error('No luckor are open yet – run with FAKE_TODAY=2026-12-10 (or later).');
  }
  const colleagues = Math.ceil(DEMO_COMPLETIONS / openMissions);
  return db.transaction(async (tx) => {
    const missions = await tx.query<{ id: number; day: number }>(
      'SELECT id, day FROM missions WHERE day <= $1 ORDER BY day',
      [openMissions],
    );
    let added = 0;
    for (let c = 1; c <= colleagues && added < DEMO_COMPLETIONS; c++) {
      const [user] = await tx.query<{ id: number }>(
        `INSERT INTO users (external_id, display_name) VALUES ($1, $2)
         ON CONFLICT (external_id) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [`demo:kollega-${c}`, `Kollega ${c}`],
      );
      for (const mission of missions) {
        if (added >= DEMO_COMPLETIONS) break;
        await tx.query(
          `INSERT INTO completions (user_id, mission_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [user?.id, mission.id],
        );
        added++;
      }
    }
    await lockAndRaiseHighWaterMark(tx, pieceRules(content));
  });
}
