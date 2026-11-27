/**
 * useTeamJobQueue — the manager's Jobs segment (Epic 24, story 24-5). Reads
 * the shipped pending-approval list narrowed to the caller's branch
 * (`GET /jobs?scope=all&status=pending_approval&teamOnly=true`). `teamOnly`
 * is what keeps a viewer's company-wide read grant from leaking the whole
 * tenant; an empty team answers an empty page.
 *
 * Same posture as the leave queue: first-load error + Retry, refresh keeps
 * the rows, load-more failure keeps them with a retry line, and a
 * `JOB_NOT_PENDING` 409 becomes the shipped "already handled" notice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { jobService } from '../../services';
import type { ApiError, ApiJob } from '../../services';

const PAGE_SIZE = 20;

export const JOB_QUEUE_ERROR = "Couldn't load job requests.";
export const JOB_QUEUE_LOAD_MORE_ERROR = "Couldn't load more jobs.";
export const JOB_ALREADY_HANDLED_NOTICE = 'This job was already handled';

export type TeamJobWriteResult =
  | { ok: true }
  | { ok: false; kind: 'handled'; message: string }
  | { ok: false; kind: 'error'; message: string };

export function useTeamJobQueue(input: { enabled: boolean }) {
  const { enabled } = input;
  const [items, setItems] = useState<ApiJob[]>([]);
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

  const loadFirst = useCallback(async (mode: 'first' | 'refresh' = 'first'): Promise<boolean> => {
    const request = ++seq.current;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    setLoadMoreError(false);
    try {
      const res = await jobService.list({
        scope: 'all',
        status: ['pending_approval'],
        teamOnly: true,
        limit: PAGE_SIZE,
      });
      if (!mounted.current || request !== seq.current) return false;
      setItems(res.data);
      cursor.current = res.nextCursor;
      hasMore.current = res.hasMore;
      return true;
    } catch {
      if (!mounted.current || request !== seq.current) return false;
      setError(JOB_QUEUE_ERROR);
      return false;
    } finally {
      if (mounted.current && request === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

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
      // Announce only a SUCCESSFUL refresh — a failed one shows its banner.
      if (ok && mounted.current) AccessibilityInfo.announceForAccessibility('Job requests updated');
    });
  }, [loading, refreshing, loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore.current || cursor.current == null) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    const request = seq.current;
    try {
      const res = await jobService.list({
        scope: 'all',
        status: ['pending_approval'],
        teamOnly: true,
        cursor: cursor.current,
        limit: PAGE_SIZE,
      });
      if (!mounted.current || request !== seq.current) return;
      setItems(prev => {
        const seen = new Set(prev.map(job => job.id));
        return [...prev, ...res.data.filter(job => !seen.has(job.id))];
      });
      cursor.current = res.nextCursor;
      hasMore.current = res.hasMore;
    } catch {
      if (!mounted.current || request !== seq.current) return;
      setLoadMoreError(true);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [loading, loadingMore]);

  const decide = useCallback(
    async (
      job: ApiJob,
      action: 'approve' | 'reject',
      reason?: string,
    ): Promise<TeamJobWriteResult> => {
      if (busy.current) {
        return { ok: false, kind: 'error', message: 'A decision is already in progress.' };
      }
      busy.current = true;
      setBusyId(job.id);
      setActionError(null);
      setNotice(null);
      try {
        const updated = await jobService.decidePending(
          job.id,
          action,
          action === 'reject' ? reason : undefined,
        );
        if (mounted.current) {
          setItems(prev => prev.filter(item => item.id !== updated.id));
          AccessibilityInfo.announceForAccessibility(
            action === 'approve' ? 'Job approved' : 'Job declined',
          );
        }
        return { ok: true };
      } catch (caught) {
        const err = caught as ApiError;
        if (err.code === 'JOB_NOT_PENDING') {
          if (mounted.current) {
            setItems(prev => prev.filter(item => item.id !== job.id));
            setNotice(JOB_ALREADY_HANDLED_NOTICE);
          }
          void loadFirst('refresh');
          return { ok: false, kind: 'handled', message: JOB_ALREADY_HANDLED_NOTICE };
        }
        const message =
          err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT'
            ? "Couldn't reach the server. Check your connection and try again."
            : err.message || "Couldn't save the decision.";
        if (mounted.current) setActionError(message);
        return { ok: false, kind: 'error', message };
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
