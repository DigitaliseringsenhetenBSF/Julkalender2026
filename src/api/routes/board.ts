import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveDrop } from '../../domain/board.ts';
import { type BoardPiece, findUnlockedPieceImage, getBoard, movePiece } from '../../data/board.ts';
import { PIECES_DIR } from '../../data/paths.ts';
import {
  type ApiBoardPiece,
  type BoardResponse,
  movePieceRequest,
  pieceIdParams,
} from '../../shared/contract.ts';
import { currentUser } from '../auth/session.ts';
import type { AppContext } from '../context.ts';
import { ApiError, parseInput } from '../errors.ts';

export async function boardRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { puzzle } = ctx.content;
  const grid = { columns: puzzle.columns, rows: puzzle.rows };
  const shapeById = new Map(puzzle.pieces.map((p) => [p.id, p.shape]));
  // Images are cached "forever", so their URL carries a hash of the file: a re-cut puzzle gets
  // new URLs and a browser can never show an old piece in a new shape.
  const imageUrlById = new Map(
    puzzle.pieces.map((p) => {
      const hash = createHash('sha256')
        .update(readFileSync(join(PIECES_DIR, basename(p.file))))
        .digest('hex')
        .slice(0, 12);
      return [p.id, `${ctx.config.basePath}/api/pieces/${p.id}/image?v=${hash}`];
    }),
  );
  // Shapes and image URLs only travel with pieces on the user's board, i.e. already unlocked.
  const withShape = (piece: BoardPiece): ApiBoardPiece => ({
    ...piece,
    shape: shapeById.get(piece.id) ?? '',
    image: imageUrlById.get(piece.id) ?? '',
  });

  // Always the caller's own board: the user id comes from the session, never the request.
  app.get('/api/board', async (request): Promise<BoardResponse> => {
    const user = currentUser(request);
    const board = await getBoard(ctx.db, user.id, ctx.random, ctx.rules.totalPieces);
    return {
      grid,
      imageAspect: puzzle.imageAspect,
      pad: puzzle.pad,
      totalPieces: ctx.rules.totalPieces,
      pieces: board.pieces.map(withShape),
      complete: board.complete,
      arrived: board.arrived,
      firstVisit: board.firstVisit,
    };
  });

  app.put('/api/board/pieces/:id', async (request) => {
    const user = currentUser(request);
    const { id } = parseInput(pieceIdParams, request.params);
    const drop = parseInput(movePieceRequest, request.body);
    // No snapping: the piece stays where it was dropped; the server only records whether it
    // now lies in its place, which decides when the puzzle is complete.
    const resolved = resolveDrop(id, drop, grid, puzzle.correctTolerance);
    const result = await movePiece(ctx.db, user.id, id, resolved, ctx.rules.totalPieces);
    if (result.status === 'not_found') {
      throw new ApiError(404, 'NOT_FOUND', `Piece ${id} is not on your board`);
    }
    return { piece: withShape(result.piece), complete: result.complete };
  });

  // Piece images are only served once collectively unlocked, so the picture stays a surprise.
  app.get('/api/pieces/:id/image', async (request, reply) => {
    const { id } = parseInput(pieceIdParams, request.params);
    const file = await findUnlockedPieceImage(ctx.db, id);
    if (!file) throw new ApiError(404, 'NOT_FOUND', 'Piece not found');
    return reply
      .type('image/webp')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(createReadStream(join(PIECES_DIR, basename(file))));
  });
}
