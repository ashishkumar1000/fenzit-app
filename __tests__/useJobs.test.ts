/**
 * The `useJobs` shared store — tested through its exported module functions,
 * read back via a probe component mounted with react-test-renderer (same
 * approach as App.test.tsx). `../../services` is mocked so no network/MMKV
 * is touched.
 *
 * Mounting the probe auto-loads (the hook's first-mount effect), so each
 * test's first `list` call IS the mount load.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobService: { list: jest.fn(), create: jest.fn() },
}));

import { clearJobs, loadJobs, loadMoreJobs, upsertJob, useJobs } from '../src/features/jobs/useJobs';
import { jobService } from '../src/services';
import type { ApiJob, Paginated } from '../src/services';
import { istDayStartMs } from '../src/utils';

const list = jobService.list as jest.Mock;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * scheduledStart fixtures built from the IST util itself (not the host
 * machine's clock/timezone): 10:00 IST today, or N days from today's IST
 * midnight.
 */
const scheduledTodayIst = () => new Date(istDayStartMs() + 10 * MS_PER_HOUR).toISOString();
const scheduledInDays = (days: number) =>
  new Date(istDayStartMs() + days * MS_PER_DAY + 10 * MS_PER_HOUR).toISOString();

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: `c-${id}`,
    technicianId: `tech-${id}`,
    serviceLocation: 'Chennai',
    skill: { id: 's-1', name: 'plumbing' },
    scheduledStart: scheduledTodayIst(),
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

function page(jobs: ApiJob[], nextCursor: string | null): Paginated<ApiJob> {
  return { data: jobs, nextCursor, hasMore: nextCursor !== null };
}

let probe: ReturnType<typeof useJobs> | null = null;
function Probe(): null {
  probe = useJobs();
  return null;
}

/** Mounts the probe; the auto-load effect fires inside act. */
async function mountProbe(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
}

async function run(fn: () => Promise<unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await fn();
  });
}

beforeEach(() => {
  clearJobs();
  jest.clearAllMocks();
  probe = null;
});

afterEach(() => {
  jest.useRealTimers();
});

it('de-duplicates concurrent loads into one request', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe(); // auto-load #1 is in flight (or done)

  await ReactTestRenderer.act(async () => {
    await Promise.all([loadJobs(), loadJobs(), loadJobs()]);
  });

  expect(list).toHaveBeenCalledTimes(1);
});

it('skips a refetch within 15s of a success (throttle)', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs(); // same filter, fresh enough — must not hit the API again
  });

  expect(list).toHaveBeenCalledTimes(1);
});

it('bypasses the throttle when the filter changes', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('today', 'completed'); // a different query, not a refresh
  });

  expect(list).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', status: ['completed'] });
});

it('bypasses the throttle when the scope changes', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('upcoming'); // a different scope is a different query
  });

  expect(list).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenLastCalledWith({ scope: 'upcoming' });
});

it('bypasses the throttle when forced (pull-to-refresh)', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('today', 'all', { force: true });
  });

  expect(list).toHaveBeenCalledTimes(2);
});

it('omits the status param for the all filter', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  expect(list).toHaveBeenCalledWith({ scope: 'today' });
});

it('throttles per (scope, filter), not globally', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await run(() => loadJobs('today', 'completed')); // success stamps (today, completed)
  expect(list).toHaveBeenCalledTimes(2);

  await run(() => loadJobs('today', 'completed')); // same pair, fresh — throttled
  expect(list).toHaveBeenCalledTimes(2);

  await run(() => loadJobs('upcoming', 'completed')); // same filter, new scope — loads
  expect(list).toHaveBeenCalledTimes(3);

  await run(() => loadJobs('upcoming', 'all')); // same scope, new filter — loads
  expect(list).toHaveBeenCalledTimes(4);
});

