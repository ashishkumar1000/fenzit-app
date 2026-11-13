/**
 * useOwnerJobSummary — the owner's mobile dashboard summary (Epic 22 step
 * 7, reports-dashboard.md "Mobile shows a summary for the owner (headline
 * counts and pending)"): the four headline counts and the pending-approval
 * size for the LAST 30 IST DAYS, from `GET /job-reports/owner`. The full
 * dashboard (trends, per-employee table) is the web console's (story 22-8).
 *
 * Local state, not a store: Home is the only reader and it remounts per
 * login, so the logout reset has nothing to clear. The fetch runs when the
 * caller enables it (an established account — a first-run tenant has no
 * employees to create jobs yet) and re-runs on every Home focus through the
 * caller's `refresh`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addIstDays, istTodayDate } from '../../utils/istDate';
import { jobReportService } from '../../services';
import type { OwnerReportSummary } from '../../services';

export interface OwnerJobSummaryState {
  summary: OwnerReportSummary | null;
  isLoading: boolean;
  error: string | null;
  /** Reloads the 30-day window (Home's focus refresh / pull-to-refresh). */
  refresh: () => void;
}

export function useOwnerJobSummary(enabled: boolean): OwnerJobSummaryState {
  const [summary, setSummary] = useState<OwnerReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Bumped per load; a stale response never overwrites a newer one.
  const seqRef = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      // Disabling mid-flight must not leave the spinner up: the seq bump
      // below only discards the response, it never resets the flags.
      setIsLoading(false);
      setError(null);
      return;
    }
    const seq = ++seqRef.current;
    const to = istTodayDate();
    const from = addIstDays(to, -29);
    setIsLoading(true);
    setError(null);
    jobReportService
      .ownerReport({ from, to })
      .then(data => {
        if (seqRef.current === seq) {
          setSummary(data);
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
      seqRef.current = seq + 1;
    };
  }, [enabled, refreshTick]);

  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  return { summary, isLoading, error, refresh };
}
