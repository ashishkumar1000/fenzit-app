/**
 * useMyPayslips.ts — the payslips list screen's data hook (story 23-12).
 *
 * Local state, not the module-level shared-store pattern: the only
 * consumer is one screen pushed over the technician tabs, and the state
 * dying on unmount is what keeps a logout from leaving payslips in
 * memory (the reports store needs `registerReset` because it sits behind
 * a tab that survives role flips — this screen cannot).
 *
 * Focus-load with the house 15s TTL throttle (`FOCUS_REFRESH_TTL_MS`),
 * force paths for pull-to-refresh, a seq-latch so a slow focus response
 * can never clobber a fresher one, and FE-owned transport copy.
 */
import { useCallback, useRef, useState } from 'react';
import { payslipsService } from '../../services';
import type { PayslipView } from '../../services';
import type { ApiError } from '../../services/api/apiError';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export const PAYSLIPS_LOAD_ERROR =
  "Couldn't load your payslips. Check your connection and try again.";

export interface MyPayslipsState {
  payslips: PayslipView[];
  /** True while the FIRST load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** True while a pull-to-refresh is in flight. */
  isRefreshing: boolean;
  /** Human-readable failure from the list GET, safe to render. */
  error: string | null;
}

export function useMyPayslips() {
  const [state, setState] = useState<MyPayslipsState>({
    payslips: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
  });
  const seq = useRef(0);
  const lastLoadedAt = useRef<number | null>(null);
  const inFlight = useRef(false);

  const load = useCallback((options?: { force?: boolean }) => {
    const force = options?.force === true;
    if (inFlight.current) return;
    if (
      !force &&
      lastLoadedAt.current != null &&
      Date.now() - lastLoadedAt.current < FOCUS_REFRESH_TTL_MS
    ) {
      return;
    }
    inFlight.current = true;
    const requestSeq = ++seq.current;
    setState(prev => ({
      ...prev,
      isLoading: prev.payslips.length === 0,
      isRefreshing: !force || prev.payslips.length > 0,
      error: null,
    }));
    payslipsService
      .listMyPayslips()
      .then(payslips => {
        if (requestSeq !== seq.current) return; // stale
        lastLoadedAt.current = Date.now();
        setState({ payslips, isLoading: false, isRefreshing: false, error: null });
      })
      .catch((err: ApiError) => {
        if (requestSeq !== seq.current) return; // stale
        const message =
          err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT'
            ? PAYSLIPS_LOAD_ERROR
            : err.message || PAYSLIPS_LOAD_ERROR;
        setState(prev => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: message,
        }));
      })
      .finally(() => {
        if (requestSeq === seq.current) inFlight.current = false;
      });
  }, []);

  const refresh = useCallback(() => load({ force: true }), [load]);

  return { ...state, load, refresh };
}
