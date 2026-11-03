import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type Grid,
  type PiecePosition,
  type Slot,
  correctSlot,
  nearestSlot,
  resolveDrop,
  slotOrigin,
} from '../../domain/board.ts';
import type { ApiBoardPiece } from '../../shared/contract.ts';
import { ApiCallError, api } from '../api.ts';
import { sv } from '../texts.sv.ts';
import { type PuzzleLayout, type Rect, fromPixels, toPixels } from './geometry.ts';
import { usePieceSaver } from './usePieceSaver.ts';

interface PuzzleProps {
  unlockedPieces: number;
  completionsPerPiece: number;
  /** Pieces the user's own tick-offs unlocked and already celebrated (not announced twice). */
  claimedUnlocks: RefObject<number>;
  announce: (message: string) => void;
  toast: (message: string) => void;
  onSessionLost: () => void;
}

interface BoardMeta {
  grid: Grid;
  tolerance: number;
  totalPieces: number;
}

interface DragState {
  id: number;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/** Movement below this is a click/tap (select), not a drag. */
const DRAG_THRESHOLD_PX = 4;
const SNAP_HIGHLIGHT_MS = 800;
const AREA_ORDER = { tray_left: 0, tray_right: 1, board: 2 } as const;

const slotKey = (slot: Slot) => `${slot.row}:${slot.col}`;

export function Puzzle(props: PuzzleProps) {
  const { unlockedPieces, completionsPerPiece } = props;
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const [meta, setMeta] = useState<BoardMeta | null>(null);
  const [pieces, setPieces] = useState<ApiBoardPiece[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [layout, setLayout] = useState<PuzzleLayout | null>(null);
  const [drag, setDrag] = useState<{ id: number; left: number; top: number } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>({ row: 0, col: 0 });
  const [snappedId, setSnappedId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const trayLeftRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRightRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pieceButtons = useRef(new Map<number, HTMLButtonElement>());
  const slotButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;
  const knownIds = useRef<Set<number> | null>(null);
  const loading = useRef(false);

  const saver = usePieceSaver({
    onSaved: (piece) => setPieces((prev) => prev.map((p) => (p.id === piece.id ? piece : p))),
    onConflict: () => void loadBoard(),
    onSessionLost: () => propsRef.current.onSessionLost(),
  });
  const saverRef = useRef(saver);
  saverRef.current = saver;

  // --- Loading -----------------------------------------------------------------------------

  const loadBoard = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const response = await api.board();
      setMeta({
        grid: response.grid,
        tolerance: response.snapTolerance,
        totalPieces: response.totalPieces,
      });
      // Keep local positions for pieces with an unsaved move; the server wins otherwise.
      setPieces((prev) => {
        const local = new Map(prev.map((p) => [p.id, p]));
        return response.pieces.map((p) =>
          saverRef.current.hasPending(p.id) ? (local.get(p.id) ?? p) : p,
        );
      });

      const ids = new Set(response.pieces.map((p) => p.id));
      const { announce, toast, claimedUnlocks } = propsRef.current;
      let message: string | null = null;
      if (knownIds.current === null) {
        // First load in this page view: the server tells us what arrived since the last visit.
        if (response.firstVisit) message = sv.puzzle.firstVisit(response.pieces.length);
        else if (response.arrived > 0) message = sv.puzzle.newSinceLastVisit(response.arrived);
      } else {
        const known = knownIds.current;
        const added = [...ids].filter((id) => !known.has(id)).length;
        const unclaimed = added - claimedUnlocks.current;
        claimedUnlocks.current = Math.max(0, claimedUnlocks.current - added);
        if (unclaimed > 0) message = sv.puzzle.newPieces(unclaimed);
      }
      if (message) {
        announce(message);
        toast(message);
      }
      knownIds.current = ids;
      setLoadFailed(false);
    } catch (error) {
      if (error instanceof ApiCallError && error.status === 401) propsRef.current.onSessionLost();
      setLoadFailed(true);
    } finally {
      loading.current = false;
    }
  }, []);

