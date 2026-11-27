/**
 * useTeammatesOff — the "Also off on these days" glance under a leave
 * request's dates (Epic 24, story 24-5). Reads the shipped subtree list
 * (`GET /attendance/leave?status=approved&from&to` — rows OVERLAPPING the
 * span) and keeps the people who are not the requester and not the caller.
 *
 * The failure line is deliberately different from the empty line: "nobody
 * else is off" is a fact, and a failed read is not that fact.
 */
import { useEffect, useRef, useState } from 'react';
import { attendanceLeaveService } from '../../services';
import { teammatesOffLine } from './teamModel';

export const TEAMMATES_OFF_ERROR = "Couldn't check who else is off.";

export function useTeammatesOff(input: {
  /** The request being viewed (null closes the read). */
  request: { employeeId: string; startDate: string; endDate: string } | null;
  /** The caller's own id — the reader is never "also off". */
  myId: string | null;
  /** The sheet is visible: no invisible background reads. */
  enabled: boolean;
}) {
  const { request, myId, enabled } = input;
  // Primitive deps, never the caller's object literal: a fresh `request`
  // each render would restart the read on every render (the line would be
  // reset to null before it could ever paint).
  const employeeId = request?.employeeId ?? null;
  const startDate = request?.startDate ?? null;
  const endDate = request?.endDate ?? null;
  const [line, setLine] = useState<string | null>(null);
  const seq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || employeeId == null || startDate == null || endDate == null) {
      seq.current += 1;
      setLine(null);
      return;
    }
    const order = ++seq.current;
    setLine(null); // absent until the answer lands — no spinner in the strip
    attendanceLeaveService
      .listOwnerLeave({
        status: 'approved',
        from: startDate,
        to: endDate,
        limit: 50,
      })
      .then(res => {
        if (!mounted.current || order !== seq.current) return;
        const seen = new Set<string>();
        const names: string[] = [];
        for (const row of res.data) {
          if (row.employeeId === employeeId) continue;
          if (myId != null && row.employeeId === myId) continue;
          if (seen.has(row.employeeId)) continue;
          seen.add(row.employeeId);
          const name = (row.employeeName ?? '').trim();
          if (name !== '') names.push(name);
        }
        setLine(teammatesOffLine(names));
      })
      .catch(() => {
        if (!mounted.current || order !== seq.current) return;
        setLine(TEAMMATES_OFF_ERROR);
      });
  }, [enabled, employeeId, startDate, endDate, myId]);

  return { line };
}
