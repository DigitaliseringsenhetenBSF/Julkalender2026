import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiProgress, CalendarResponse, CompletionResponse } from '../shared/contract.ts';
import { ApiCallError, api } from './api.ts';

/** How often the shared counter is refreshed while the tab is visible. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Calendar + collective progress, refreshed on focus and every minute while visible so
 * colleagues' tick-offs (and new pieces) show up without a reload.
 */
export function useCampaign(onSessionLost: () => void) {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
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

  const setCompletion = useCallback(
    async (day: number, completed: boolean): Promise<CompletionResponse> => {
      const mark = (value: boolean) =>
        setCalendar(
          (prev) =>
            prev && {
              ...prev,
              missions: prev.missions.map((m) => (m.day === day ? { ...m, completed: value } : m)),
            },
        );
      mutations.current++;
      mark(completed);
      try {
        const result = completed ? await api.tick(day) : await api.untick(day);
        setProgress(result.progress);
        return result;
      } catch (error) {
        mark(!completed);
        if (error instanceof ApiCallError && error.status === 401) sessionLost.current();
        throw error;
      } finally {
        mutations.current--;
      }
    },
    [],
  );

  return { calendar, progress, loadFailed, reload: load, setCompletion };
}
