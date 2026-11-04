import type { BoardArea, PiecePosition } from '../../domain/board.ts';

/**
 * Converts between stored, screen-independent piece positions (SPEC §5.5) and pixels inside
 * the puzzle container.
 *
 * - Each piece is drawn as a box: its cell plus `pad` on every side, room for the jigsaw tabs.
 * - On the board a stored (x, y) is the cell's top-left, so the box starts `pad` further up-left.
 * - Trays are canonically tall. On narrow screens they are drawn as wide bands, and x/y are
 *   swapped so the "huller om buller" arrangement is preserved.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PuzzleLayout {
  areas: Record<BoardArea, Rect>;
  /** Screen pixels around each cell that belong to the piece box (for the tabs). */
  pad: { x: number; y: number };
  /** The piece box on screen: cell + 2 × pad. */
  box: { width: number; height: number };
}

const isWide = (rect: Rect) => rect.width > rect.height;

/** Free range a box's top-left can move in along one axis of a tray. */
const freeRange = (length: number, boxLength: number) => Math.max(0, length - boxLength);

/** Top-left of the piece box on screen. */
export function toPixels(
  position: PiecePosition,
  layout: PuzzleLayout,
): { left: number; top: number } {
  const rect = layout.areas[position.area];
  if (position.area === 'board') {
    return {
      left: rect.left + position.x * rect.width - layout.pad.x,
      top: rect.top + position.y * rect.height - layout.pad.y,
    };
  }
  const [along, across] = isWide(rect) ? [position.y, position.x] : [position.x, position.y];
  return {
    left: rect.left + along * freeRange(rect.width, layout.box.width),
    top: rect.top + across * freeRange(rect.height, layout.box.height),
  };
}

function distanceToRect(x: number, y: number, rect: Rect): number {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/** The area under the box's centre (or the nearest one), as a normalised position. */
export function fromPixels(left: number, top: number, layout: PuzzleLayout): PiecePosition {
  const cx = left + layout.box.width / 2;
  const cy = top + layout.box.height / 2;
  const entries = Object.entries(layout.areas) as [BoardArea, Rect][];
  const [area, rect] = entries.reduce((best, entry) =>
    distanceToRect(cx, cy, entry[1]) < distanceToRect(cx, cy, best[1]) ? entry : best,
  );

  if (area === 'board') {
    return {
      area,
      x: (left + layout.pad.x - rect.left) / rect.width,
      y: (top + layout.pad.y - rect.top) / rect.height,
    };
  }
  const ratio = (offset: number, length: number, boxLength: number) => {
    const range = freeRange(length, boxLength);
    return range === 0 ? 0 : offset / range;
  };
  const along = ratio(left - rect.left, rect.width, layout.box.width);
  const across = ratio(top - rect.top, rect.height, layout.box.height);
  return isWide(rect) ? { area, x: across, y: along } : { area, x: along, y: across };
}
