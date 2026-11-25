/**
 * Model tests for `requestsModel` (the two-tab Leave redesign, 2026-11;
 * retargeted verbatim from the retired ownerLeaveModel queue-slice tests):
 * the per-filter pagination reducer — THE cursor-safety invariant (a
 * Needs-review cursor can never feed an Approved load-more and vice
 * versa), append dedup, stale marks, write invalidation of every filter,
 * the decideRow branch (swap in place where the new status belongs, drop
 * it where it doesn't), and the committed-q reset that replaces every
 * filter's page (cursors never cross a q value).
 */
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import {
  countsTotal,
  initialRequestsState,
  requestsReducer,
} from './requestsModel';

function row(id: string, status = 'pending'): LeaveRequestRow {
  return {
    id,
    employeeId: `e-${id}`,
    employeeName: `Employee ${id}`,
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    part: 'full_day',
    reason: 'Family',
    status,
    workingDays: 1,
    totalDays: 1,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [{ date: '2026-10-05', state: status }],
  };
}

function loaded(state = initialRequestsState()) {
  return requestsReducer(state, {
    type: 'pageSuccess',
    filter: 'pending',
    items: [row('p1')],
    nextCursor: 'CUR-PENDING-1',
    hasMore: true,
  });
}

describe('per-filter cursor isolation (the CRITICAL invariant)', () => {
  it('a pending page lands only in the pending filter — the others stay empty', () => {
    const state = loaded();
    expect(state.pages.pending.items).toHaveLength(1);
    expect(state.pages.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.pages.all.items).toHaveLength(0);
    expect(state.pages.all.cursor).toBeNull();
  });

  it('a pending cursor never paginates the approved filter (load-more reads its own)', () => {
    let state = loaded();
    // The approved filter loads its OWN first page with its own cursor.
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: true,
    });
    // A pending load-more consumes ONLY the pending cursor.
    state = requestsReducer(state, {
      type: 'loadMoreSuccess',
      filter: 'pending',
      items: [row('p2')],
      nextCursor: 'CUR-PENDING-2',
      hasMore: true,
    });
    expect(state.pages.pending.cursor).toBe('CUR-PENDING-2');
    expect(state.pages.approved.cursor).toBe('CUR-ALL-1');
    expect(state.pages.approved.items.map(r => r.id)).toEqual(['a1']);
  });

  it('an approved load-more leaves the pending filter untouched', () => {
    let state = loaded();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: false,
    });
    state = requestsReducer(state, {
      type: 'loadMoreSuccess',
      filter: 'approved',
      items: [row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.pages.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.pages.approved.endReached).toBe(true);
  });

  it('load-more appends and dedups by id', () => {
    let state = loaded();
    state = requestsReducer(state, {
      type: 'loadMoreSuccess',
      filter: 'pending',
      items: [row('p1'), row('p2')], // cursor replay re-answers p1
      nextCursor: null,
      hasMore: false,
    });
    expect(state.pages.pending.items.map(r => r.id)).toEqual(['p1', 'p2']);
    expect(state.pages.pending.endReached).toBe(true);
  });

  it('a committed q resets EVERY filter to a fresh first page (cursors never cross a q value)', () => {
    let state = loaded();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: true,
    });
    state = requestsReducer(state, { type: 'qCommitted', q: 'sick' });
    expect(state.q).toBe('sick');
    expect(state.pages.pending.items).toEqual([]);
    expect(state.pages.pending.cursor).toBeNull();
    expect(state.pages.approved.items).toEqual([]);
    expect(state.pages.approved.cursor).toBeNull();
    // A same-q commit is a no-op (the pages survive).
    state = requestsReducer(state, { type: 'qCommitted', q: 'sick' });
    expect(state.pages.pending.loaded).toBe(false);
  });
});

