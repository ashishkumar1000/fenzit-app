/**
 * The `useApprovalQueue` shared store — Epic 22 story 4 (owner's pending
 * queue) + CAP-10 (filters).
 *
 * Same approach as useReports.test.ts: module functions driven directly, read
 * back through a probe component, `../src/services` mocked at the barrel.
 * The throttle tests run under fake timers pinned to a fixed epoch;
 * `clearApprovalQueue()` resets the module store between tests (it is also
 * the real logout reset, whose registry join reset-registry-stores.test.tsx
 * already covers).
 *
 * QA notes the suite hunts: a doubled queue (cursor pages overlapping a
 * refresh), a stale response from a superseded request landing after a newer
 * one, a filter change leaking the old rows as its own result, and a failed
 * refresh wiping a queue the owner was reading.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  approvalQueueService: { list: jest.fn() },
}));

import {
  clearApprovalQueue,
  loadApprovalQueue,
  loadMoreApprovalQueue,
  removeApprovalQueueItem,
  setQueueFilter,
  useApprovalQueue,
} from '../src/features/jobs/useApprovalQueue';
import { approvalQueueService } from '../src/services';
import type { ApprovalQueueItem } from '../src/services';
import { FOCUS_REFRESH_TTL_MS } from '../src/constants';

const list = approvalQueueService.list as jest.Mock;
const TTL = FOCUS_REFRESH_TTL_MS;
/** A fixed epoch the fake clock starts at. */
const T0 = 1_800_000_000_000;

const makeItem = (overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem => ({
  id: 'q-1',
  jobNumber: 'JB-2026-0099',
  submittedAt: '2026-11-13T08:00:00Z',
  ageHours: 3,
  employee: { id: 'u-2', name: 'Mom' },
  customerName: 'Ravi Kumar',
  ...overrides,
});

const page = (rows: ApprovalQueueItem[], nextCursor: string | null = null) => ({
  data: rows,
  nextCursor,
  hasMore: nextCursor !== null,
});

let probe: ReturnType<typeof useApprovalQueue> | null = null;
let instance: ReactTestRenderer | null = null;

function Probe(): null {
  // autoLoad off: the mount effect's auto-load is covered by
  // reset-registry-stores.test.tsx; these tests drive the module functions
  // directly and assert exact request counts.
  probe = useApprovalQueue({ autoLoad: false });
  return null;
}

async function run(fn: () => unknown): Promise<void> {
  await act(async () => {
    await fn();
  });
}

beforeEach(async () => {
  jest.useFakeTimers({ now: T0 });
  // Unconditional module reset — see useReports.test.ts's note on why the
  // reset must not be gated on a mounted instance.
  clearApprovalQueue();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => {
    instance = create(React.createElement(Probe));
  });
});

afterEach(async () => {
  if (instance) {
    await act(async () => {
      instance?.unmount();
    });
    instance = null;
    probe = null;
  }
  jest.useRealTimers();
  (console.warn as jest.Mock).mockRestore();
});

describe('first load', () => {
  it('starts as a loader with nothing loaded', () => {
    // The freshly mounted store: a loader, never empty copy.
    expect(probe).toMatchObject({
      items: [],
      isLoading: true,
      hasLoaded: false,
      error: null,
      employeeId: null,
      olderThanHours: null,
    });
  });

  it('fetches page 1 unfiltered and renders the rows', async () => {
    list.mockResolvedValue(page([makeItem({ id: 'q-1' }), makeItem({ id: 'q-2' })]));
    await run(() => loadApprovalQueue());
    expect(list).toHaveBeenCalledWith({});
    expect(probe).toMatchObject({
      items: ['q-1', 'q-2'].map(id => makeItem({ id })),
      isLoading: false,
      hasLoaded: true,
      hasMore: false,
      error: null,
    });
  });

  it('renders a human error and RETAINS existing rows when a refresh fails', async () => {
    // QA failure path: the owner is reading the queue; a network blip on a
    // pull-to-refresh must not blank it.
    list.mockResolvedValueOnce(page([makeItem({ id: 'q-1' })]));
    await run(() => loadApprovalQueue());
    list.mockRejectedValue({ message: 'Network request failed' });
    await run(() => loadApprovalQueue({ force: true }));
    expect(probe).toMatchObject({
      items: [makeItem({ id: 'q-1' })],
      isLoading: false,
      hasLoaded: true,
      error: 'Network request failed',
    });
  });

  it('falls back to a generic message for error shapes without one', async () => {
    list.mockRejectedValue('garbage');
    await run(() => loadApprovalQueue());
    expect(probe?.error).toBe('Something went wrong');
  });
});

