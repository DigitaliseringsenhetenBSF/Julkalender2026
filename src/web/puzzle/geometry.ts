import type { BoardArea, PiecePosition } from '../../domain/board.ts';

/**
 * Converts between stored, screen-independent piece positions (SPEC §5.5) and pixels inside
 * the puzzle container. Trays are canonically tall; on narrow screens they are drawn as wide
 * bands, and x/y are swapped so the "huller om buller" arrangement is preserved.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PuzzleLayout {
  areas: Record<BoardArea, Rect>;
  pieceSize: number;
}

const isWide = (rect: Rect) => rect.width > rect.height;

/** Free range a piece's top-left can move in along one axis of a tray. */
const freeRange = (length: number, pieceSize: number) => Math.max(0, length - pieceSize);

export function toPixels(
  position: PiecePosition,
  layout: PuzzleLayout,
): { left: number; top: number } {
  const rect = layout.areas[position.area];
  if (position.area === 'board') {
    return { left: rect.left + position.x * rect.width, top: rect.top + position.y * rect.height };
  }
  const size = layout.pieceSize;
  const [along, across] = isWide(rect) ? [position.y, position.x] : [position.x, position.y];
  return {
    left: rect.left + along * freeRange(rect.width, size),
    top: rect.top + across * freeRange(rect.height, size),
  };
}

function distanceToRect(x: number, y: number, rect: Rect): number {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/** The area under the piece's centre (or the nearest one), as a normalised position. */
export function fromPixels(left: number, top: number, layout: PuzzleLayout): PiecePosition {
  const size = layout.pieceSize;
  const cx = left + size / 2;
  const cy = top + size / 2;
  const entries = Object.entries(layout.areas) as [BoardArea, Rect][];
  const [area, rect] = entries.reduce((best, entry) =>
    distanceToRect(cx, cy, entry[1]) < distanceToRect(cx, cy, best[1]) ? entry : best,
  );

  if (area === 'board') {
    return { area, x: (left - rect.left) / rect.width, y: (top - rect.top) / rect.height };
  }
  const ratio = (offset: number, length: number) => {
    const range = freeRange(length, size);
    return range === 0 ? 0 : offset / range;
  };
  const along = ratio(left - rect.left, rect.width);
  const across = ratio(top - rect.top, rect.height);
  return isWide(rect) ? { area, x: across, y: along } : { area, x: along, y: across };
}
