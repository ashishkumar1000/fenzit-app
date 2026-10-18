/**
 * useTodayPulse — loads the Home "Today's Pulse" card's numbers: one
 * `GET /attendance/dashboard` per screen focus, and ONLY while the tenant's
 * attendance module is enabled (a disabled tenant, or a technician's 403,
 * never makes the call or never shows the card).
 *
 * Postures: first load → `loading` (the card shimmers); success → `ready`;
 * a failure with nothing on screen → `error` (Home falls back to the plain
 * Attendance tile, so the entry point never disappears); a refetch failure
 * keeps the last-good numbers. Latest-wins: a slow stale answer never
 * overwrites a newer one.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard } from '../../services';
import type { AttendanceDashboardData } from '../../services';

export type TodayPulse =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; date: string; counts: AttendanceDashboardData['counts'] };

export function useTodayPulse(enabled: boolean): TodayPulse {
  const [pulse, setPulse] = useState<TodayPulse>({ status: 'loading' });
  const seqRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const seq = ++seqRef.current;
      if (!enabled) {
        // Turned off (or another tenant): drop the old numbers and any answer still in flight.
        setPulse({ status: 'loading' });
        return;
      }
      void (async () => {
        try {
          const data = await fetchDashboard();
          if (seq !== seqRef.current) return;
          setPulse({ status: 'ready', date: data.date, counts: data.counts });
        } catch {
          if (seq !== seqRef.current) return;
          setPulse(prev => (prev.status === 'ready' ? prev : { status: 'error' }));
        }
      })();
    }, [enabled]),
  );

  return pulse;
}
