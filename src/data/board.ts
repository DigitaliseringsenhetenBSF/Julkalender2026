import { type BoardArea, type ResolvedPosition, randomTrayPosition } from '../domain/board.ts';
import type { Db } from './db.ts';

/** A piece as stored for one user. Whether it lies correctly is kept server-side only. */
export interface BoardPiece {
  id: number;
  area: BoardArea;
  x: number;
  y: number;
  z: number;
  isNew: boolean;
  alt: string;
}

const SELECT_BOARD = `
  SELECT b.piece_id::int AS id, b.area, b.x, b.y, b.z, b.is_new AS "isNew",
         p.alt_text AS alt
  FROM board_pieces b JOIN puzzle_pieces p ON p.id = b.piece_id
  WHERE b.user_id = $1`;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The whole picture is unlocked and every piece lies in its place on this user's board. */
async function isComplete(tx: Tx, userId: number, totalPieces: number): Promise<boolean> {
  const [row] = await tx.query<{ placed: number }>(
    'SELECT count(*)::int AS placed FROM board_pieces WHERE user_id = $1 AND placed',
    [userId],
  );
  return (row?.placed ?? 0) >= totalPieces;
}

export interface BoardState {
  pieces: BoardPiece[];
  complete: boolean;
  /** Pieces that arrived on this user's board in this request (unlocked since last visit). */
  arrived: number;
  /** True when the user had no pieces before this request (first look at the puzzle). */
  firstVisit: boolean;
}

/**
 * The user's board. Unlocked pieces without a row yet get a random tray position, which is
 * stored right away so it never jumps on reload (SPEC §5.5). ON CONFLICT covers two tabs
 * loading the board at the same moment.
 */
export function getBoard(
  db: Db,
  userId: number,
  random: () => number,
  totalPieces: number,
): Promise<BoardState> {
  return db.transaction(async (tx) => {
    const unlocked = await tx.query<{ id: number }>(
      `SELECT p.id::int AS id FROM puzzle_pieces p, campaign_state s
       WHERE s.id = 1 AND p.unlock_rank < s.unlocked_pieces
       ORDER BY p.unlock_rank`,
    );
    const existing = await tx.query<BoardPiece>(SELECT_BOARD, [userId]);
    const have = new Set(existing.map((p) => p.id));
    const missing = unlocked.filter((p) => !have.has(p.id));

    if (missing.length > 0) {
      const looseCounts = { tray_left: 0, tray_right: 0 };
      let maxZ = 0;
      for (const piece of existing) {
        if (piece.area !== 'board') looseCounts[piece.area]++;
        maxZ = Math.max(maxZ, piece.z);
      }
      for (const piece of missing) {
        const position = randomTrayPosition(random, looseCounts);
        if (position.area !== 'board') looseCounts[position.area]++;
        maxZ++;
        await tx.query(
          `INSERT INTO board_pieces (user_id, piece_id, area, x, y, z)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, piece_id) DO NOTHING`,
          [userId, piece.id, position.area, position.x, position.y, maxZ],
        );
      }
    }

    const pieces = await tx.query<BoardPiece>(`${SELECT_BOARD} ORDER BY b.z, b.piece_id`, [userId]);
    return {
      pieces,
      complete: await isComplete(tx, userId, totalPieces),
      arrived: pieces.length - existing.length,
      firstVisit: existing.length === 0 && pieces.length > 0,
    };
  });
}

export type MoveResult =
  { status: 'ok'; piece: BoardPiece; complete: boolean } | { status: 'not_found' };

/** Moves one of the user's own pieces. Any piece can always be moved again – nothing locks. */
export function movePiece(
  db: Db,
  userId: number,
  pieceId: number,
  position: ResolvedPosition,
  totalPieces: number,
): Promise<MoveResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.query<{ id: number }>(
      'SELECT piece_id AS id FROM board_pieces WHERE user_id = $1 AND piece_id = $2 FOR UPDATE',
      [userId, pieceId],
    );
    if (!current) return { status: 'not_found' };

    await tx.query(
      `UPDATE board_pieces
       SET area = $3, x = $4, y = $5, placed = $6, is_new = false, updated_at = now(),
           z = (SELECT coalesce(max(z), 0) + 1 FROM board_pieces WHERE user_id = $1)
       WHERE user_id = $1 AND piece_id = $2`,
      [userId, pieceId, position.area, position.x, position.y, position.placed],
    );
    const [piece] = await tx.query<BoardPiece>(`${SELECT_BOARD} AND b.piece_id = $2`, [
      userId,
      pieceId,
    ]);
    if (!piece) return { status: 'not_found' };
    return { status: 'ok', piece, complete: await isComplete(tx, userId, totalPieces) };
  });
}

/** The image file of a collectively unlocked piece, or null if it is locked or unknown. */
export async function findUnlockedPieceImage(db: Db, pieceId: number): Promise<string | null> {
  const [row] = await db.query<{ file: string }>(
    `SELECT p.image_file AS file FROM puzzle_pieces p, campaign_state s
     WHERE s.id = 1 AND p.id = $1 AND p.unlock_rank < s.unlocked_pieces`,
    [pieceId],
  );
  return row?.file ?? null;
}
