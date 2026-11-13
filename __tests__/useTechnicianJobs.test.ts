/**
 * The `useTechnicianJobs` shared store — tested through its exported module
 * functions, read back via a probe component mounted with react-test-renderer
 * (same approach as useJobs.test.ts). `../../services` is mocked so no
 * network/MMKV is touched.
 *
 * The store has NO auto-load effects — the screen's focus effect owns the
 * fetch trigger — so every test loads explicitly. `mountAndLoad()` mounts the
 * probe and settles the page-1 load (Today, unfiltered). Epic 22: the former
 * History slot is gone — the Jobs tab rides the SHARED `useJobs` store (whose
 * own suite covers scope/filter/pagination), so this file covers Today, the
 * optimistic row write and the reset.
 * `clearTechnicianJobs()` between tests resets the module state and
 * invalidates in-flight responses.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobService: { list: jest.fn() },
}));

import {
  clearTechnicianJobs,
  loadToday,
  upsertTechnicianJob,
  useTechnicianJobs,
} from '../src/features/technicianApp/useTechnicianJobs';
import { jobService } from '../src/services';
import type { ApiJob, Paginated } from '../src/services';

const list = jobService.list as jest.Mock;

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: `c-${id}`,
    technicianId: `tech-${id}`,
    serviceLocation: 'Chennai',
    skill: { id: 's-1', name: 'plumbing' },
    scheduledStart: '2026-09-04T04:30:00.000Z',
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

let probe: ReturnType<typeof useTechnicianJobs> | null = null;
function Probe(): null {
  probe = useTechnicianJobs();
  return null;
}

function mountProbe(): void {
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
}

/**
 * Mounts the probe AND settles the page-1 load, the way a screen's first
 * focus effect would. Mocks must be queued before calling.
 */
async function mountAndLoad(): Promise<void> {
  mountProbe();
  await run(() => loadToday());
}

async function run(fn: () => Promise<unknown>): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await fn();
  });
}

/** A synchronous store call, flushed through act so the probe re-renders. */
function apply(fn: () => void): void {
  ReactTestRenderer.act(() => {
    fn();
  });
}

beforeEach(() => {
  list.mockReset();
  clearTechnicianJobs();
});

describe('loadToday', () => {
  it('calls GET /jobs with no params (server scopes to the caller)', async () => {
    list.mockResolvedValue(page([makeJob('j1')], null));
    mountProbe();
    await run(() => loadToday());
    expect(list).toHaveBeenCalledWith({});
    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
    expect(probe?.hasLoadedToday).toBe(true);
  });

  it('throttles a repeat load within the TTL, but force bypasses it', async () => {
    list.mockResolvedValue(page([], null));
    mountProbe();
    await run(() => loadToday());
    expect(list).toHaveBeenCalledTimes(1);
    await run(() => loadToday()); // throttled — no second call
    expect(list).toHaveBeenCalledTimes(1);
    await run(() => loadToday({ force: true }));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('queues a forced refresh behind the in-flight load instead of joining it', async () => {
    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(new Promise<Paginated<ApiJob>>(resolve => (resolveList = resolve)));

    mountProbe();
    const first = loadToday(); // load 1 in flight
    const queued = loadToday({ force: true }); // queues behind it
    resolveList(page([makeJob('j1')], null));

    // The queue re-issues the load after the first settles → second call.
    await run(() => Promise.all([first, queued]));
    expect(list).toHaveBeenCalledTimes(2);
    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
  });
});

describe('upsertTechnicianJob', () => {
  beforeEach(() => {
    list.mockResolvedValue(page([makeJob('j1')], null));
  });

  it('replaces the row Today holds', async () => {
    await mountAndLoad();

    apply(() => {
      upsertTechnicianJob(makeJob('j1', { status: 'in_progress' }));
    });

    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
    expect(probe?.today[0].status).toBe('in_progress');
  });

  it('does NOT hand-rebalance a completed job out of Today', async () => {
    await mountAndLoad();

    apply(() => upsertTechnicianJob(makeJob('j1', { status: 'completed' })));

    // Upsert-in-place only: the next load picks the row up server-side.
    expect(probe?.today[0].status).toBe('completed');
    expect(probe?.today).toHaveLength(1);
  });

  it('ignores a row Today does not hold', async () => {
    await mountAndLoad();

    apply(() => upsertTechnicianJob(makeJob('unknown', { status: 'completed' })));

    expect(probe?.today.map(j => j.id)).toEqual(['j1']);
  });

  it('a load that started before an optimistic upsert does not revert it', async () => {
    // Real Epic 3 flow: the row is on screen, the user acts on it, and a
    // refresh fired just before the action is still in flight.
    await mountAndLoad();

    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(new Promise<Paginated<ApiJob>>(resolve => (resolveList = resolve)));
    const loading = loadToday({ force: true }); // load 2 in flight…

    // The optimistic row write lands while the load is still away.
    apply(() => upsertTechnicianJob(makeJob('j1', { status: 'in_progress' })));

    resolveList(page([makeJob('j1', { status: 'scheduled' })], null));
    await run(() => loading);

    // The response predates the mutation — committing it would silently
    // revert the optimistic row until the next refetch.
    expect(probe?.today[0].status).toBe('in_progress');
  });
});

describe('clearTechnicianJobs', () => {
  it('resets the store and discards a late in-flight response', async () => {
    let resolveList!: (p: Paginated<ApiJob>) => void;
    list.mockReturnValue(
      new Promise<Paginated<ApiJob>>(resolve => {
        resolveList = resolve;
      }),
    );

    mountProbe();
    const loading = loadToday();
    expect(probe?.hasLoadedToday).toBe(false);

    clearTechnicianJobs();
    expect(probe?.today).toHaveLength(0);

    // A response that settles after the reset must not commit.
    resolveList(page([makeJob('j1')], null));
    await run(() => loading);
    expect(probe?.today).toHaveLength(0);
    expect(probe?.hasLoadedToday).toBe(false);
  });
});
