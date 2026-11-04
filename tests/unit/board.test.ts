import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  correctSlot,
  nearestSlot,
  randomTrayPosition,
  resolveDrop,
  slotOrigin,
} from '../../src/domain/board.ts';

const grid = { columns: 6, rows: 4 };

describe('correctSlot', () => {
  it('maps ids row-major onto the 6×4 grid', () => {
    expect(correctSlot(1, grid)).toEqual({ row: 0, col: 0 });
    expect(correctSlot(6, grid)).toEqual({ row: 0, col: 5 });
    expect(correctSlot(7, grid)).toEqual({ row: 1, col: 0 });
    expect(correctSlot(24, grid)).toEqual({ row: 3, col: 5 });
  });

  it('gives slot origins as board fractions', () => {
    expect(slotOrigin({ row: 1, col: 3 }, grid)).toEqual({ x: 0.5, y: 0.25 });
  });
});

describe('resolveDrop – no snapping', () => {
  // Piece 9 belongs at row 1, col 2 → origin (2/6, 1/4).
  const origin = { x: 2 / 6, y: 1 / 4 };
  const pieceWidth = 1 / 6;
  const pieceHeight = 1 / 4;
  const TOLERANCE = 0.2;

  it('leaves a piece exactly where it was dropped, even right next to its slot', () => {
    const drop = {
      area: 'board' as const,
      x: origin.x + 0.1 * pieceWidth,
      y: origin.y - 0.1 * pieceHeight,
    };
    const result = resolveDrop(9, drop, grid, TOLERANCE);
    expect(result).toEqual({ ...drop, placed: true });
  });

  it('records "placed" only within the tolerance', () => {
    const near = resolveDrop(
      9,
      { area: 'board', x: origin.x + 0.15 * pieceWidth, y: origin.y },
      grid,
      TOLERANCE,
    );
    const far = resolveDrop(
      9,
      { area: 'board', x: origin.x + 0.3 * pieceWidth, y: origin.y },
      grid,
      TOLERANCE,
    );
    expect(near.placed).toBe(true);
    expect(far.placed).toBe(false);
    expect(far.x).toBeCloseTo(origin.x + 0.3 * pieceWidth);
  });

  it('is not placed on another piece’s slot', () => {
    const result = resolveDrop(9, { area: 'board', x: 0, y: 0 }, grid, TOLERANCE);
    expect(result).toEqual({ area: 'board', x: 0, y: 0, placed: false });
  });

  it('is never placed in a tray, even at matching coordinates', () => {
    const result = resolveDrop(9, { area: 'tray_left', ...origin }, grid, TOLERANCE);
    expect(result.placed).toBe(false);
  });
});

describe('clampPosition', () => {
  it('keeps the whole piece on the board', () => {
    expect(clampPosition({ area: 'board', x: 0.99, y: -0.2 }, grid)).toEqual({
      area: 'board',
      x: 5 / 6,
      y: 0,
    });
  });

  it('clamps tray coordinates to [0, 1]', () => {
    expect(clampPosition({ area: 'tray_right', x: 1.4, y: -1 }, grid)).toEqual({
      area: 'tray_right',
      x: 1,
      y: 0,
    });
  });
});

describe('nearestSlot', () => {
  it('rounds to the closest slot and stays inside the grid', () => {
    expect(nearestSlot(0.49, 0.26, grid)).toEqual({ row: 1, col: 3 });
    expect(nearestSlot(0.99, 0.99, grid)).toEqual({ row: 3, col: 5 });
  });
});

describe('randomTrayPosition', () => {
  const fixed = (value: number) => () => value;

  it('chooses the tray with fewer loose pieces', () => {
    expect(randomTrayPosition(fixed(0.9), { tray_left: 1, tray_right: 3 }).area).toBe('tray_left');
    expect(randomTrayPosition(fixed(0.1), { tray_left: 4, tray_right: 2 }).area).toBe('tray_right');
  });

  it('breaks ties at random and stays inside the tray', () => {
    const left = randomTrayPosition(fixed(0.2), { tray_left: 0, tray_right: 0 });
    const right = randomTrayPosition(fixed(0.7), { tray_left: 0, tray_right: 0 });
    expect(left).toEqual({ area: 'tray_left', x: 0.2, y: 0.2 });
    expect(right.area).toBe('tray_right');
  });
});
