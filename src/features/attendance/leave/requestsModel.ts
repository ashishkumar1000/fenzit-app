/**
 * requestsModel.ts — the Requests pane's pure state model (the two-tab
 * Leave redesign, 2026-11). The web console's LeaveRequestsTab is the
 * semantic reference; this decides what the pane renders.
 *
 * THE CURSOR-SAFETY INVARIANT (generalized from ownerLeaveModel's D1):
 * cursors are minted under one (status filter, committed q) query and a
 * cursor is only ever replayed by the load-more of THAT filter while q is
 * unchanged. A committed q reset replaces every filter's page with a
 * fresh first page — crossing a q value is unrepresentable.
 *
 * Write semantics: a decision removes/updates the row in EVERY loaded
 * filter's list (a decided row lingers nowhere) and marks all filters
 * stale, so the next entry refetches its first page.
 */
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';

/** The six filters: All + the five derived statuses (web LEAVE_STATUSES
 *  order). Each non-all filter maps 1:1 onto the wire `status=` value. */
export const LEAVE_FILTERS = [
  'all',
  'pending',
  'approved',
  'revoked',
  'cancelled',
  'rejected',
] as const;

export type LeaveFilter = (typeof LEAVE_FILTERS)[number];

/** The pills' words — the design's own, shipped verbatim on the web
 *  console (PILL_LABELS). The wire's raw words only ever reach the cards'
 *  status chips (humanized, the shared requestStatusChip table). */
