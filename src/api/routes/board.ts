import { createReadStream } from 'node:fs';
import { basename, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveDrop } from '../../domain/board.ts';
import { findUnlockedPieceImage, getBoard, movePiece } from '../../data/board.ts';
import { PIECES_DIR } from '../../data/paths.ts';
import { type BoardResponse, movePieceRequest, pieceIdParams } from '../../shared/contract.ts';
import { currentUser } from '../auth/session.ts';
import type { AppContext } from '../context.ts';
import { ApiError, parseInput } from '../errors.ts';

export async function boardRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const grid = { columns: ctx.content.puzzle.columns, rows: ctx.content.puzzle.rows };
  const tolerance = ctx.content.puzzle.snapTolerance;

  // Always the caller's own board: the user id comes from the session, never the request.
  app.get('/api/board', async (request): Promise<BoardResponse> => {
    const user = currentUser(request);
    return {
      grid,
      snapTolerance: tolerance,
      totalPieces: ctx.rules.totalPieces,
      pieces: await getBoard(ctx.db, user.id, ctx.random),
    };
  });

  app.put('/api/board/pieces/:id', async (request) => {
    const user = currentUser(request);
    const { id } = parseInput(pieceIdParams, request.params);
    const drop = parseInput(movePieceRequest, request.body);
    // The server is authoritative for snapping; the client runs the same rule for feedback.
    const resolved = resolveDrop(id, drop, grid, tolerance);
    const result = await movePiece(ctx.db, user.id, id, resolved);
    if (result.status === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', `Piece ${id} is not on your board`);
    }
    if (result.status === 'locked') {
      throw new ApiError(409, 'PIECE_LOCKED', `Piece ${id} is already in place`);
    }
    return { piece: result.piece };
  });

  // Piece images are only served once collectively unlocked, so the picture stays a surprise.
  app.get('/api/pieces/:id/image', async (request, reply) => {
    const { id } = parseInput(pieceIdParams, request.params);
    const file = await findUnlockedPieceImage(ctx.db, id);
    if (!file) throw new ApiError(404, 'NOT_FOUND', 'Piece not found');
    return reply
      .type('image/png')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(createReadStream(join(PIECES_DIR, basename(file))));
  });
}