describe('stale marks and refresh branches', () => {
  it('markStale hits EVERY filter (a write invalidates all of them)', () => {
    const state = requestsReducer(initialRequestsState(), { type: 'markStale' });
    expect(Object.values(state.stale).every(Boolean)).toBe(true);
  });

  it('a filter refresh success clears ITS stale mark only', () => {
    let state = initialRequestsState();
    state = requestsReducer(state, { type: 'markStale' });
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'pending',
      items: [row('p1')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.stale.pending).toBe(false);
    expect(Object.entries(state.stale).filter(([, v]) => v).length).toBe(5);
  });

  it('a pull-to-refresh resets the ACTIVE filter and never the other', () => {
    let state = initialRequestsState();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a1', 'approved')],
      nextCursor: 'CUR-ALL-1',
      hasMore: true,
    });
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    expect(state.pages.approved.items.map(r => r.id)).toEqual(['a2']); // reset, not append
    expect(state.pages.pending.items).toEqual([]);
  });

  it('a refresh failure keeps the last loaded list (the notice keeps it honest)', () => {
    let state = loaded();
    state = requestsReducer(state, { type: 'refreshError', filter: 'pending' });
    expect(state.pages.pending.items).toHaveLength(1);
    expect(state.pages.pending.loaded).toBe(true);
    expect(state.pages.pending.loading).toBe(false);
  });

  it('a load-more failure keeps rows AND the cursor (retryable)', () => {
    let state = loaded();
    state = requestsReducer(state, { type: 'loadMoreError', filter: 'pending' });
    expect(state.pages.pending.items).toHaveLength(1);
    expect(state.pages.pending.cursor).toBe('CUR-PENDING-1');
    expect(state.pages.pending.loading).toBe(false);
  });

  it('a first-page error flags the filter for the load-failure state', () => {
    const state = requestsReducer(initialRequestsState(), {
      type: 'pageError',
      filter: 'pending',
    });
    expect(state.pages.pending.error).toBe(true);
    expect(state.pages.pending.loaded).toBe(false);
  });
});

describe('the write branch (spec D2, generalized)', () => {
  it('a decided row swaps in place where the new status belongs and leaves the rest', () => {
    let state = initialRequestsState();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'all',
      items: [row('a1', 'pending'), row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'pending',
      items: [row('a1', 'pending')],
      nextCursor: null,
      hasMore: false,
    });
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a2', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    state = requestsReducer(state, { type: 'decideRow', row: row('a1', 'approved') });
    // All keeps it, replaced in place, order intact.
    expect(state.pages.all.items.map(r => r.id)).toEqual(['a1', 'a2']);
    expect(state.pages.all.items[0].status).toBe('approved');
    // The Needs-review list is a filtered one — the row left it.
    expect(state.pages.pending.items).toEqual([]);
    // The Approved list never held it — untouched (it refetches on entry
    // via the stale mark; the reducer never fabricates an append).
    expect(state.pages.approved.items.map(r => r.id)).toEqual(['a2']);
  });

  it('a FULL revoke moves the row out of the Approved list but keeps it under All', () => {
    let state = initialRequestsState();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'approved',
      items: [row('a1', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'all',
      items: [row('a1', 'approved')],
      nextCursor: null,
      hasMore: false,
    });
    state = requestsReducer(state, { type: 'decideRow', row: row('a1', 'revoked') });
    expect(state.pages.approved.items).toEqual([]);
    expect(state.pages.all.items.map(r => r.status)).toEqual(['revoked']);
  });

  it('a nameless WRITE view keeps the row’s list-earned employeeName', () => {
    let state = initialRequestsState();
    state = requestsReducer(state, {
      type: 'pageSuccess',
      filter: 'all',
      items: [row('a1', 'pending')],
      nextCursor: null,
      hasMore: false,
    });
    // The write path's view carries NO employeeName (list-only enrichment).
    const { employeeName: _dropped, ...nameless } = row('a1', 'approved');
    state = requestsReducer(state, {
      type: 'decideRow',
      row: nameless as LeaveRequestRow,
    });
    expect(state.pages.all.items[0].employeeName).toBe('Employee a1');
    expect(state.pages.all.items[0].status).toBe('approved');
  });
});

describe('countsTotal (the All pill + the totals line)', () => {
  it('sums the five derived statuses', () => {
    expect(
      countsTotal({ pending: 2, approved: 3, revoked: 1, cancelled: 4, rejected: 0 }),
    ).toBe(10);
  });
});
