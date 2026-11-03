import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { correctSlot, slotOrigin } from '../../src/domain/board.ts';
import { loadContent } from '../../src/data/content.ts';
import { seedBase } from '../../src/data/seed.ts';
import { boardResponse, errorResponse, movePieceResponse } from '../../src/shared/contract.ts';
import { body, createUsers, signIn, startTestServer, type TestServer } from './helpers.ts';

const grid = { columns: 6, rows: 4 };

let server: TestServer;
let alice: string;
let bob: string;

beforeEach(async () => {
  server = await startTestServer({ today: '2026-12-10' });
  alice = await signIn(server, 0);
  bob = await signIn(server, 1);
});
afterEach(() => server.close());

/** Unlocks `pieces` pieces through real tick-offs by fresh colleagues. */
async function unlockPieces(pieces: number) {
  const colleagues = await createUsers(server, 15);
  for (let day = 1; day <= pieces; day++) {
    for (const cookie of colleagues) {
      await server.app.inject({
        method: 'POST',
        url: '/api/completions',
        payload: { day },
        headers: { cookie },
      });
    }
  }
}

const getBoard = async (cookie: string) =>
  body(
    boardResponse,
    await server.app.inject({ method: 'GET', url: '/api/board', headers: { cookie } }),
  );

const move = (cookie: string, id: number, payload: object) =>
  server.app.inject({
    method: 'PUT',
    url: `/api/board/pieces/${id}`,
    payload,
    headers: { cookie },
  });

describe('GET /api/board', () => {
  it('is empty before any piece is unlocked', async () => {
    const board = await getBoard(alice);
    expect(board).toMatchObject({ grid, totalPieces: 24, snapTolerance: 0.35, pieces: [] });
  });

  it('gives new pieces stable random tray positions, marked as new', async () => {
    await unlockPieces(2);
    const first = await getBoard(alice);
    expect(first.pieces).toHaveLength(2);
    for (const piece of first.pieces) {
      expect(piece.area).not.toBe('board');
      expect(piece.isNew).toBe(true);
      expect(piece.placed).toBe(false);
      expect(piece.alt.length).toBeGreaterThan(0);
    }
    // Balanced: one per tray.
    expect(new Set(first.pieces.map((p) => p.area)).size).toBe(2);
    expect(first).toMatchObject({ arrived: 2, firstVisit: true });
    // Reload: nothing jumps, and nothing counts as newly arrived again.
    const second = await getBoard(alice);
    expect(second.pieces).toEqual(first.pieces);
    expect(second).toMatchObject({ arrived: 0, firstVisit: false });
  });

  it('reports pieces unlocked since the last visit', async () => {
    await unlockPieces(1); // 15 completions → 1 piece
    await getBoard(alice);
    await unlockPieces(1); // 15 more → 2 pieces
    expect(await getBoard(alice)).toMatchObject({ arrived: 1, firstVisit: false });
  });

  it('unlocks pieces in the same shared order for everyone', async () => {
    await unlockPieces(3);
    const ids = (cookie: string) =>
      getBoard(cookie).then((b) => b.pieces.map((p) => p.id).sort((a, b) => a - b));
    expect(await ids(alice)).toEqual(await ids(bob));
  });
});

describe('PUT /api/board/pieces/:id', () => {
  it('snaps a piece dropped near its slot and then locks it', async () => {
    await unlockPieces(1);
    const [piece] = (await getBoard(alice)).pieces;
    if (!piece) throw new Error('expected a piece');
    const origin = slotOrigin(correctSlot(piece.id, grid), grid);

    const response = await move(alice, piece.id, {
      area: 'board',
      x: origin.x + 0.02,
      y: origin.y - 0.03,
    });
    expect(response.statusCode).toBe(200);
    expect(body(movePieceResponse, response).piece).toMatchObject({
      area: 'board',
      x: origin.x,
      y: origin.y,
      placed: true,
      isNew: false,
    });

    const locked = await move(alice, piece.id, { area: 'tray_left', x: 0.5, y: 0.5 });
    expect(locked.statusCode).toBe(409);
    expect(body(errorResponse, locked).error.code).toBe('PIECE_LOCKED');
  });

  it('leaves a piece where it was dropped when it is not near its slot', async () => {
    await unlockPieces(1);
    const [piece] = (await getBoard(alice)).pieces;
    if (!piece) throw new Error('expected a piece');
    const origin = slotOrigin(correctSlot(piece.id, grid), grid);
    const far = { x: origin.x < 0.5 ? 0.8 : 0.0, y: origin.y < 0.5 ? 0.7 : 0.0 };

    const moved = body(movePieceResponse, await move(alice, piece.id, { area: 'board', ...far }));
    expect(moved.piece.placed).toBe(false);
    expect(moved.piece.x).toBeCloseTo(Math.min(far.x, 5 / 6));

    // Stored per user: reload shows the same spot.
    const reloaded = (await getBoard(alice)).pieces.find((p) => p.id === piece.id);
    expect(reloaded).toMatchObject({ area: 'board', placed: false });
  });

  it('keeps boards separate between users', async () => {
    await unlockPieces(1);
    const [alicePiece] = (await getBoard(alice)).pieces;
    const [bobBefore] = (await getBoard(bob)).pieces;
    if (!alicePiece || !bobBefore) throw new Error('expected pieces');

    await move(alice, alicePiece.id, { area: 'board', x: 0.1, y: 0.1 });
    const [bobAfter] = (await getBoard(bob)).pieces;
    expect(bobAfter).toEqual(bobBefore);
  });

  it('rejects moving a piece that is not unlocked', async () => {
    await unlockPieces(1);
    const board = await getBoard(alice);
    const lockedId = [...Array(24).keys()]
      .map((i) => i + 1)
      .find((id) => id !== board.pieces[0]?.id);
    const response = await move(alice, lockedId ?? 1, { area: 'board', x: 0, y: 0 });
    expect(response.statusCode).toBe(404);
  });

  it('validates the body', async () => {
    const response = await move(alice, 1, { area: 'floor', x: 0, y: 0 });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/pieces/:id/image', () => {
  it('serves only collectively unlocked pieces', async () => {
    const locked = await server.app.inject({
      method: 'GET',
      url: '/api/pieces/1/image',
      headers: { cookie: alice },
    });
    expect(locked.statusCode).toBe(404);

    await unlockPieces(1);
    const [piece] = (await getBoard(alice)).pieces;
    const image = await server.app.inject({
      method: 'GET',
      url: `/api/pieces/${piece?.id}/image`,
      headers: { cookie: alice },
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.rawPayload.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('seeding', () => {
  it('is idempotent and freezes the unlock order once pieces are unlocked', async () => {
    const content = loadContent();
    await seedBase(server.ctx.db, content, { includeDevUsers: true });
    const [missions] = await server.ctx.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM missions',
    );
    expect(missions?.n).toBe(24);

    await unlockPieces(1);
    const changedSeed = { ...content, puzzle: { ...content.puzzle, unlockSeed: 999 } };
    await expect(seedBase(server.ctx.db, changedSeed, { includeDevUsers: true })).rejects.toThrow(
      /frozen/,
    );
    // The original content still seeds fine.
    await expect(
      seedBase(server.ctx.db, content, { includeDevUsers: true }),
    ).resolves.toBeUndefined();
  });
});
