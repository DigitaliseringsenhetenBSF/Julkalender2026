import { describe, expect, it } from 'vitest';
import {
  nextHighWaterMark,
  remainingToNextPiece,
  unlockedPieceCount,
} from '../../src/domain/pieces.ts';
import { shuffledUnlockOrder } from '../../src/domain/unlockOrder.ts';

const PER_PIECE = 15;
const TOTAL_PIECES = 24;

describe('unlockedPieceCount', () => {
  it.each([
    [0, 0],
    [14, 0],
    [15, 1],
    [29, 1],
    [30, 2],
    [45, 3],
    [359, 23],
    [360, 24],
    [1000, 24],
  ])('%i completions → %i pieces', (total, pieces) => {
    expect(unlockedPieceCount(total, PER_PIECE, TOTAL_PIECES)).toBe(pieces);
  });

  it('rejects a non-positive threshold', () => {
    expect(() => unlockedPieceCount(10, 0, TOTAL_PIECES)).toThrow(RangeError);
  });
});

describe('nextHighWaterMark', () => {
  it('rises with the total', () => {
    expect(nextHighWaterMark(1, 30, PER_PIECE, TOTAL_PIECES)).toBe(2);
  });

  it('never decreases when completions are un-ticked', () => {
    expect(nextHighWaterMark(2, 29, PER_PIECE, TOTAL_PIECES)).toBe(2);
    expect(nextHighWaterMark(2, 0, PER_PIECE, TOTAL_PIECES)).toBe(2);
  });
});

describe('remainingToNextPiece', () => {
  it('counts down to the next multiple', () => {
    expect(remainingToNextPiece(0, 0, PER_PIECE, TOTAL_PIECES)).toBe(15);
    expect(remainingToNextPiece(137, 9, PER_PIECE, TOTAL_PIECES)).toBe(13);
    expect(remainingToNextPiece(150, 10, PER_PIECE, TOTAL_PIECES)).toBe(15);
  });

  it('is relative to the high-water mark after un-ticks', () => {
    // 2 pieces were unlocked at 30, then two completions were un-ticked.
    expect(remainingToNextPiece(28, 2, PER_PIECE, TOTAL_PIECES)).toBe(17);
  });

  it('is 0 once the puzzle is complete', () => {
    expect(remainingToNextPiece(360, 24, PER_PIECE, TOTAL_PIECES)).toBe(0);
    expect(remainingToNextPiece(500, 24, PER_PIECE, TOTAL_PIECES)).toBe(0);
  });
});

describe('shuffledUnlockOrder', () => {
  const ids = Array.from({ length: TOTAL_PIECES }, (_, i) => i + 1);

  it('is deterministic for a seed', () => {
    expect(shuffledUnlockOrder(ids, 20261201)).toEqual(shuffledUnlockOrder(ids, 20261201));
  });

  it('is a permutation of all piece ids', () => {
    const order = shuffledUnlockOrder(ids, 20261201);
    expect([...order].sort((a, b) => a - b)).toEqual(ids);
    expect(order).not.toEqual(ids);
  });

  it('differs between seeds', () => {
    expect(shuffledUnlockOrder(ids, 1)).not.toEqual(shuffledUnlockOrder(ids, 2));
  });

  it('does not mutate its input', () => {
    const copy = [...ids];
    shuffledUnlockOrder(ids, 7);
    expect(ids).toEqual(copy);
  });
});