describe('request joining and throttling', () => {
  it('joins an in-flight page-1 request instead of duplicating it', async () => {
    list.mockResolvedValue(page([makeItem({ id: 'q-1' })]));
    const first = loadApprovalQueue();
    const second = loadApprovalQueue();
    await run(() => Promise.all([first, second]));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('skips a re-entry within the TTL window after a success', async () => {
    list.mockResolvedValue(page([makeItem()]));
    await run(() => loadApprovalQueue());
    jest.setSystemTime(T0 + TTL - 1);
    await run(() => loadApprovalQueue());
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL window has passed', async () => {
    list.mockResolvedValue(page([makeItem()]));
    await run(() => loadApprovalQueue());
    jest.setSystemTime(T0 + TTL);
    await run(() => loadApprovalQueue());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('force always lands immediately, even inside the TTL window', async () => {
    list.mockResolvedValue(page([makeItem()]));
    await run(() => loadApprovalQueue());
    jest.setSystemTime(T0 + 1);
    await run(() => loadApprovalQueue({ force: true }));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('a failed load is not a success for throttle purposes', async () => {
    // QA boundary: the TTL clock only starts on a SUCCESSFUL page-1 load —
    // a retry right after a failure must actually retry.
    list.mockRejectedValueOnce({ message: 'down' });
    await run(() => loadApprovalQueue());
    jest.setSystemTime(T0 + 1);
    list.mockResolvedValue(page([makeItem()]));
    await run(() => loadApprovalQueue());
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('cursor pagination', () => {
  it('appends the next page and passes the cursor plus active filters', async () => {
    list
      .mockResolvedValueOnce(page([makeItem({ id: 'q-1' })]))
      // The filtered page 1 lands with its OWN cursor.
      .mockResolvedValueOnce(page([makeItem({ id: 'q-2' }), makeItem({ id: 'q-3' })], 'c2f'))
      .mockResolvedValueOnce(page([makeItem({ id: 'q-4' })]));
    await run(() => loadApprovalQueue());
    await run(() => setQueueFilter('u-2', 24));
    await run(() => loadMoreApprovalQueue());
    expect(list).toHaveBeenLastCalledWith({ cursor: 'c2f', employeeId: 'u-2', olderThanHours: 24 });
    expect(probe?.items.map(i => i.id)).toEqual(['q-2', 'q-3', 'q-4']);
    expect(probe?.hasMore).toBe(false);
    expect(probe?.isLoadingMore).toBe(false);
  });

  it('drops ids already in the list — a refresh between pages cannot double rows', async () => {
    // QA race: page 2's fetch stalls, a forced refresh lands the same ids
    // again, then page 2 resolves — the overlap must dedupe out.
    list.mockResolvedValueOnce(page([makeItem({ id: 'q-1' })], 'c2'));
    await run(() => loadApprovalQueue());

    let resolvePage2: (v: ReturnType<typeof page>) => void = () => {};
    list.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof page>>(resolve => {
          resolvePage2 = resolve;
        }),
    );
    const page2 = loadMoreApprovalQueue();
    list.mockResolvedValueOnce(
      page([makeItem({ id: 'q-1' }), makeItem({ id: 'q-2' })]),
    );
    await run(() => loadApprovalQueue({ force: true }));
    expect(probe?.items.map(i => i.id)).toEqual(['q-1', 'q-2']);

    // Now the stalled page 2 lands with the same ids.
    await run(() => {
      resolvePage2(page([makeItem({ id: 'q-1' }), makeItem({ id: 'q-2' })]));
      return page2;
    });
    expect(probe?.items.map(i => i.id)).toEqual(['q-1', 'q-2']);
  });

  it('refuses to load more without a cursor, while loading, or mid-page', async () => {
    list.mockResolvedValue(page([], null));
    await run(() => loadApprovalQueue());
    expect(list).toHaveBeenCalledTimes(1);
    await run(() => loadMoreApprovalQueue());
    expect(list).toHaveBeenCalledTimes(1); // no cursor → no second call

    // Guard 2 — while a PAGE-1 load is in flight. The load is stalled,
    // loadMore must not fire a page-2 fetch beside it. The stalled load is
    // never awaited (that would deadlock the test — release comes after);
    // fire it, flush the microtasks, then assert.
    let release!: () => void;
    const gate = new Promise<void>(res => {
      release = res;
    });
    list.mockImplementationOnce(() => gate); // the forced reload stalls
    await run(() => {
      void loadApprovalQueue({ force: true });
    });
    await run(() => {
      void loadMoreApprovalQueue();
    });
    // Only the stalled page-1 call was made — no page-2 sneak-through.
    expect(list).toHaveBeenCalledTimes(2);
    release();
    await run(() => Promise.resolve());

    // Guard 3 — a second loadMore while one is already loading more: joined
    // or refused, but never a DUPLICATE page-2 request. The stalled page-2
    // is never awaited (that would hang the test); it is released at the
    // end so the module's in-flight slot is free for the next test.
    let releasePage2!: (v: ReturnType<typeof page>) => void;
    const gate2 = new Promise<ReturnType<typeof page>>(res => {
      releasePage2 = res;
    });
    list
      .mockResolvedValueOnce(page([makeItem({ id: 'q-1' })], 'c2'))
      .mockImplementationOnce(() => gate2);
    await run(() => loadApprovalQueue({ force: true }));
    await run(() => {
      void loadMoreApprovalQueue(); // starts the page-2 fetch
    });
    const callsAtStart = list.mock.calls.length;
    await run(() => {
      void loadMoreApprovalQueue(); // must not fire a second one
    });
    expect(list.mock.calls.length).toBe(callsAtStart);
    releasePage2(page([], null));
    await run(() => Promise.resolve());
  });

  it('surfaces a page-2 failure without dropping page-1 rows', async () => {
    list
      .mockResolvedValueOnce(page([makeItem({ id: 'q-1' })], 'c2'))
      .mockRejectedValueOnce({ message: 'Network request failed' });
    await run(() => loadApprovalQueue());
    await run(() => loadMoreApprovalQueue());
    expect(probe).toMatchObject({
      items: [makeItem({ id: 'q-1' })],
      error: 'Network request failed',
      isLoadingMore: false,
    });
  });
});

describe('superseding requests', () => {
  it('a forced refresh supersedes a slower page-1 request still in flight', async () => {
    // QA race: the auto-load fires, stalls on a dead connection; the owner
    // pull-to-refreshes. The slow first response must never overwrite the
    // fast one's result — or, landing later, resurrect its rows.
    let resolveSlow: (v: ReturnType<typeof page>) => void = () => {};
    list
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof page>>(resolve => {
            resolveSlow = resolve;
          }),
      )
      .mockResolvedValueOnce(page([makeItem({ id: 'q-fast' })]));
    const slow = loadApprovalQueue();
    await run(() => loadApprovalQueue({ force: true }));
    expect(probe?.items.map(i => i.id)).toEqual(['q-fast']);
    await act(async () => {
      resolveSlow(page([makeItem({ id: 'q-slow' })]));
      await slow;
    });
    expect(probe?.items.map(i => i.id)).toEqual(['q-fast']);
  });
});

describe('removeApprovalQueueItem', () => {
  it('drops the decided row without a refetch', async () => {
    list.mockResolvedValue(page([makeItem({ id: 'q-1' }), makeItem({ id: 'q-2' })]));
    await run(() => loadApprovalQueue());
    await run(() => removeApprovalQueueItem('q-1'));
    expect(list).toHaveBeenCalledTimes(1);
    expect(probe?.items.map(i => i.id)).toEqual(['q-2']);
  });

  it('is a no-op for an id the queue never held', async () => {
    list.mockResolvedValue(page([makeItem({ id: 'q-1' })]));
    await run(() => loadApprovalQueue());
    act(() => {
      removeApprovalQueueItem('nope');
    });
    expect(probe?.items.map(i => i.id)).toEqual(['q-1']);
  });
});

describe('setQueueFilter (CAP-10)', () => {
  it('clears the old rows and force-reloads page 1 with the filter params', async () => {
    list.mockResolvedValue(page([makeItem({ id: 'q-1' })]));
    await run(() => loadApprovalQueue());
    jest.setSystemTime(T0 + 1); // inside the TTL — a filter change must ignore it
    list.mockResolvedValueOnce(page([makeItem({ id: 'q-2', employee: { id: 'u-2', name: 'Mom' } })]));
    await run(() => setQueueFilter('u-2', null));
    expect(list).toHaveBeenLastCalledWith({ employeeId: 'u-2' });
    expect(probe?.items.map(i => i.id)).toEqual(['q-2']);
    expect(probe?.employeeId).toBe('u-2');
  });

  it('combines both filters on the same request', async () => {
    list.mockResolvedValue(page([]));
    await run(() => setQueueFilter('u-2', 72));
    expect(list).toHaveBeenLastCalledWith({ employeeId: 'u-2', olderThanHours: 72 });
  });

  it('is a no-op when the filter pair is unchanged', async () => {
    list.mockResolvedValue(page([makeItem()]));
    await run(() => loadApprovalQueue());
    await run(() => setQueueFilter(null, null));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('clearing back to All employees reloads unfiltered', async () => {
    await run(() => setQueueFilter('u-2', null));
    list.mockClear();
    list.mockResolvedValue(page([makeItem({ id: 'q-3' })]));
    await run(() => setQueueFilter(null, null));
    expect(list).toHaveBeenLastCalledWith({});
    expect(probe?.items.map(i => i.id)).toEqual(['q-3']);
  });

  it('clears the previous error so a filtered retry starts clean', async () => {
    list.mockRejectedValue({ message: 'down' });
    await run(() => loadApprovalQueue());
    expect(probe?.error).toBe('down');
    list.mockResolvedValue(page([]));
    await run(() => setQueueFilter('u-2', null));
    expect(probe?.error).toBeNull();
  });
});

describe('clearApprovalQueue (logout reset)', () => {
  it('returns the store to its pre-login state and a late response cannot repopulate it', async () => {
    // The reset bumps the request seq, so an in-flight response resolving
    // after logout must be dropped — a queue row from the old tenant can
    // never flash for the next login.
    let resolveSlow: (v: ReturnType<typeof page>) => void = () => {};
    list.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof page>>(resolve => {
          resolveSlow = resolve;
        }),
    );
    const slow = loadApprovalQueue();
    act(() => {
      clearApprovalQueue();
    });
    expect(probe).toMatchObject({ items: [], hasLoaded: false, isLoading: true });
    await act(async () => {
      resolveSlow(page([makeItem({ id: 'q-late' })]));
      await slow;
    });
    expect(probe?.items).toEqual([]);
    expect(probe?.hasLoaded).toBe(false);
  });

  it('also drops an error that resolved after the reset', async () => {
    let rejectSlow: (e: unknown) => void = () => {};
    list.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof page>>((_, reject) => {
          rejectSlow = reject;
        }),
    );
    const slow = loadApprovalQueue();
    act(() => {
      clearApprovalQueue();
    });
    await act(async () => {
      rejectSlow({ message: 'late failure' });
      await slow;
    });
    expect(probe?.error).toBeNull();
  });
});