it('appends the next page without duplicate ids', async () => {
  list.mockResolvedValueOnce(page([makeJob('a'), makeJob('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([makeJob('b'), makeJob('c')], null));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadMoreJobs();
  });

  expect(probe?.jobs.map(j => j.id)).toEqual(['a', 'b', 'c']);
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', cursor: 'cursor-1' });
});

it('keeps prior jobs and records the error when a load fails', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], 'cursor-1'))
      .mockRejectedValueOnce(Object.assign(new Error('Network offline')));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadMoreJobs();
  });

  expect(probe?.jobs.map(j => j.id)).toEqual(['a']); // rows stay on screen
  expect(probe?.error).toBe('Network offline');
});

it('refetches once the 15s throttle has expired', async () => {
  jest.useFakeTimers();
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();
  expect(list).toHaveBeenCalledTimes(1);

  jest.setSystemTime(Date.now() + 16_000); // past the throttle window
  await run(() => loadJobs());

  expect(list).toHaveBeenCalledTimes(2);
});

it('queues a filter change behind an in-flight page fetch instead of dropping it', async () => {
  let releasePage2!: () => void;
  list.mockResolvedValueOnce(page([makeJob('a'), makeJob('b')], 'cursor-1'))
      // page 2 hangs until the test releases it
      .mockImplementationOnce(
        () =>
          new Promise<Paginated<ApiJob>>(res => {
            releasePage2 = () => res(page([makeJob('b'), makeJob('c')], null));
          }),
      );
  await mountProbe();

  await run(() => {
    void loadMoreJobs(); // page-2 fetch now in flight (hangs until released)
    return Promise.resolve();
  });
  const queued = loadJobs('today', 'completed'); // must queue, not return the page-2 promise

  expect(list).toHaveBeenCalledTimes(2); // no third request until page 2 lands

  releasePage2();
  await run(() => queued);
  expect(list).toHaveBeenCalledTimes(3);
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', status: ['completed'] });
  expect(probe?.filter).toBe('completed');
});

it('hook setScope switches the scope and loads it fresh', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await run(async () => probe!.setScope('history'));

  expect(probe?.scope).toBe('history');
  expect(list).toHaveBeenLastCalledWith({ scope: 'history' });
});

it('hook setScope resets an incompatible chip (the server intersects status into an empty scope)', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await run(async () => probe!.setFilter('completed')); // chip active on Today
  await run(async () => probe!.setScope('upcoming')); // Upcoming fixes status server-side

  expect(probe?.scope).toBe('upcoming');
  expect(probe?.filter).toBe('all'); // the chip must not ride along
  expect(list).toHaveBeenLastCalledWith({ scope: 'upcoming' }); // no status param
});

it('hook setScope keeps a chip History can still show', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await run(async () => probe!.setFilter('completed'));
  await run(async () => probe!.setScope('history'));

  expect(probe?.scope).toBe('history');
  expect(probe?.filter).toBe('completed');
  expect(list).toHaveBeenLastCalledWith({ scope: 'history', status: ['completed'] });
});

it('hook setFilter re-anchors to the current scope and no-ops on the same chip', async () => {
  list.mockResolvedValue(page([], null));
  await mountProbe();

  await run(async () => probe!.setFilter('completed'));

  expect(probe?.filter).toBe('completed');
  expect(list).toHaveBeenLastCalledWith({ scope: 'today', status: ['completed'] });

  await run(async () => probe!.setFilter('completed')); // same chip → no refetch
  expect(list).toHaveBeenCalledTimes(2);
});

it('hook refresh forces the current scope+filter (opts must not land in the filter slot)', async () => {
  list.mockResolvedValue(page([makeJob('a')], null));
  await mountProbe();

  await run(() => probe!.refresh());

  expect(list).toHaveBeenCalledTimes(2); // force bypasses the throttle
  expect(list).toHaveBeenLastCalledWith({ scope: 'today' }); // same query, forced
});

