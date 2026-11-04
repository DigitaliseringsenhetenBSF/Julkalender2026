/**
 * Classic jigsaw piece outlines (tabs and blanks) for a columns × rows cut of an image.
 * Pure geometry: used by scripts/cut-puzzle.ts to cut the piece images and to produce the
 * clip paths the UI uses for hit-testing. Deterministic for a given seed.
 */
import { mulberry32 } from './unlockOrder.ts';

export interface Point {
  x: number;
  y: number;
}

type Segment = { kind: 'L'; to: Point } | { kind: 'C'; c1: Point; c2: Point; to: Point };

interface Edge {
  start: Point;
  segments: Segment[];
}

export interface JigsawCut {
  cellWidth: number;
  cellHeight: number;
  /** Margin around each cell (in image px) that the piece box needs for its tabs. */
  pad: number;
  pieces: JigsawPiece[];
}

export interface JigsawPiece {
  /** 1-based, row-major. */
  id: number;
  row: number;
  col: number;
  /** The piece's bounding box in image px (cell plus pad on every side). */
  box: { left: number; top: number; width: number; height: number };
  /** SVG path of the outline in image px. */
  path: string;
  /** The same outline in 0–1 units of `box` (for clipPathUnits="objectBoundingBox"). */
  shape: string;
}

/** How far a tab reaches beyond the cell edge, as a share of the edge length (incl. jitter). */
const TAB_REACH = 0.3;

/**
 * Template for one edge from (0,0) to (1,0): t runs along the edge, u is the bump height.
 * A neck, a round head and back – the classic "mushroom" tab.
 */
function tabTemplate(shift: number, lift: number): Array<[number, number][]> {
  const t = (v: number) => v + shift;
  return [
    [[t(0.35), 0]],
    [
      [t(0.4), 0],
      [t(0.43), 0.06],
      [t(0.39), 0.12],
    ],
    [
      [t(0.34), 0.2 + lift],
      [t(0.4), 0.27 + lift],
      [t(0.5), 0.27 + lift],
    ],
    [
      [t(0.6), 0.27 + lift],
      [t(0.66), 0.2 + lift],
      [t(0.61), 0.12],
    ],
    [
      [t(0.57), 0.06],
      [t(0.6), 0],
      [t(0.65), 0],
    ],
    [[1, 0]],
  ];
}

function makeEdge(start: Point, end: Point, direction: 1 | -1, random: () => number): Edge {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  // Normal pointing to the "positive" side: down for horizontal edges, right for vertical ones.
  const normal = { x: -along.y, y: along.x };
  const shift = (random() - 0.5) * 0.08;
  const lift = (random() - 0.5) * 0.04;
  const map = ([t, u]: [number, number]): Point => ({
    x: start.x + along.x * t * length + normal.x * u * direction * length,
    y: start.y + along.y * t * length + normal.y * u * direction * length,
  });
  const segments = tabTemplate(shift, lift).map((points): Segment => {
    if (points.length === 1) return { kind: 'L', to: map(points[0] as [number, number]) };
    const [c1, c2, to] = points as [[number, number], [number, number], [number, number]];
    return { kind: 'C', c1: map(c1), c2: map(c2), to: map(to) };
  });
  return { start, segments };
}

function straightEdge(start: Point, end: Point): Edge {
  return { start, segments: [{ kind: 'L', to: end }] };
}

/** The same curve traversed from its end back to its start. */
function reverse(edge: Edge): Edge {
  const points = [edge.start, ...edge.segments.map((s) => s.to)];
  const segments: Segment[] = [];
  for (let i = edge.segments.length - 1; i >= 0; i--) {
    const segment = edge.segments[i] as Segment;
    const to = points[i] as Point;
    segments.push(
      segment.kind === 'L' ? { kind: 'L', to } : { kind: 'C', c1: segment.c2, c2: segment.c1, to },
    );
  }
  return { start: points[points.length - 1] as Point, segments };
}

function pathString(edges: Edge[], transform: (p: Point) => Point, decimals: number): string {
  const f = (p: Point) => {
    const q = transform(p);
    return `${q.x.toFixed(decimals)} ${q.y.toFixed(decimals)}`;
  };
  const first = edges[0] as Edge;
  const parts = [`M ${f(first.start)}`];
  for (const edge of edges) {
    for (const s of edge.segments) {
      parts.push(s.kind === 'L' ? `L ${f(s.to)}` : `C ${f(s.c1)} ${f(s.c2)} ${f(s.to)}`);
    }
  }
  return `${parts.join(' ')} Z`;
}

/**
 * Cuts an image of `width` × `height` px into `columns` × `rows` jigsaw pieces. Every interior
 * edge gets a tab on one side and the matching blank on the other; border edges are straight.
 */
export function cutJigsaw(
  width: number,
  height: number,
  columns: number,
  rows: number,
  seed: number,
): JigsawCut {
  const random = mulberry32(seed);
  const cw = width / columns;
  const ch = height / rows;
  const pad = Math.ceil(TAB_REACH * Math.max(cw, ch));
  const at = (col: number, row: number): Point => ({ x: col * cw, y: row * ch });
  const direction = (): 1 | -1 => (random() < 0.5 ? 1 : -1);

  // horizontal[r][c]: the edge below row r-1 / above row r (r = 1 … rows-1), left → right.
  const horizontal: Edge[][] = [];
  for (let r = 1; r < rows; r++) {
    horizontal[r] = [];
    for (let c = 0; c < columns; c++) {
      (horizontal[r] as Edge[])[c] = makeEdge(at(c, r), at(c + 1, r), direction(), random);
    }
  }
  // vertical[c][r]: the edge right of column c-1 / left of column c (c = 1 … columns-1), top → bottom.
  const vertical: Edge[][] = [];
  for (let c = 1; c < columns; c++) {
    vertical[c] = [];
    for (let r = 0; r < rows; r++) {
      (vertical[c] as Edge[])[r] = makeEdge(at(c, r), at(c, r + 1), direction(), random);
    }
  }

  const pieces: JigsawPiece[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const top = row === 0 ? straightEdge(at(col, row), at(col + 1, row)) : horizontal[row]![col]!;
      const right =
        col === columns - 1
          ? straightEdge(at(col + 1, row), at(col + 1, row + 1))
          : vertical[col + 1]![row]!;
      const bottom =
        row === rows - 1
          ? straightEdge(at(col + 1, row + 1), at(col, row + 1))
          : reverse(horizontal[row + 1]![col]!);
      const left =
        col === 0 ? straightEdge(at(col, row + 1), at(col, row)) : reverse(vertical[col]![row]!);
      const edges = [top, right, bottom, left];
      const box = {
        left: col * cw - pad,
        top: row * ch - pad,
        width: cw + 2 * pad,
        height: ch + 2 * pad,
      };
      pieces.push({
        id: row * columns + col + 1,
        row,
        col,
        box,
        path: pathString(edges, (p) => p, 2),
        shape: pathString(
          edges,
          (p) => ({ x: (p.x - box.left) / box.width, y: (p.y - box.top) / box.height }),
          4,
        ),
      });
    }
  }
  return { cellWidth: cw, cellHeight: ch, pad, pieces };
}
