import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiBoardPiece, MovePieceRequest } from '../../shared/contract.ts';
import { ApiCallError, api } from '../api.ts';

export type SaveStatus = 'idle' | 'saving' | 'retrying';

const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Saves piece moves to the server, resilient to network hiccups:
 * - at most one request in flight per piece; a newer move replaces a queued one (latest wins),
 *   so out-of-order responses can never move a piece back;
 * - transient failures retry with exponential backoff (1 s, 2 s, 4 s … 30 s);
 * - 404/409 mean the server's state differs (e.g. the piece is not on the board) → `onConflict`
 *   so the board is reloaded from the server.
 */
export function usePieceSaver(handlers: {
  onSaved: (piece: ApiBoardPiece, complete: boolean) => void;
  onConflict: () => void;
  onSessionLost: () => void;
}) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const queued = useRef(new Map<number, MovePieceRequest>());
  const inFlight = useRef(new Set<number>());
  const attempts = useRef(new Map<number, number>());
  const retryTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [status, setStatus] = useState<SaveStatus>('idle');

  const refreshStatus = useCallback(() => {
    if (retryTimers.current.size > 0) setStatus('retrying');
    else if (inFlight.current.size > 0 || queued.current.size > 0) setStatus('saving');
    else setStatus('idle');
  }, []);

  const flush = useCallback(
    async (id: number): Promise<void> => {
      if (inFlight.current.has(id) || retryTimers.current.has(id)) return;
      const body = queued.current.get(id);
      if (!body) return;
      queued.current.delete(id);
      inFlight.current.add(id);
      refreshStatus();
      try {
        const { piece, complete } = await api.movePiece(id, body);
        attempts.current.delete(id);
        // Only apply the server's answer if no newer move is waiting.
        if (!queued.current.has(id)) handlersRef.current.onSaved(piece, complete);
      } catch (error) {
        if (error instanceof ApiCallError && (error.status === 404 || error.status === 409)) {
          attempts.current.delete(id);
          handlersRef.current.onConflict();
        } else if (error instanceof ApiCallError && error.status === 401) {
          handlersRef.current.onSessionLost();
        } else {
          if (!queued.current.has(id)) queued.current.set(id, body);
          const attempt = (attempts.current.get(id) ?? 0) + 1;
          attempts.current.set(id, attempt);
          const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** (attempt - 1));
          retryTimers.current.set(
            id,
            setTimeout(() => {
              retryTimers.current.delete(id);
              void flush(id);
            }, delay),
          );
        }
      } finally {
        inFlight.current.delete(id);
        if (queued.current.has(id) && !retryTimers.current.has(id)) void flush(id);
        refreshStatus();
      }
    },
    [refreshStatus],
  );

  const save = useCallback(
    (id: number, body: MovePieceRequest) => {
      queued.current.set(id, body);
      void flush(id);
    },
    [flush],
  );

  const hasPending = useCallback(
    (id: number) => queued.current.has(id) || inFlight.current.has(id),
    [],
  );

  // Warn before leaving the page while a move is still unsaved.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (queued.current.size > 0 || inFlight.current.size > 0) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const timers = retryTimers.current;
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      timers.forEach(clearTimeout);
    };
  }, []);

  return { save, hasPending, status };
}