it('clears stale rows when a filter change fails', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null))
      .mockRejectedValueOnce(Object.assign(new Error('boom')));
  await mountProbe();

  await ReactTestRenderer.act(async () => {
    await loadJobs('today', 'completed');
  });

  expect(probe?.jobs).toEqual([]); // old filter's rows must not linger
  expect(probe?.filter).toBe('completed');
  expect(probe?.error).toBe('boom');
});

it('drops the previous scope cursor when the scope changes', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], 'cursor-today'))
      .mockResolvedValueOnce(page([makeJob('b')], null)); // upcoming page 1
  await mountProbe();

  await run(() => loadJobs('upcoming'));

  expect(probe?.scope).toBe('upcoming');
  expect(probe?.hasMore).toBe(false); // the today cursor is gone: nothing left to page
  expect(list).toHaveBeenLastCalledWith({ scope: 'upcoming' });

  await run(() => loadMoreJobs()); // no cursor → no page-2 request
  expect(list).toHaveBeenCalledTimes(2);
});

it('clears stale rows when a scope change fails', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null))
      .mockRejectedValueOnce(Object.assign(new Error('boom')));
  await mountProbe();

  await run(() => loadJobs('history'));

  expect(probe?.jobs).toEqual([]); // old scope's rows must not linger
  expect(probe?.scope).toBe('history');
  expect(probe?.error).toBe('boom');
});

it('keeps prior rows when a failed refresh lands in the same scope', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null))
      .mockRejectedValueOnce(Object.assign(new Error('boom')));
  await mountProbe();

  await run(() => loadJobs('today', 'all', { force: true })); // refresh, not a change

  expect(probe?.jobs.map(j => j.id)).toEqual(['a']); // failed refresh keeps rows
  expect(probe?.error).toBe('boom');
});

it('never re-sends the previous scope cursor with the new scope', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], 'cursor-today'))
      .mockResolvedValueOnce(page([], null));
  await mountProbe();

  await run(() => loadJobs('overdue'));
  await run(() => loadMoreJobs()); // must send scope=overdue, never the old cursor

  expect(list).toHaveBeenLastCalledWith({ scope: 'overdue' });
  expect(list.mock.calls[1][0]).not.toHaveProperty('cursor', 'cursor-today');
});

it('ignores a response that lands after clearJobs (logout race)', async () => {
  let release!: () => void;
  list.mockImplementationOnce(
    () =>
      new Promise<Paginated<ApiJob>>(res => {
        release = () => res(page([makeJob('a')], null));
      }),
  );
  await mountProbe();

  ReactTestRenderer.act(() => {
    clearJobs(); // logout while the GET is still in flight
  });
  release(); // the request settles *after* the reset
  await run(() => Promise.resolve());

  expect(probe?.jobs).toEqual([]); // the late response was ignored
  expect(probe?.hasLoaded).toBe(false);
  expect(probe?.isLoading).toBe(true); // back to the pre-login state
});

it('prepends a created job via upsertJob and honours the active filter', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null)) // mount auto-load (all)
      .mockResolvedValueOnce(page([], null)); // Done filter is empty
  await mountProbe();

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z')); // all filter: anything can be prepended
  });
  expect(probe?.jobs.map(j => j.id)).toEqual(['z', 'a']);

  await ReactTestRenderer.act(async () => {
    await loadJobs('today', 'completed'); // empty Done list
  });
  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z2')); // a scheduled job must not appear under Done
  });
  expect(probe?.jobs).toEqual([]);
});

