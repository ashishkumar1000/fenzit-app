/**
 * useLeaveRequests — the Requests pane's data orchestration (the two-tab
 * Leave redesign, 2026-11; modelled on the retired useOwnerLeaveQueue's
 * contracts, generalized to six filters + the server needle). Owns:
 * the per-filter pagination state (the reducer in `requestsModel` — each
 * filter's page never crosses), the committed-q reset (a committed needle
 * replaces EVERY filter's page — cursors never cross a q value), the
 * /summary counts (quiet on failure — never an error banner over the
 * list), the stale marks (writes mark every filter; foregrounding marks
 * + silently refreshes the visible one), the focus refetch, pull-to-
 * refresh of the ACTIVE filter only (announced), and the cursor-scoped
 * load-more. The screen renders; this decides.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { attendanceLeaveService } from '../../../services';
import {
  LEAVE_FILTERS,
  initialRequestsState,
  requestsReducer,
  type LeaveCounts,
  type LeaveFilter,
} from './requestsModel';

const PAGE_SIZE = 20;
/** The search needle's commit debounce — typing never fires per keystroke. */
const SEARCH_DEBOUNCE_MS = 500;
/** The BE 422s a longer needle; the cap makes the refusal unreachable. */
const SEARCH_MAX_LENGTH = 100;

/** The hook only subscribes to focus — the structural slice it needs. */
type FocusNavigation = {
  addListener: (event: 'focus', cb: () => void) => () => void;
};

