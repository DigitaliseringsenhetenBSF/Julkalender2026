import { describe, expect, it } from 'vitest';
import { cutJigsaw } from '../../src/domain/jigsaw.ts';

const WIDTH = 1672;
const HEIGHT = 941;

describe('cutJigsaw', () => {
  const cut = cutJigsaw(WIDTH, HEIGHT, 9, 5, 20261224);

  it('cuts 9 × 5 = 45 row-major pieces', () => {
    expect(cut.pieces).toHaveLength(45);
    expect(cut.pieces[0]).toMatchObject({ id: 1, row: 0, col: 0 });
    expect(cut.pieces[44]).toMatchObject({ id: 45, row: 4, col: 8 });
  });

  it('gives every piece a box of its cell plus room for tabs', () => {
    const piece = cut.pieces[10];
    expect(piece?.box.width).toBeCloseTo(WIDTH / 9 + 2 * cut.pad);
    expect(piece?.box.left).toBeCloseTo((10 % 9) * (WIDTH / 9) - cut.pad);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(cutJigsaw(WIDTH, HEIGHT, 9, 5, 20261224).pieces[20]?.shape).toBe(cut.pieces[20]?.shape);
    expect(cutJigsaw(WIDTH, HEIGHT, 9, 5, 1).pieces[20]?.shape).not.toBe(cut.pieces[20]?.shape);
  });

  it('keeps shapes inside the box (0–1 units) as closed SVG paths', () => {
    for (const piece of cut.pieces) {
      expect(piece.shape.startsWith('M ')).toBe(true);
      expect(piece.shape.endsWith(' Z')).toBe(true);
      const numbers = piece.shape.match(/-?\d+\.\d+/g)?.map(Number) ?? [];
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(1);
    }
  });

  it('cuts border pieces straight along the picture edge', () => {
    const corner = cut.pieces[0];
    // The top-left piece's outline starts at the picture's corner.
    expect(corner?.path.startsWith('M 0.00 0.00')).toBe(true);
    // Every interior edge is a tab on one side and a blank on the other: both pieces share it.
    const right = cut.pieces[0]?.path ?? '';
    const neighbour = cut.pieces[1]?.path ?? '';
    const sharedX = (WIDTH / 9).toFixed(2);
    expect(right.includes(`${sharedX} 0.00`)).toBe(true);
    expect(neighbour.startsWith(`M ${sharedX} 0.00`)).toBe(true);
  });
});