it('upsertJob updates an EXISTING row in place outside today; an absent id is still dropped', async () => {
  // The old "no-op outside today" framing is gone: the timeline scopes now
  // update a row they already hold (an edit, a completion) IN PLACE —
  // never re-sorted, never appended where its sort position isn't the
  // server's truth; only an absent id waits for the throttled refetch.
  list.mockResolvedValueOnce(page([makeJob('a')], null)) // today mount load
      .mockResolvedValueOnce(page([makeJob('b'), makeJob('c')], null)); // upcoming load
  await mountProbe();

  await run(() => loadJobs('upcoming'));

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('c', { priority: 'urgent', notesForTechnician: 'edited' }));
  });
  // Updated in place, order preserved, nothing appended.
  expect(probe?.jobs.map(j => j.id)).toEqual(['b', 'c']);
  expect(probe?.jobs[1].priority).toBe('urgent');

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z')); // absent id would violate upcoming's sort
  });
  expect(probe?.jobs.map(j => j.id)).toEqual(['b', 'c']); // unchanged
});

it('upsertJob refuses a pending/rejected job under every day scope and chip (CAP-4)', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null));
  await mountProbe();

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('p', { status: 'pending_approval' }));
    upsertJob(makeJob('r', { status: 'rejected' }));
  });
  expect(probe?.jobs.map(j => j.id)).toEqual(['a']); // neither entered

  await run(() => loadJobs('history'));
  ReactTestRenderer.act(() => {
    upsertJob(makeJob('p2', { status: 'pending_approval' }));
  });
  // History's default chip is `all` — which can never hold a pending job
  // (the server's history scope forces completed/cancelled/rejected); the
  // row the History load returned stays, and no pending row joined it.
  expect(probe?.jobs.map(j => j.id)).toEqual(['a']);
  expect(probe?.jobs.some(j => j.status === 'pending_approval')).toBe(false);
});

it('upsertJob feeds the PENDING view (scope all + pending_approval filter) — newest first', async () => {
  // The employee's Pending list rides this same store; a create, a detail
  // refetch or a decision must reach it even inside the 15s throttle.
  list.mockResolvedValueOnce(page([makeJob('a')], null)) // today mount load
      .mockResolvedValueOnce(page([], null)); // pending view load (empty)
  await mountProbe();

  await run(() => loadJobs('all', 'pending_approval'));

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('new-1', { status: 'pending_approval' }));
  });
  // Scope `all` sorts created_at DESC server-side — prepend keeps it.
  expect(probe?.jobs.map(j => j.id)).toEqual(['new-1']);

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('scheduled-x')); // a scheduled job has no business there
  });
  expect(probe?.jobs.map(j => j.id)).toEqual(['new-1']);
});

it('upsertJob updates a row in place under the History Rejected chip; a new rejection waits for the load', async () => {
  const rejected = makeJob('r1', { status: 'rejected' });
  list.mockResolvedValueOnce(page([makeJob('a')], null)) // today mount load
      .mockResolvedValueOnce(page([rejected], null)); // history + rejected load
  await mountProbe();

  await run(() => loadJobs('history', 'rejected'));

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('r1', { status: 'rejected', notesForTechnician: 're-rejected' }));
  });
  expect(probe?.jobs).toHaveLength(1);
  expect(probe?.jobs[0].notesForTechnician).toBe('re-rejected');

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('r2', { status: 'rejected' })); // not in the loaded window
  });
  // History sorts scheduled_start DESC — an absent row cannot be placed
  // without re-sorting, so it waits for the next History load.
  expect(probe?.jobs).toHaveLength(1);
});

it('upsertJob skips a job scheduled for a future day (Today is day-scoped)', async () => {
  list.mockResolvedValueOnce(page([], null));
  await mountProbe();

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z', { scheduledStart: scheduledInDays(3) }));
  });
  expect(probe?.jobs).toEqual([]); // booked three days out → not in today's window
});

it('upsertJob skips a job scheduled outside today, even under the all filter', async () => {
  list.mockResolvedValueOnce(page([makeJob('a')], null));
  await mountProbe();

  ReactTestRenderer.act(() => {
    upsertJob(makeJob('z', { status: 'cancelled', scheduledStart: scheduledInDays(-1) }));
  });
  // Day guard: a job scheduled yesterday is NOT today's window — no prepend.
  expect(probe?.jobs.map(j => j.id)).toEqual(['a']);
});
