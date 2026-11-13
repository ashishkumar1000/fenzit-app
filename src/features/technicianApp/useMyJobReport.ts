/**
 * useMyJobReport — the employee's "My jobs" summary numbers (Epic 22 step 3)
 * behind the Profile tab's summary card. Own local state, NOT a store: the
 * card is the only reader, it remounts with the Profile tab, and the logout
 * reset (runAllResets) then has nothing to clear.
 *
 * The window is one of two presets — last 7 / last 30 IST days — both ending
 * today: `to` = istTodayDate(), `from` = `to` − (N−1) via addIstDays, which
 * the BE interprets as IST calendar days exactly like the web console's
 * presets. Switching the preset refetches; a stale response from a switched
 * window never lands (seq guard).
 *
 * `enabled` gates the fetch. Since 2026-11-13 the record lives on the
 * dedicated TechMyJobs screen, mounted always-expanded — the sole caller
 * passes literal `true` — so the gate exists for the next reader that
 * wants a collapsed card (the fetch must not fire while hidden), not for
 * the current UI. A failed refresh keeps the loaded report on screen
 * behind the error banner (MyJobsDetails), matching the jobs screens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addIstDays, istTodayDate } from '../../utils/istDate';
import { jobReportService } from '../../services';
import type { EmployeeReportResponse } from '../../services';

/** The window presets the card offers, in days. */
export type ReportRangeDays = 7 | 30;

export interface MyJobReportState {
  report: EmployeeReportResponse | null;
  rangeDays: ReportRangeDays;
  isLoading: boolean;
  error: string | null;
  setRangeDays: (days: ReportRangeDays) => void;
  /** Reloads the current window (the card's retry). */
  refresh: () => void;
}

export function useMyJobReport(enabled: boolean = true): MyJobReportState {
  const [report, setReport] = useState<EmployeeReportResponse | null>(null);
  const [rangeDays, setRangeDaysState] = useState<ReportRangeDays>(30);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Bumped per load; a response whose seq has been superseded (range switched
  // or refresh issued) is dropped instead of overwriting the newer window.
  const seqRef = useRef(0);
  // Bumped on every refresh() so the range effect re-runs without changing
  // the preset (the range change itself is handled by the same effect).
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    const to = istTodayDate();
    const from = addIstDays(to, -(rangeDays - 1));
    setIsLoading(true);
    setError(null);
    jobReportService
      .employeeReport({ from, to })
      .then(data => {
        if (seqRef.current === seq) {
          setReport(data);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (seqRef.current === seq) {
          setError(err instanceof Error ? err.message : 'Failed to load your job summary.');
          setIsLoading(false);
        }
      });
    return () => {
      // Unmount or supersede: nothing landing after this may write state.
      seqRef.current = seq + 1;
    };
  }, [enabled, rangeDays, refreshTick]);

  const setRangeDays = useCallback((days: ReportRangeDays) => {
    setRangeDaysState(days);
  }, []);

  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  return { report, rangeDays, isLoading, error, setRangeDays, refresh };
}
