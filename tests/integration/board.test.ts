import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { correctSlot, slotOrigin } from '../../src/domain/board.ts';
import { loadContent } from '../../src/data/content.ts';
import { seedBase } from '../../src/data/seed.ts';
import { boardResponse, movePieceResponse } from '../../src/shared/contract.ts';
import { body, createUsers, signIn, startTestServer, type TestServer } from './helpers.ts';

const grid = { columns: 9, rows: 5 };
const TOTAL_PIECES = 45;

let server: TestServer;
let alice: string;
let bob: string;

beforeEach(async () => {
  server = await startTestServer({ today: '2026-12-10' });
  alice = await signIn(server, 0);
  bob = await signIn(server, 1);
});
afterEach(() => server.close());

/** Unlocks `pieces` more pieces through real tick-offs by fresh colleagues. */
async function unlockPieces(pieces: number) {
  // One colleague per completion needed, each ticking off luckor 1…pieces.
  const colleagues = await createUsers(server, server.ctx.rules.completionsPerPiece);
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
    expect(board).toMatchObject({ grid, totalPieces: TOTAL_PIECES, pieces: [], complete: false });
    expect(board.imageAspect).toBeCloseTo(1672 / 941);
    expect(board.pad.x).toBeGreaterThan(0.25);
  });

  it('gives new pieces stable random tray positions, marked as new', async () => {
    await unlockPieces(2);
    const first = await getBoard(alice);
    expect(first.pieces).toHaveLength(2);
    for (const piece of first.pieces) {
      expect(piece.area).not.toBe('board');
      expect(piece.isNew).toBe(true);
      expect(piece.alt.length).toBeGreaterThan(0);
      expect(piece.shape).toMatch(/^M .* Z$/);
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
    await unlockPieces(1); // one threshold's worth of completions → 1 piece
    await getBoard(alice);
    await unlockPieces(1); // another → 2 pieces
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
  it('never snaps: a piece dropped next to its slot stays exactly there and can move again', async () => {
    await unlockPieces(1);
    const [piece] = (await getBoard(alice)).pieces;
    if (!piece) throw new Error('expected a piece');
    const origin = slotOrigin(correctSlot(piece.id, grid), grid);
    // Nudge towards the middle so the board edge never clamps the position.
    const nudge = (v: number) => (v > 0.5 ? v - 0.01 : v + 0.01);
    const near = { area: 'board', x: nudge(origin.x), y: nudge(origin.y) };

    const response = await move(alice, piece.id, near);
    expect(response.statusCode).toBe(200);
    const moved = body(movePieceResponse, response);
    expect(moved.piece).toMatchObject({ area: 'board', isNew: false });
    expect(moved.piece.x).toBeCloseTo(near.x);
    expect(moved.piece.y).toBeCloseTo(near.y);
    // One piece in place is not the whole picture.
    expect(moved.complete).toBe(false);

    // Nothing locks: it can be picked up again.
    const again = await move(alice, piece.id, { area: 'tray_left', x: 0.5, y: 0.5 });
    expect(again.statusCode).toBe(200);
  });

  it('reports the puzzle complete when every piece lies in its place', async () => {
    // Unlock the whole picture directly (45 pieces) and lay it.
    await server.ctx.db.query('UPDATE campaign_state SET unlocked_pieces = $1', [TOTAL_PIECES]);
    const { pieces } = await getBoard(alice);
    expect(pieces).toHaveLength(TOTAL_PIECES);
    let last;
    for (const piece of pieces) {
      const origin = slotOrigin(correctSlot(piece.id, grid), grid);
      last = body(movePieceResponse, await move(alice, piece.id, { area: 'board', ...origin }));
    }
    expect(last?.complete).toBe(true);
    expect((await getBoard(alice)).complete).toBe(true);
    expect((await getBoard(bob)).complete).toBe(false);
  });

  it('leaves a piece where it was dropped when it is not near its slot', async () => {
    await unlockPieces(1);
    const [piece] = (await getBoard(alice)).pieces;
    if (!piece) throw new Error('expected a piece');
    const origin = slotOrigin(correctSlot(piece.id, grid), grid);
    const far = { x: origin.x < 0.5 ? 0.8 : 0.0, y: origin.y < 0.5 ? 0.7 : 0.0 };

    const moved = body(movePieceResponse, await move(alice, piece.id, { area: 'board', ...far }));
    expect(moved.piece.x).toBeCloseTo(Math.min(far.x, 8 / 9));

    // Stored per user: reload shows the same spot.
    const reloaded = (await getBoard(alice)).pieces.find((p) => p.id === piece.id);
    expect(reloaded).toMatchObject({ area: 'board' });
    expect(reloaded?.x).toBeCloseTo(moved.piece.x);
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
    const lockedId = [...Array(TOTAL_PIECES).keys()]
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
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.rawPayload.subarray(8, 12).toString()).toBe('WEBP');
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
