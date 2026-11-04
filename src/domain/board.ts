/**
 * Puzzle board geometry: correct slots, the "in its place" check, clamping and initial tray
 * placement. There is deliberately no snapping (SPEC §5.5).
 * See docs/SPEC.md §5.5.
 *
 * Coordinate model (independent of screen size):
 * - board: (x, y) is the piece's top-left corner as a fraction of the board's width/height,
 *   so a slot (row, col) starts at (col / columns, row / rows).
 * - trays: (x, y) is a fraction of the tray's *free range* (tray size minus piece size), so
 *   every value in [0, 1] keeps the whole piece inside the tray.
 */

export type BoardArea = 'tray_left' | 'tray_right' | 'board';

export interface Grid {
  columns: number;
  rows: number;
}

export interface Slot {
  row: number;
  col: number;
}

export interface PiecePosition {
  area: BoardArea;
  x: number;
  y: number;
}

export interface ResolvedPosition extends PiecePosition {
  placed: boolean;
}

/** Piece ids are 1-based and row-major: piece n belongs at row ⌊(n-1)/columns⌋. */
export function correctSlot(pieceId: number, grid: Grid): Slot {
  const index = pieceId - 1;
  return { row: Math.floor(index / grid.columns), col: index % grid.columns };
}

export function slotOrigin(slot: Slot, grid: Grid): { x: number; y: number } {
  return { x: slot.col / grid.columns, y: slot.row / grid.rows };
}

/** The slot whose origin is nearest to a board position. */
export function nearestSlot(x: number, y: number, grid: Grid): Slot {
  return {
    col: clamp(Math.round(x * grid.columns), 0, grid.columns - 1),
    row: clamp(Math.round(y * grid.rows), 0, grid.rows - 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keep a position inside its area (board: the whole piece stays on the board). */
export function clampPosition(position: PiecePosition, grid: Grid): PiecePosition {
  if (position.area === 'board') {
    return {
      area: 'board',
      x: clamp(position.x, 0, 1 - 1 / grid.columns),
      y: clamp(position.y, 0, 1 - 1 / grid.rows),
    };
  }
  return { area: position.area, x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1) };
}

/**
 * A piece counts as correctly placed when its cell origin lies within `tolerance` cell widths
 * (horizontally) and cell heights (vertically) of its slot. Measured in cell units so the rule
 * is the same on every screen size. There is no snapping: this only decides completion.
 */
export function isCorrectlyPlaced(
  pieceId: number,
  x: number,
  y: number,
  grid: Grid,
  tolerance: number,
): boolean {
  const origin = slotOrigin(correctSlot(pieceId, grid), grid);
  const dxInPieces = Math.abs(x - origin.x) * grid.columns;
  const dyInPieces = Math.abs(y - origin.y) * grid.rows;
  return dxInPieces <= tolerance && dyInPieces <= tolerance;
}

/**
 * Where a dropped piece ends up: exactly where it was dropped (kept inside its area). The
 * puzzle gives no help – nothing snaps or locks (decided 2026-11-04). `placed` records whether
 * it now lies close enough to its slot, which only decides when the puzzle is complete.
 */
export function resolveDrop(
  pieceId: number,
  drop: PiecePosition,
  grid: Grid,
  tolerance: number,
): ResolvedPosition {
  const clamped = clampPosition(drop, grid);
  const placed =
    clamped.area === 'board' && isCorrectlyPlaced(pieceId, clamped.x, clamped.y, grid, tolerance);
  return { ...clamped, placed };
}

/**
 * Initial "huller om buller" position for a newly unlocked piece: the tray with fewer loose
 * pieces (ties broken at random), at a random spot inside it.
 */
export function randomTrayPosition(
  random: () => number,
  looseCounts: { tray_left: number; tray_right: number },
): PiecePosition {
  let area: BoardArea;
  if (looseCounts.tray_left === looseCounts.tray_right) {
    area = random() < 0.5 ? 'tray_left' : 'tray_right';
  } else {
    area = looseCounts.tray_left < looseCounts.tray_right ? 'tray_left' : 'tray_right';
  }
  return { area, x: random(), y: random() };
}
