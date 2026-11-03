import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiMission,
  ApiProgress,
  CalendarResponse,
  CompletionResponse,
} from '../shared/contract.ts';
import { ApiCallError, api } from './api.ts';

/** How often the shared counter is refreshed while the tab is visible. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Calendar + collective progress, refreshed on focus and every minute while visible so
 * colleagues' tick-offs (and new pieces) show up without a reload.
 */
export function useCampaign(onSessionLost: () => void) {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const calendarRef = useRef(calendar);
  useEffect(() => {
    calendarRef.current = calendar;
  });
  const [progress, setProgress] = useState<ApiProgress | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // While a tick-off is in flight, a background refresh must not overwrite the optimistic UI.
  const mutations = useRef(0);
  const sessionLost = useRef(onSessionLost);
  useEffect(() => {
    sessionLost.current = onSessionLost;
  });

  const load = useCallback(async () => {
    try {
      const [nextCalendar, nextProgress] = await Promise.all([api.calendar(), api.progress()]);
      if (mutations.current > 0) return;
      setCalendar(nextCalendar);
      setProgress(nextProgress);
      setLoadFailed(false);
    } catch (error) {
      if (error instanceof ApiCallError && error.status === 401) sessionLost.current();
      else setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  const updateMission = useCallback((day: number, change: Partial<ApiMission>) => {
    setCalendar(
      (prev) =>
        prev && {
          ...prev,
          missions: prev.missions.map((m) => (m.day === day ? { ...m, ...change } : m)),
        },
    );
  }, []);

  const setCompletion = useCallback(
    async (day: number, completed: boolean): Promise<CompletionResponse> => {
      const before = calendarRef.current?.missions.find((m) => m.day === day);
      mutations.current++;
      // Optimistic: tick the box and adjust "how many have done it" by one.
      updateMission(day, {
        completed,
        opened: true,
        completions: Math.max(0, (before?.completions ?? 0) + (completed ? 1 : -1)),
      });
      try {
        const result = completed ? await api.tick(day) : await api.untick(day);
        setProgress(result.progress);
        // The server's per-lucka counts include colleagues' tick-offs since the last refresh.
        setCalendar(
          (prev) =>
            prev && {
              ...prev,
              missions: prev.missions.map((m) => {
                const fresh = result.progress.perDay.find((d) => d.day === m.day);
                return fresh ? { ...m, completions: fresh.completions } : m;
              }),
            },
        );
        return result;
      } catch (error) {
        if (before) updateMission(day, before);
        if (error instanceof ApiCallError && error.status === 401) sessionLost.current();
        throw error;
      } finally {
        mutations.current--;
      }
    },
    [updateMission],
  );

  /** Opens ("vänder") a lucka; it stays open for good. */
  const openLucka = useCallback(
    async (day: number): Promise<void> => {
      mutations.current++;
      updateMission(day, { opened: true });
      try {
        await api.openLucka(day);
      } catch (error) {
        updateMission(day, { opened: false });
        if (error instanceof ApiCallError && error.status === 401) sessionLost.current();
        throw error;
      } finally {
        mutations.current--;
      }
    },
    [updateMission],
  );

  return { calendar, progress, loadFailed, reload: load, setCompletion, openLucka };
}
