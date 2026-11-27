/**
 * Tests for `useTeamJobQueue` (Epic 24, story 24-5): the read is the pending
 * approval list narrowed with `teamOnly` (a viewer's company-wide read grant
 * must never widen it), load-more appends without duplicates, and a decision
 * removes the row — a `JOB_NOT_PENDING` 409 becomes the shipped
 * "already handled" notice plus a refetch, a transport failure gets the
 * offline line, anything else keeps the row and says why.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { jobService } from '../../services';
import type { ApiJob } from '../../services';
import { JOB_ALREADY_HANDLED_NOTICE, JOB_QUEUE_ERROR, useTeamJobQueue } from './useTeamJobQueue';

jest
  .spyOn(AccessibilityInfo, 'announceForAccessibility')
  .mockImplementation(() => undefined);

const list = jest.spyOn(jobService, 'list');
const decidePending = jest.spyOn(jobService, 'decidePending');

function job(overrides: Partial<ApiJob> & { id: string }): ApiJob {
  return {
    jobNumber: 'JB-2026-0001',
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 'u1',
    serviceLocation: 'HQ Whitefield',
    skill: null,
    scheduledStart: '2026-12-10T04:30:00Z',
    scheduledEnd: null,
    status: 'pending_approval',
    createdBy: 'u1',
    createdAt: '2026-11-27T00:00:00Z',
    ...overrides,
  } as ApiJob;
}

type Queue = ReturnType<typeof useTeamJobQueue>;
let queue: Queue;

function Probe(props: { enabled: boolean }) {
  queue = useTeamJobQueue(props);
  return null;
}

async function mount(props: { enabled?: boolean } = {}) {
  await act(async () => {
    create(<Probe enabled={props.enabled ?? true} />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
});

describe('useTeamJobQueue — read', () => {
  it('asks for pending employee jobs in the caller branch only', async () => {
    list.mockResolvedValue({
      data: [job({ id: 'j1' })],
      nextCursor: null,
      hasMore: false,
    });

    await mount();

    expect(list).toHaveBeenCalledWith({
      scope: 'all',
      status: ['pending_approval'],
      teamOnly: true,
      limit: 20,
    });
    expect(queue.items.map(item => item.id)).toEqual(['j1']);
  });

  it('does not read while the segment is closed', async () => {
    await mount({ enabled: false });
    expect(list).not.toHaveBeenCalled();
  });

  it('a failed first page is an error with Retry, and a refresh failure keeps the rows', async () => {
    list.mockRejectedValueOnce(new Error('offline'));
    await mount();
    expect(queue.error).toBe(JOB_QUEUE_ERROR);

    list.mockResolvedValueOnce({
      data: [job({ id: 'j1' })],
      nextCursor: null,
      hasMore: false,
    });
    await act(async () => {
      queue.retry();
    });
    expect(queue.error).toBeNull();
    expect(queue.items.map(item => item.id)).toEqual(['j1']);

    list.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      queue.onRefresh();
    });
    expect(queue.error).toBe(JOB_QUEUE_ERROR);
    expect(queue.items.map(item => item.id)).toEqual(['j1']);
  });

  it('load-more passes the cursor and never duplicates a row', async () => {
    list
      .mockResolvedValueOnce({
        data: [job({ id: 'j1' })],
        nextCursor: 'c1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [job({ id: 'j1' }), job({ id: 'j2' })],
        nextCursor: null,
        hasMore: false,
      });

    await mount();
    await act(async () => {
      await queue.loadMore();
    });

    expect(list).toHaveBeenLastCalledWith({
      scope: 'all',
      status: ['pending_approval'],
      teamOnly: true,
      cursor: 'c1',
      limit: 20,
    });
    expect(queue.items.map(item => item.id)).toEqual(['j1', 'j2']);
  });
});

describe('useTeamJobQueue — decisions', () => {
  const pending = job({ id: 'j1' });

  async function mountWithRow() {
    list.mockResolvedValue({ data: [pending], nextCursor: null, hasMore: false });
    await mount();
  }

  it('approve removes the decided job', async () => {
    decidePending.mockResolvedValue({ ...pending, status: 'scheduled' });
    await mountWithRow();

    let result!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      result = await queue.decide(pending, 'approve');
    });

    expect(decidePending).toHaveBeenCalledWith('j1', 'approve', undefined);
    expect(result).toEqual({ ok: true });
    expect(queue.items).toEqual([]);
  });

  it('decline passes the reason through and drops the row', async () => {
    decidePending.mockResolvedValue({ ...pending, status: 'cancelled' });
    await mountWithRow();

    await act(async () => {
      await queue.decide(pending, 'reject', 'Slot is wrong');
    });

    expect(decidePending).toHaveBeenCalledWith('j1', 'reject', 'Slot is wrong');
    expect(queue.items).toEqual([]);
  });

  it('a JOB_NOT_PENDING 409 becomes the already-handled notice plus a refetch', async () => {
    await mountWithRow();
    decidePending.mockRejectedValue({
      status: 409,
      code: 'JOB_NOT_PENDING',
      message: 'x',
    });
    list.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    let result!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      result = await queue.decide(pending, 'approve');
    });

    expect(result).toEqual({ ok: false, kind: 'handled', message: JOB_ALREADY_HANDLED_NOTICE });
    expect(queue.notice).toBe(JOB_ALREADY_HANDLED_NOTICE);
    expect(queue.items).toEqual([]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('a transport failure says offline; any other refusal keeps the row and says why', async () => {
    await mountWithRow();
    decidePending.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });

    let offline!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      offline = await queue.decide(pending, 'approve');
    });
    expect(offline).toEqual({
      ok: false,
      kind: 'error',
      message: "Couldn't reach the server. Check your connection and try again.",
    });
    expect(queue.items.map(item => item.id)).toEqual(['j1']);

    decidePending.mockRejectedValueOnce({ status: 403, code: 'FORBIDDEN', message: 'Not your job' });
    await act(async () => {
      await queue.decide(pending, 'reject');
    });
    expect(queue.actionError).toBe('Not your job');
    expect(queue.items.map(item => item.id)).toEqual(['j1']);
  });
});
