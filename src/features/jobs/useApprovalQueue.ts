/**
 * useApprovalQueue — shared store for the owner's pending-approval queue
 * (`GET /approval-queue`, Epic 22 story 4), from `GET /approval-queue` via
 * `approvalQueueService`. Same `useSyncExternalStore` shared-store pattern
 * as `useSkills`: one module-level state, any number of subscribers — the
 * Jobs tab's Pending segment and (later) any badge surface read one fetch.
 *
 * The queue is cursor-paginated (oldest submission first, page size 50).
 * CAP-10 filters — by employee and by submission age — ride the store: a
 * filter change is a fresh page 1 (rows clear, loader shows). A decision
 * made elsewhere (the job detail screen) removes the row here via
 * `removeApprovalQueueItem` — the store is the single copy of the queue.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { approvalQueueService } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import type { ApiError, ApprovalQueueItem } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface ApprovalQueueState {
  items: ApprovalQueueItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** True while the *first* load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** True while a cursor page is landing (rows already on screen). */
  isLoadingMore: boolean;
  /** Human-readable failure message from `ApiError`, safe to render. */
  error: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoaded: boolean;
  /** Last SUCCESSFUL page-1 load — the focus-refresh throttle's clock. */
  lastLoadedAt: number | null;
  /** CAP-10 — the active employee filter (user id, or null = all). */
  employeeId: string | null;
  /** CAP-10 — the active age cut-off in hours (or null = no cut-off). */
  olderThanHours: number | null;
}

const INITIAL: ApprovalQueueState = {
  items: [],
  nextCursor: null,
  hasMore: false,
  // Starts true, so the very first render is a loader, never empty copy.
  isLoading: true,
  isLoadingMore: false,
  error: null,
  hasLoaded: false,
  lastLoadedAt: null,
  employeeId: null,
  olderThanHours: null,
};

// --- Shared store: one queue, any number of subscribers ---------------------
const subscribers = new Set<() => void>();
let state: ApprovalQueueState = INITIAL;

/** Page-1 request slot — unforced callers join it instead of duplicating. */
let inFlight: Promise<void> | null = null;
/** Monotonic id per request; a forced refresh supersedes older responses. */
let requestSeq = 0;

function setState(next: Partial<ApprovalQueueState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return state;
}

async function fetchPage(cursor?: string): Promise<void> {
  const seq = ++requestSeq;
  if (cursor) {
    setState({ isLoadingMore: true, error: null });
  } else {
    // Loader only when nothing is on screen yet; a refresh keeps the rows.
    setState({ isLoading: state.items.length === 0, error: null });
  }
  try {
    // The CAP-10 filters ride every page: a cursor page continues the
    // filtered query, and the filter read happens at request time (a filter
    // change supersedes in-flight pages through the seq guard).
    const page = await approvalQueueService.list({
      ...(cursor ? { cursor } : {}),
      ...(state.employeeId ? { employeeId: state.employeeId } : {}),
      ...(state.olderThanHours ? { olderThanHours: state.olderThanHours } : {}),
    });
    if (seq !== requestSeq) return;
    // Append only deduped rows: a refresh landing between two page loads
    // must not double-append the same ids.
    const merged = cursor
      ? [...state.items, ...page.data.filter(j => !state.items.some(i => i.id === j.id))]
      : page.data;
    setState({
      items: merged,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasLoaded: true,
      ...(cursor ? {} : { lastLoadedAt: Date.now() }),
    });
  } catch (caught) {
    console.warn('[useApprovalQueue] GET /approval-queue failed →', caught);
    if (seq !== requestSeq) return;
    // `items` is deliberately retained: a failed refresh keeps the queue on
    // screen and surfaces `error` as the retry-able banner.
    setState({
      isLoading: false,
      isLoadingMore: false,
      error: (caught as ApiError)?.message || 'Something went wrong',
      hasLoaded: true,
    });
  }
}

/**
 * Loads page 1, joining any request already in flight. Throttled against the
 * last SUCCESS like `loadSkills` — a segment re-entry within the TTL window
 * costs at most one request. `opts.force` (pull-to-refresh, post-decision)
 * always lands immediately and runs alongside the old request.
 */
export function loadApprovalQueue(opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight && !opts.force) return inFlight;
  const elapsed = Date.now() - (state.lastLoadedAt ?? 0);
  const fresh = elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
  if (!opts.force && fresh) return Promise.resolve();
  const request = fetchPage().finally(() => {
    if (inFlight === request) inFlight = null;
  });
  inFlight = request;
  return request;
}

/** Fetches the next cursor page, if any. */
export async function loadMoreApprovalQueue(): Promise<void> {
  if (!state.nextCursor || state.isLoadingMore || state.isLoading) return;
  await fetchPage(state.nextCursor);
}

/**
 * Drops one job from the queue (the detail screen's approve/reject calls
 * this with the decided id). No refetch: the queue's remaining rows are
 * exactly what the list showed minus this one.
 */
export function removeApprovalQueueItem(jobId: string): void {
  if (!state.items.some(i => i.id === jobId)) return;
  setState({ items: state.items.filter(i => i.id !== jobId) });
}

/**
 * Applies the CAP-10 filters (both together — they combine) and reloads
 * page 1 with them: the previous filter's rows clear so the old list can't
 * masquerade as the new query's result, and the load always lands (a filter
 * change is a deliberate query, never throttle-skippable).
 */
export async function setQueueFilter(
  employeeId: string | null,
  olderThanHours: number | null,
): Promise<void> {
  if (state.employeeId === employeeId && state.olderThanHours === olderThanHours) {
    return;
  }
  setState({
    employeeId,
    olderThanHours,
    items: [],
    nextCursor: null,
    hasMore: false,
    isLoading: true,
    error: null,
  });
  await loadApprovalQueue({ force: true });
}

/** Reset to the pre-login state; a late response can't repopulate it. */
export function clearApprovalQueue() {
  requestSeq += 1;
  inFlight = null;
  setState(INITIAL);
}

// Join the global 401 reset flow — see services/resetRegistry.ts.
registerReset(clearApprovalQueue);

export function useApprovalQueue(opts: { autoLoad?: boolean } = {}) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const autoLoad = opts.autoLoad ?? true;

  // First mount (the Pending segment appearing) kicks off the load.
  useEffect(() => {
    if (autoLoad && !snapshot.hasLoaded && !inFlight) {
      void loadApprovalQueue();
    }
  }, [autoLoad, snapshot.hasLoaded]);

  const refresh = useCallback(() => loadApprovalQueue({ force: true }), []);

  return {
    items: snapshot.items,
    hasMore: snapshot.hasMore,
    isLoading: snapshot.isLoading,
    isLoadingMore: snapshot.isLoadingMore,
    error: snapshot.error,
    hasLoaded: snapshot.hasLoaded,
    // CAP-10 — the active filters, for the chips' active states.
    employeeId: snapshot.employeeId,
    olderThanHours: snapshot.olderThanHours,
    refresh,
    loadMore: loadMoreApprovalQueue,
  };
}