  // Initial load, and again whenever colleagues (or I) unlock more pieces.
  useEffect(() => {
    if (knownIds.current === null || unlockedPieces > knownIds.current.size) void loadBoard();
  }, [unlockedPieces, loadBoard]);

  // --- Layout ------------------------------------------------------------------------------

  const measure = useCallback(() => {
    const container = containerRef.current;
    const left = trayLeftRef.current;
    const board = boardRef.current;
    const right = trayRightRef.current;
    if (!container || !left || !board || !right || !meta) return;
    const c = container.getBoundingClientRect();
    const rel = (el: HTMLElement): Rect => {
      const r = el.getBoundingClientRect();
      return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
    };
    const boardRect = rel(board);
    setLayout({
      areas: { tray_left: rel(left), board: boardRect, tray_right: rel(right) },
      pieceSize: boardRect.width / meta.grid.columns,
    });
  }, [meta]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  // Move focus after React has rendered the target element.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current();
    pendingFocus.current = null;
    target?.focus();
  });

  // --- Placement ---------------------------------------------------------------------------

  const placedAt = useCallback(
    (slot: Slot) => {
      if (!meta) return false;
      return piecesRef.current.some((p) => {
        if (!p.placed) return false;
        const s = correctSlot(p.id, meta.grid);
        return s.row === slot.row && s.col === slot.col;
      });
    },
    [meta],
  );

  function placePiece(id: number, position: PiecePosition) {
    const piece = piecesRef.current.find((p) => p.id === id);
    if (!piece || !meta) return null;
    // Same rule as the server, for instant feedback; the server's answer is authoritative.
    const resolved = resolveDrop(id, position, meta.grid, meta.tolerance);
    const topZ = Math.max(0, ...piecesRef.current.map((p) => p.z)) + 1;
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...resolved, isNew: false, z: topZ } : p)),
    );
    saver.save(id, { area: resolved.area, x: resolved.x, y: resolved.y });
    if (resolved.placed) {
      props.announce(sv.puzzle.snapped(piece.alt));
      setSnappedId(id);
      setTimeout(
        () => setSnappedId((current) => (current === id ? null : current)),
        SNAP_HIGHLIGHT_MS,
      );
    }
    return resolved;
  }

  function loosePiecesInTabOrder(): ApiBoardPiece[] {
    return piecesRef.current
      .filter((p) => !p.placed)
      .sort((a, b) => AREA_ORDER[a.area] - AREA_ORDER[b.area] || a.y - b.y || a.x - b.x);
  }

  function focusAfterPlacing(placedId: number) {
    const next = loosePiecesInTabOrder().find((p) => p.id !== placedId);
    pendingFocus.current = () => (next ? pieceButtons.current.get(next.id) : headingRef.current);
  }

  // --- Drag (mouse, touch, pen) ------------------------------------------------------------

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, piece: ApiBoardPiece) {
    if (!layout || piece.placed || event.button !== 0 || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const position = toPixels(piece, layout);
    dragState.current = {
      id: piece.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - c.left - position.left,
      offsetY: event.clientY - c.top - position.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragPosition(event: PointerEvent, state: DragState) {
    const c = containerRef.current?.getBoundingClientRect();
    return {
      left: event.clientX - (c?.left ?? 0) - state.offsetX,
      top: event.clientY - (c?.top ?? 0) - state.offsetY,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (!state.moved && distance < DRAG_THRESHOLD_PX) return;
    if (!state.moved && selectedId !== null) setSelectedId(null);
    state.moved = true;
    setDrag({ id: state.id, ...dragPosition(event, state) });
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (!state.moved || !layout) return;
    // The click that follows a drag must not select the piece.
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const { left, top } = dragPosition(event, state);
    setDrag(null);
    placePiece(state.id, fromPixels(left, top, layout));
  }

  function onPointerCancel() {
    dragState.current = null;
    setDrag(null);
  }

  // --- Select + choose slot (keyboard, click, tap) -----------------------------------------

  function cancelSelection(returnFocusTo: number | null) {
    setSelectedId(null);
    props.announce(sv.puzzle.cancelled);
    if (returnFocusTo !== null) {
      pendingFocus.current = () => pieceButtons.current.get(returnFocusTo);
    }
  }

  function firstOpenSlot(): Slot {
    if (!meta) return { row: 0, col: 0 };
    for (let row = 0; row < meta.grid.rows; row++) {
      for (let col = 0; col < meta.grid.columns; col++) {
        if (!placedAt({ row, col })) return { row, col };
      }
    }
    return { row: 0, col: 0 };
  }

  function onPieceClick(piece: ApiBoardPiece) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!meta) return;
    if (selectedId === piece.id) {
      cancelSelection(piece.id);
      return;
    }
    const start =
      piece.area === 'board' ? nearestSlot(piece.x, piece.y, meta.grid) : firstOpenSlot();
    setSelectedId(piece.id);
    setActiveSlot(start);
    props.announce(sv.puzzle.picked(piece.alt));
    pendingFocus.current = () => slotButtons.current.get(slotKey(start));
  }

  function onPieceKeyDown(event: KeyboardEvent<HTMLButtonElement>, piece: ApiBoardPiece) {
    if (event.key === 'Escape' && selectedId === piece.id) {
      event.preventDefault();
      cancelSelection(piece.id);
    }
  }

  function onSlotActivate(slot: Slot) {
    if (selectedId === null || !meta) return;
    if (placedAt(slot)) {
      props.announce(sv.puzzle.slotTaken);
      return;
    }
    const id = selectedId;
    const result = placePiece(id, { area: 'board', ...slotOrigin(slot, meta.grid) });
    if (result?.placed) {
      setSelectedId(null);
      focusAfterPlacing(id);
    } else {
      // Keep the piece selected so the next slot can be tried right away.
      props.announce(sv.puzzle.notHere);
    }
  }

  function onSlotKeyDown(event: KeyboardEvent<HTMLButtonElement>, slot: Slot) {
    if (!meta) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const next = {
        row: Math.min(meta.grid.rows - 1, Math.max(0, slot.row + move[0])),
        col: Math.min(meta.grid.columns - 1, Math.max(0, slot.col + move[1])),
      };
      setActiveSlot(next);
      slotButtons.current.get(slotKey(next))?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelSelection(selectedId);
    }
  }

  // --- Render ------------------------------------------------------------------------------

  if (loadFailed && !meta) {
    return (
      <section className="card puzzle" aria-labelledby="puzzle-heading">
        <h2 id="puzzle-heading">{sv.puzzle.heading}</h2>
        <p role="alert">{sv.loadError}</p>
        <button type="button" className="button button--secondary" onClick={() => void loadBoard()}>
          {sv.retry}
        </button>
      </section>
    );
  }
  if (!meta)
    return <section className="card puzzle" aria-busy="true" aria-label={sv.puzzle.heading} />;

  const placedCount = pieces.filter((p) => p.placed).length;
  const complete = placedCount === meta.totalPieces;
  const allPlacedSoFar = pieces.length > 0 && placedCount === pieces.length && !complete;
  const selected = pieces.find((p) => p.id === selectedId) ?? null;
  const slots: Slot[] = [];
  for (let row = 0; row < meta.grid.rows; row++) {
    for (let col = 0; col < meta.grid.columns; col++) slots.push({ row, col });
  }

  const saveText =
    saver.status === 'saving'
      ? sv.puzzle.saving
      : saver.status === 'retrying'
        ? sv.puzzle.saveRetrying
        : '';

  return (
    <section className="card puzzle" aria-labelledby="puzzle-heading">
      <div className="section-head">
        <h2 id="puzzle-heading" ref={headingRef} tabIndex={-1}>
          {sv.puzzle.heading}
        </h2>
        <span className="pill">{sv.puzzle.placedCount(placedCount, meta.totalPieces)}</span>
      </div>
      <p className="lead">{sv.puzzle.lead}</p>
      <p className="hint" id="puzzle-keyboard-help">
        {sv.puzzle.keyboardHelp}
      </p>

      {complete && <p className="banner banner--success">{sv.puzzle.complete}</p>}
      {allPlacedSoFar && <p className="banner">{sv.puzzle.allPlacedSoFar}</p>}
      {pieces.length === 0 && <p className="banner">{sv.puzzle.empty(completionsPerPiece)}</p>}

      <div
        ref={containerRef}
        className={`puzzle-area${selected ? ' puzzle-area--selecting' : ''}`}
        style={{ '--columns': meta.grid.columns, '--rows': meta.grid.rows } as CSSProperties}
      >
        <div ref={trayLeftRef} className="tray" role="group" aria-label={sv.puzzle.trayLeft} />
        <div
          ref={boardRef}
          className="board"
          role="group"
          aria-label={sv.puzzle.board(placedCount, meta.totalPieces)}
        >
          {slots.map((slot) => {
            const key = slotKey(slot);
            const filled = placedAt(slot);
            if (!selected) return <div key={key} className="slot" aria-hidden="true" />;
            const isActive = slot.row === activeSlot.row && slot.col === activeSlot.col;
            return (
              <button
                key={key}
                ref={(el) => {
                  if (el) slotButtons.current.set(key, el);
                  else slotButtons.current.delete(key);
                }}
                type="button"
                className={`slot slot--target${isActive ? ' slot--active' : ''}`}
                tabIndex={isActive ? 0 : -1}
                aria-label={
                  sv.puzzle.slotLabel(slot.row + 1, slot.col + 1) +
                  (filled ? `, ${sv.puzzle.slotFilled}` : '')
                }
                onFocus={() => setActiveSlot(slot)}
                onClick={() => onSlotActivate(slot)}
                onKeyDown={(event) => onSlotKeyDown(event, slot)}
              />
            );
          })}
        </div>
        <div ref={trayRightRef} className="tray" role="group" aria-label={sv.puzzle.trayRight} />

        {layout && (
          <div className="pieces-layer">
            {pieces.map((piece) => {
              const dragging = drag?.id === piece.id;
              const position = dragging ? drag : toPixels(piece, layout);
              const style: CSSProperties = {
                width: layout.pieceSize,
                height: layout.pieceSize,
                transform: `translate(${position.left}px, ${position.top}px)`,
                zIndex: dragging ? 10_000 : piece.z,
              };
              const image = <img src={api.pieceImageUrl(piece.id)} alt="" draggable={false} />;
              if (piece.placed) {
                return (
                  <div
                    key={piece.id}
                    className={`piece piece--placed${snappedId === piece.id ? ' piece--snapped' : ''}`}
                    style={style}
                    aria-hidden="true"
                  >
                    {image}
                  </div>
                );
              }
              const classes = [
                'piece',
                dragging && 'piece--dragging',
                selectedId === piece.id && 'piece--selected',
                piece.isNew && 'piece--new',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={piece.id}
                  ref={(el) => {
                    if (el) pieceButtons.current.set(piece.id, el);
                    else pieceButtons.current.delete(piece.id);
                  }}
                  type="button"
                  className={classes}
                  style={style}
                  aria-label={sv.puzzle.pieceLabel(
                    piece.alt,
                    sv.puzzle.where[piece.area],
                    piece.isNew,
                  )}
                  aria-pressed={selectedId === piece.id}
                  aria-describedby="puzzle-keyboard-help"
                  data-piece-id={piece.id}
                  onPointerDown={(event) => onPointerDown(event, piece)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onClick={() => onPieceClick(piece)}
                  onKeyDown={(event) => onPieceKeyDown(event, piece)}
                >
                  {image}
                  {piece.isNew && (
                    <span className="piece__badge" aria-hidden="true">
                      {sv.puzzle.newBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="save-status" role="status">
        {saveText}
      </p>
    </section>
  );
}