export function useLeaveRequests(
  navigation: FocusNavigation,
  initialFilter: LeaveFilter,
) {
  const [state, dispatch] = useReducer(requestsReducer, undefined, initialRequestsState);
  const [activeFilter, setActiveFilter] = useState<LeaveFilter>(initialFilter);
  const [refreshing, setRefreshing] = useState(false);
  // WHICH filter's refresh failed — the notice must not bleed onto another
  // filter's freshly loaded list (the 17-6 review P3 posture).
  const [refreshFailed, setRefreshFailed] = useState<LeaveFilter | null>(null);
  const mounted = useRef(true);
  const activeRef = useRef(activeFilter);
  activeRef.current = activeFilter;
  const stateRef = useRef(state);
  stateRef.current = state;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The per-filter response EPOCH: starting a fetch (or resetting the
  // filter's world — a q commit, a landing) bumps it, and every in-flight
  // response for an older epoch is dropped. Without this a first-page
  // response could resolve out of order under a newer needle/landing and
  // overwrite the fresher list (found in the code review, 2026-11-26).
  const fetchSeq = useRef<Record<LeaveFilter, number>>(
    Object.fromEntries(LEAVE_FILTERS.map(filter => [filter, 0])) as Record<LeaveFilter, number>,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  /** First page — an entering filter (empty cache) or a stale re-entry.
   *  `qFor` passes the JUST-committed needle: the dispatch hasn't rendered
   *  yet, so `stateRef.current.q` would still read the old value (found by
   *  the screen tests — the fetch went out needle-less). */
  const fetchFirst = useCallback((filter: LeaveFilter, qFor?: string) => {
    const q = qFor ?? stateRef.current.q;
    const seq = ++fetchSeq.current[filter];
    dispatch({ type: 'pageStart', filter });
    attendanceLeaveService
      .listOwnerLeave({
        ...(filter === 'all' ? {} : { status: filter }),
        ...(q === '' ? {} : { q }),
        limit: PAGE_SIZE,
      })
      .then(res => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({
          type: 'pageSuccess',
          filter,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        });
        setRefreshFailed(null);
      })
      .catch(() => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({ type: 'pageError', filter });
        setRefreshFailed(filter);
      });
  }, []);

  /** The pill counts — silent-failure by contract (counts go quiet; the
   *  list is never blocked by a summary failure). */
  const refreshCounts = useCallback(() => {
    attendanceLeaveService
      .leaveSummary()
      .then((summary: { counts: LeaveCounts }) => {
        if (!mounted.current) return;
        dispatch({ type: 'countsSuccess', counts: summary.counts });
      })
      .catch(() => {
        // Quiet: the pills and totals line render bare until the next
        // focus/refresh retry (the web's round-4 posture).
      });
  }, []);

  // First load of the entering filter + the counts.
  useEffect(() => {
    fetchFirst(activeFilter);
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus: a loaded, quiet cache still refetches — something may have
  // changed out there (the attendance screens' focus-refetch contract).
  // A load-more in flight must not interleave with a first-page refetch
  // (its success would append the pre-refresh page onto the replaced list
  // and replay a stale cursor) — defer via the stale mark (17-6 review P2).
  useEffect(() => {
    return navigation.addListener('focus', () => {
      const filter = activeRef.current;
      refreshCounts();
      if (stateRef.current.pages[filter].loading) {
        dispatch({ type: 'markStale' });
        return;
      }
      if (stateRef.current.pages[filter].loaded) fetchFirst(filter);
    });
  }, [navigation, fetchFirst, refreshCounts]);

  // Foregrounding: the cache may be hours old — mark everything stale and
  // silently refresh the visible filter; the others refetch on re-entry.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState !== 'active') return;
      dispatch({ type: 'markStale' });
      const filter = activeRef.current;
      if (!stateRef.current.pages[filter].loading && stateRef.current.pages[filter].loaded) {
        fetchFirst(filter);
      }
      refreshCounts();
    });
    return () => sub.remove();
  }, [fetchFirst, refreshCounts]);

  /** Commit the search needle (trimmed, capped) — resets every filter's
   *  page; the active one refetches immediately. */
  const commitSearch = useCallback(
    (raw: string) => {
      const q = raw.trim().slice(0, SEARCH_MAX_LENGTH);
      if (q === stateRef.current.q) return;
      dispatch({ type: 'qCommitted', q });
      // The needle change resets every filter's page — every in-flight
      // response (any filter, any kind) belongs to the old needle's world.
      for (const filter of LEAVE_FILTERS) fetchSeq.current[filter] += 1;
      fetchFirst(activeRef.current, q);
    },
    [fetchFirst],
  );

  /** Debounced search input — typing schedules a commit; each keystroke
   *  replaces the pending one. Empty input commits immediately (clearing
   *  the box must not feel laggy). */
  const searchInput = useCallback(
    (raw: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (raw.trim() === '') {
        commitSearch('');
        return;
      }
      searchTimer.current = setTimeout(() => commitSearch(raw), SEARCH_DEBOUNCE_MS);
    },
    [commitSearch],
  );

  /** Consume a merged `{ tab }` landing param (read-once-then-clear): the
   *  landing is always an intent to see fresh data — the target filter
   *  fetches unconditionally, loaded or not (the 17-6 review P1 rule).
   *  The epoch bump makes the landing's fetch WIN over any in-flight one
   *  (a landing during the mount fetch must not double-fire into a race
   *  where the older response resolves last). */
  const consumeFilter = useCallback(
    (filter: LeaveFilter) => {
      if (filter !== activeRef.current) setActiveFilter(filter);
      fetchSeq.current[filter] += 1;
      fetchFirst(filter);
      refreshCounts();
    },
    [fetchFirst, refreshCounts],
  );

  const switchFilter = useCallback(
    (filter: LeaveFilter) => {
      if (filter === activeFilter) return;
      setActiveFilter(filter);
      const target = stateRef.current.pages[filter];
      if (target.loading) {
        // A fetch or load-more is already running for this filter — its
        // response owns the page; a parallel first-page fetch would race
        // it (and a load-more's success would append pre-refresh rows
        // onto the replaced list). Defer via the stale mark — the focus
        // handler's posture, applied to the pill switch.
        dispatch({ type: 'markStale' });
        return;
      }
      if (!target.loaded || stateRef.current.stale[filter]) fetchFirst(filter);
    },
    [activeFilter, fetchFirst],
  );

  // Pull-to-refresh resets the ACTIVE filter only; announced to screen
  // readers. Same load-more interleave guard as focus.
  const onRefresh = useCallback(() => {
    if (refreshing) return;
    if (stateRef.current.pages[activeFilter].loading) return;
    const filter = activeFilter;
    setRefreshing(true);
    setRefreshFailed(null);
    dispatch({ type: 'pageStart', filter });
    // The epoch this refresh belongs to — a q commit or a newer fetch
    // invalidates the response (its rows predate the reset).
    const seq = fetchSeq.current[filter];
    const q = stateRef.current.q;
    attendanceLeaveService
      .listOwnerLeave({
        ...(filter === 'all' ? {} : { status: filter }),
        ...(q === '' ? {} : { q }),
        limit: PAGE_SIZE,
      })
      .then(res => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({
          type: 'pageSuccess',
          filter,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        });
        AccessibilityInfo.announceForAccessibility('Leave requests updated');
      })
      .catch(() => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({ type: 'pageError', filter });
        setRefreshFailed(filter);
      })
      .finally(() => {
        setRefreshing(false);
        refreshCounts();
      });
  }, [activeFilter, refreshing, refreshCounts]);

  // Load-more: ONLY the active filter's own cursor feeds this (D1 invariant).
  const loadMore = useCallback(() => {
    const filter = activeFilter;
    const page = stateRef.current.pages[filter];
    if (page.loading || page.endReached || page.cursor == null) return;
    dispatch({ type: 'loadMoreStart', filter });
    // No epoch bump — the load-more belongs to the CURRENT epoch; a q
    // commit or a first-page fetch mid-flight invalidates its response
    // (appending old-needle rows onto a reset page is unrepresentable).
    const seq = fetchSeq.current[filter];
    const q = stateRef.current.q;
    attendanceLeaveService
      .listOwnerLeave({
        ...(filter === 'all' ? {} : { status: filter }),
        ...(q === '' ? {} : { q }),
        cursor: page.cursor,
        limit: PAGE_SIZE,
      })
      .then(res => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({
          type: 'loadMoreSuccess',
          filter,
          items: res.data,
          nextCursor: res.nextCursor,
          hasMore: res.hasMore,
        });
      })
      .catch(() => {
        if (!mounted.current || fetchSeq.current[filter] !== seq) return;
        dispatch({ type: 'loadMoreError', filter });
      });
  }, [activeFilter]);

  return {
    state,
    activeFilter,
    refreshing,
    refreshFailed,
    dispatch,
    fetchFirst,
    consumeFilter,
    switchFilter,
    onRefresh,
    loadMore,
    searchInput,
    refreshCounts,
  };
}