export const PILL_LABELS: Record<LeaveFilter, string> = {
  all: 'All',
  pending: 'Needs review',
  approved: 'Approved',
  revoked: 'Self-cancelled',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/** One filter's whole pagination state — never shared, never merged. */
export interface LeaveFilterPage {
  items: LeaveRequestRow[];
  /** The NEXT page's cursor; null once `hasMore` went false. */
  cursor: string | null;
  endReached: boolean;
  /** A fetch (first page or load-more) in flight for THIS filter. */
  loading: boolean;
  /** The last first-page fetch failed (the load-failure state). */
  error: boolean;
  /** At least one successful first page — gates spinner-vs-empty. */
  loaded: boolean;
}

export function initialFilterPage(): LeaveFilterPage {
  return {
    items: [],
    cursor: null,
    endReached: false,
    loading: false,
    error: false,
    loaded: false,
  };
}

/** The per-status pill counts (the /summary shape), null = not fetched. */
export interface LeaveCounts {
  pending: number;
  approved: number;
  revoked: number;
  cancelled: number;
  rejected: number;
}

export interface LeaveRequestsState {
  /** The committed search needle ('' = none). Pages are per (filter, q). */
  q: string;
  pages: Record<LeaveFilter, LeaveFilterPage>;
  /** A filter's cache may be behind a write/foreground — re-entry refetches. */
  stale: Record<LeaveFilter, boolean>;
  /** The summary counts; null = not fetched yet. Failed → stays null. */
  counts: LeaveCounts | null;
}

export function initialRequestsState(): LeaveRequestsState {
  const pages = Object.fromEntries(
    LEAVE_FILTERS.map(filter => [filter, initialFilterPage()]),
  ) as Record<LeaveFilter, LeaveFilterPage>;
  const stale = Object.fromEntries(
    LEAVE_FILTERS.map(filter => [filter, false]),
  ) as Record<LeaveFilter, boolean>;
  return { q: '', pages, stale, counts: null };
}

export type RequestsAction =
  /** First-page fetch start (a filter entering empty). */
  | { type: 'pageStart'; filter: LeaveFilter }
  | {
      type: 'pageSuccess';
      filter: LeaveFilter;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | { type: 'pageError'; filter: LeaveFilter }
  /** Load-more start — paginates ONLY this filter's own cursor. */
  | { type: 'loadMoreStart'; filter: LeaveFilter }
  | {
      type: 'loadMoreSuccess';
      filter: LeaveFilter;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  /** Load-more failure keeps the loaded rows AND the cursor (retryable). */
  | { type: 'loadMoreError'; filter: LeaveFilter }
  /** First-page reset — pull-to-refresh, stale re-entry, focus refetch. */
  | { type: 'refreshStart'; filter: LeaveFilter }
  | {
      type: 'refreshSuccess';
      filter: LeaveFilter;
      items: LeaveRequestRow[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  /** Refresh failure keeps the last loaded list. */
  | { type: 'refreshError'; filter: LeaveFilter }
  /** A committed q — resets EVERY filter to a fresh first page (cursors
   *  never cross a q value). The counts go quiet via the pane's `narrowed`
   *  read of `q`, not through state here. */
  | { type: 'qCommitted'; q: string }
  /** Writes mark every filter; foregrounding marks them the same way. */
  | { type: 'markStale' }
  /** A WRITE response lands: the row swaps in place in every list whose
   *  filter still matches its NEW status ('all' always keeps it) and
   *  leaves every status list it no longer belongs to (the old D2's
   *  pending-remove/all-replace, generalized — one action, so remove-
   *  then-replace composition can never delete before it replaces). */
  | { type: 'decideRow'; row: LeaveRequestRow }
  | { type: 'countsSuccess'; counts: LeaveCounts };

type PageResult = {
  items: LeaveRequestRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

function withResult(page: LeaveFilterPage, result: PageResult): LeaveFilterPage {
  return {
    items: result.items,
    cursor: result.nextCursor,
    endReached: !result.hasMore,
    loading: false,
    error: false,
    loaded: true,
  };
}

export function requestsReducer(
  state: LeaveRequestsState,
  action: RequestsAction,
): LeaveRequestsState {
  switch (action.type) {
    case 'pageStart':
    case 'loadMoreStart':
    case 'refreshStart':
      return {
        ...state,
        pages: {
          ...state.pages,
          [action.filter]: { ...state.pages[action.filter], loading: true, error: false },
        },
      };
    case 'pageSuccess':
    case 'refreshSuccess':
      return {
        ...state,
        stale: { ...state.stale, [action.filter]: false },
        pages: {
          ...state.pages,
          [action.filter]: withResult(state.pages[action.filter], action),
        },
      };
    case 'pageError':
      return {
        ...state,
        pages: {
          ...state.pages,
          [action.filter]: { ...state.pages[action.filter], loading: false, error: true },
        },
      };
    case 'loadMoreSuccess':
      return {
        ...state,
        pages: {
          ...state.pages,
          [action.filter]: {
            // Append — deduped by id: a cursor replay answered the same rows.
            items: [
              ...state.pages[action.filter].items.filter(
                item => !action.items.some(row => row.id === item.id),
              ),
              ...action.items,
            ],
            cursor: action.nextCursor,
            endReached: !action.hasMore,
            loading: false,
            error: false,
            loaded: true,
          },
        },
      };
    case 'loadMoreError':
    case 'refreshError':
      return {
        ...state,
        pages: {
          ...state.pages,
          [action.filter]: { ...state.pages[action.filter], loading: false },
        },
      };
    case 'qCommitted': {
      if (action.q === state.q) return state;
      const pages = Object.fromEntries(
        LEAVE_FILTERS.map(filter => [filter, initialFilterPage()]),
      ) as Record<LeaveFilter, LeaveFilterPage>;
      return { ...state, q: action.q, pages };
    }
    case 'markStale': {
      const stale = Object.fromEntries(
        LEAVE_FILTERS.map(filter => [filter, true]),
      ) as Record<LeaveFilter, boolean>;
      return { ...state, stale };
    }
    case 'decideRow': {
      const pages = Object.fromEntries(
        LEAVE_FILTERS.map(filter => {
          const page = state.pages[filter];
          const belongs = filter === 'all' || filter === action.row.status;
          return [
            filter,
            {
              ...page,
              items: page.items
                .filter(item => item.id !== action.row.id || belongs)
                .map(item =>
                  item.id === action.row.id
                    ? // The WRITE response carries none of the list-only
                      // enrichments (employeeName and its companions, the
                      // type/office names — attendanceLeave.ts) — keep the
                      // row's list-earned fields or the card falls back
                      // until the stale refetch (17-6 P1; the generalized
                      // keep-list — the review, 2026-11-26).
                      {
                        ...action.row,
                        employeeName: action.row.employeeName ?? item.employeeName,
                        employeeAvatarUrl: action.row.employeeAvatarUrl ?? item.employeeAvatarUrl,
                        employeeCode: action.row.employeeCode ?? item.employeeCode,
                        leaveTypeName: action.row.leaveTypeName ?? item.leaveTypeName,
                        officeName: action.row.officeName ?? item.officeName,
                      }
                    : item,
                ),
            },
          ];
        }),
      ) as Record<LeaveFilter, LeaveFilterPage>;
      return { ...state, pages };
    }
    case 'countsSuccess':
      return { ...state, counts: action.counts };
    default:
      return state;
  }
}

// --- Counts helpers (the pills + the totals line) ---------------------------

/** The All pill's number: the whole tenant's requests (sum of the five). */
export function countsTotal(counts: LeaveCounts): number {
  return (
    counts.pending +
    counts.approved +
    counts.revoked +
    counts.cancelled +
    counts.rejected
  );
}
