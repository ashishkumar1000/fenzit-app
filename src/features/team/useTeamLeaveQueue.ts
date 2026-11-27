/**
 * useTeamLeaveQueue — the manager's Leave segment (Epic 24, story 24-5).
 * Reads the shipped owner list scoped to the caller's subtree
 * (`GET /attendance/leave?status=pending`, 20 a page), filters the caller's
 * own row out (the server scope is self + subtree), and owns the inline
 * decision writes.
 *
 * Posture (the EXPERIENCE.md states matrix): a failed first page shows an
 * error + Retry; a failed refresh keeps the rows and surfaces an inline
 * error; a failed load-more keeps the loaded rows and offers a retry line.
 * A 409 is not a failure the user caused — it becomes the shipped "already
 * handled" notice and a first-page refetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { attendanceLeaveService } from '../../services';
import type { ApiError, LeaveRequestRow } from '../../services';
import { classifyLeaveWriteFailure } from '../attendance/leave/ownerLeaveModel';
import { withoutOwnRows } from './teamModel';

const PAGE_SIZE = 20;

export const LEAVE_QUEUE_ERROR = "Couldn't load leave requests.";
export const LEAVE_QUEUE_LOAD_MORE_ERROR = "Couldn't load more requests.";
export const ALREADY_HANDLED_NOTICE = 'This request was already handled';

export type TeamLeaveWriteResult =
  | { ok: true }
  | { ok: false; kind: 'handled'; message: string }
  | { ok: false; kind: 'error'; message: string };

export function useTeamLeaveQueue(input: { myId: string | null; enabled: boolean }) {
  const { myId, enabled } = input;
  const [items, setItems] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cursor = useRef<string | null>(null);
  const hasMore = useRef(false);
  const seq = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadFirst = useCallback(
    async (mode: 'first' | 'refresh' = 'first'): Promise<boolean> => {
      const request = ++seq.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      setLoadMoreError(false);
      try {
        const res = await attendanceLeaveService.listOwnerLeave({
          status: 'pending',
          limit: PAGE_SIZE,
        });
        if (!mounted.current || request !== seq.current) return false;
        setItems(withoutOwnRows(res.data, myId));
        cursor.current = res.nextCursor;
        hasMore.current = res.hasMore;
        return true;
      } catch {
        if (!mounted.current || request !== seq.current) return false;
        // A failed refresh keeps the rows: the banner explains why they may
        // be stale; only the first load has nothing to keep.
        setError(LEAVE_QUEUE_ERROR);
        return false;
      } finally {
        if (mounted.current && request === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [myId],
  );

  useEffect(() => {
    if (!enabled) return;
    void loadFirst();
  }, [enabled, loadFirst]);

  const retry = useCallback(() => {
    void loadFirst();
  }, [loadFirst]);

  const onRefresh = useCallback(() => {
    if (loading || refreshing) return;
    setRefreshing(true);
    void loadFirst('refresh').then(ok => {
      // The list itself announces through the spinner; a SUCCESSFUL refresh
      // gets the same quiet confirmation the owner's queue gives. A failed
      // one must not be announced as an update (its banner says otherwise).
      if (ok && mounted.current) AccessibilityInfo.announceForAccessibility('Leave requests updated');
    });
  }, [loading, refreshing, loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore.current || cursor.current == null) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    const request = seq.current;
    try {
      const res = await attendanceLeaveService.listOwnerLeave({
        status: 'pending',
        cursor: cursor.current,
        limit: PAGE_SIZE,
      });
      if (!mounted.current || request !== seq.current) return;
      const page = withoutOwnRows(res.data, myId);
      setItems(prev => {
        const seen = new Set(prev.map(row => row.id));
        return [...prev, ...page.filter(row => !seen.has(row.id))];
      });
      cursor.current = res.nextCursor;
      hasMore.current = res.hasMore;
    } catch {
      if (!mounted.current || request !== seq.current) return;
      setLoadMoreError(true);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, myId]);

  /**
   * One decision write. Approve is input-less; a decline may carry a reason.
   * The server re-checks permission and state on every call — this function
   * only reflects the answer.
   */
  const decide = useCallback(
    async (
      row: LeaveRequestRow,
      action: 'approve' | 'reject',
      reason?: string,
    ): Promise<TeamLeaveWriteResult> => {
      if (busy.current) {
        return { ok: false, kind: 'error', message: 'A decision is already in progress.' };
      }
      busy.current = true;
      setBusyId(row.id);
      setActionError(null);
      setNotice(null);
      try {
        const view =
          action === 'approve'
            ? await attendanceLeaveService.approveLeave(row.id)
            : await attendanceLeaveService.rejectLeave(
                row.id,
                reason && reason.trim() !== '' ? reason.trim() : undefined,
              );
        if (mounted.current) {
          setItems(prev => prev.filter(item => item.id !== view.id));
          AccessibilityInfo.announceForAccessibility(
            action === 'approve' ? 'Leave approved' : 'Leave rejected',
          );
        }
        return { ok: true };
      } catch (caught) {
        const failure = classifyLeaveWriteFailure(caught as ApiError, action);
        if (failure.kind === 'already-handled') {
          if (mounted.current) {
            setItems(prev => prev.filter(item => item.id !== row.id));
            setNotice(ALREADY_HANDLED_NOTICE);
          }
          // The true state is the server's: a split decision can leave the
          // request pending, so the first page is re-read rather than guessed.
          void loadFirst('refresh');
          return { ok: false, kind: 'handled', message: ALREADY_HANDLED_NOTICE };
        }
        if (mounted.current) setActionError(failure.message);
        return { ok: false, kind: 'error', message: failure.message };
      } finally {
        busy.current = false;
        if (mounted.current) setBusyId(null);
      }
    },
    [loadFirst],
  );

  return {
    items,
    loading: loading && items.length === 0,
    error,
    refreshing,
    loadingMore,
    loadMoreError,
    notice,
    actionError,
    busyId,
    clearNotice: useCallback(() => setNotice(null), []),
    clearActionError: useCallback(() => setActionError(null), []),
    retry,
    onRefresh,
    loadMore,
    decide,
  };
}
