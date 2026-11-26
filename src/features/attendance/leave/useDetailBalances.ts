/**
 * useDetailBalances — the opened request's balances for the
 * LeaveDetailSheet's slot (moved verbatim from OwnerLeaveScreen during the
 * two-tab rewrite; the SHEET never calls the API itself — its own
 * docblock contract, 23-14). Sequence-guarded so a stale answer can never
 * land for a newer open. `refreshKey` re-runs the fetch for the SAME
 * employee after an in-place write (the revoke success morph swaps the
 * refreshed view in without changing `employeeId` — found on device:
 * the sheet kept the pre-write figure).
 */
import { useEffect, useRef, useState } from 'react';
import { attendanceLeaveService } from '../../../services';
import type { LeaveBalanceView } from '../../../services/resources/attendanceLeave';

export function useDetailBalances(employeeId: string | null, refreshKey = 0) {
  const seq = useRef(0);
  const mounted = useRef(true);
  const lastEmployee = useRef<string | null>(null);
  const [balances, setBalances] = useState<LeaveBalanceView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (employeeId == null) {
      lastEmployee.current = null;
      setBalances([]);
      setError(null);
      setLoading(false);
      return;
    }
    // A DIFFERENT employee's sheet: the previous figures must never render
    // under the new name — clear before the fetch (a failed fetch for the
    // new employee used to leave the old employee's rows beside the new
    // title — the review, 2026-11-26). The refreshKey bump keeps its rows
    // visible: the same employee's post-write refetch updates in place.
    if (lastEmployee.current !== employeeId) {
      lastEmployee.current = employeeId;
      setBalances([]);
    }
    const requestSeq = ++seq.current;
    setLoading(true);
    setError(null);
    attendanceLeaveService
      .getEmployeeBalances(employeeId)
      .then(rows => {
        if (!mounted.current || requestSeq !== seq.current) return;
        setBalances(rows);
        setError(null);
      })
      .catch(() => {
        if (!mounted.current || requestSeq !== seq.current) return;
        // Includes the 404 for a since-removed employee — a quiet
        // notice, never a blocking failure of the decision surface.
        setError("Couldn't load balances.");
      })
      .finally(() => {
        if (requestSeq === seq.current) setLoading(false);
      });
  }, [employeeId, refreshKey]);

  return { balances, loading, error };
}
