/**
 * Tests for `useTeamLeaveQueue` (Epic 24, story 24-5): the subtree read goes
 * out with `status: 'pending'` and the caller's own rows never reach the
 * list; a failed first page is an error + Retry while a failed refresh keeps
 * the rows; load-more appends de-duplicated pages and a failure keeps them;
 * approve/reject remove the row, and a 409 becomes the shipped
 * "already handled" notice plus a refetch (never a dead row).
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { attendanceLeaveService } from '../../services';
import type { LeaveRequestRow } from '../../services';
import { ALREADY_HANDLED_NOTICE, LEAVE_QUEUE_ERROR, useTeamLeaveQueue } from './useTeamLeaveQueue';

jest
  .spyOn(AccessibilityInfo, 'announceForAccessibility')
  .mockImplementation(() => undefined);

const listOwnerLeave = jest.spyOn(attendanceLeaveService, 'listOwnerLeave');
const approveLeave = jest.spyOn(attendanceLeaveService, 'approveLeave');
const rejectLeave = jest.spyOn(attendanceLeaveService, 'rejectLeave');

function row(overrides: Partial<LeaveRequestRow> & { id: string; employeeId: string }): LeaveRequestRow {
  return {
    startDate: '2026-12-15',
    endDate: '2026-12-15',
    part: 'full_day',
    reason: 'Family event',
    status: 'pending',
    workingDays: 1,
    totalDays: 1,
    createdBy: overrides.employeeId,
    createdAt: '2026-11-27T00:00:00Z',
    dates: [{ date: '2026-12-15', state: 'pending' }],
    employeeName: 'Someone',
    ...overrides,
  } as LeaveRequestRow;
}

type Queue = ReturnType<typeof useTeamLeaveQueue>;
let queue: Queue;

function Probe(props: { myId: string | null; enabled: boolean }) {
  queue = useTeamLeaveQueue(props);
  return null;
}

async function mount(props: { myId?: string | null; enabled?: boolean } = {}) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Probe myId={props.myId ?? 'me'} enabled={props.enabled ?? true} />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  listOwnerLeave.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
});

describe('useTeamLeaveQueue — read', () => {
  it('reads the pending subtree page and filters the caller own rows out', async () => {
    listOwnerLeave.mockResolvedValue({
      data: [row({ id: 'mine', employeeId: 'me' }), row({ id: 'theirs', employeeId: 'other' })],
      nextCursor: null,
      hasMore: false,
    });

    await mount({ myId: 'me' });

    expect(listOwnerLeave).toHaveBeenCalledWith({ status: 'pending', limit: 20 });
    expect(queue.items.map(item => item.id)).toEqual(['theirs']);
    expect(queue.loading).toBe(false);
  });

  it('does not read when the segment has never been opened', async () => {
    await mount({ enabled: false });
    expect(listOwnerLeave).not.toHaveBeenCalled();
  });

  it('a failed first page is an error with a working Retry; a failed refresh keeps the rows', async () => {
    listOwnerLeave.mockRejectedValueOnce(new Error('offline'));
    await mount();
    expect(queue.error).toBe(LEAVE_QUEUE_ERROR);
    expect(queue.items).toEqual([]);

    listOwnerLeave.mockResolvedValueOnce({
      data: [row({ id: 'kept', employeeId: 'other' })],
      nextCursor: null,
      hasMore: false,
    });
    await act(async () => {
      queue.retry();
    });
    expect(queue.error).toBeNull();
    expect(queue.items.map(item => item.id)).toEqual(['kept']);

    listOwnerLeave.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      queue.onRefresh();
    });
    expect(queue.error).toBe(LEAVE_QUEUE_ERROR);
    expect(queue.items.map(item => item.id)).toEqual(['kept']);
  });

  it('load-more appends the next page without duplicates and keeps rows on failure', async () => {
    listOwnerLeave
      .mockResolvedValueOnce({
        data: [row({ id: 'a', employeeId: 'o1' })],
        nextCursor: 'c1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [row({ id: 'a', employeeId: 'o1' }), row({ id: 'b', employeeId: 'o2' })],
        nextCursor: 'c2',
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error('offline'));

    await mount();
    expect(queue.items.map(item => item.id)).toEqual(['a']);

    await act(async () => {
      await queue.loadMore();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({
      status: 'pending',
      cursor: 'c1',
      limit: 20,
    });
    expect(queue.items.map(item => item.id)).toEqual(['a', 'b']);
    expect(queue.loadingMore).toBe(false);

    listOwnerLeave.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await queue.loadMore();
    });
    expect(queue.loadMoreError).toBe(true);
    expect(queue.items.map(item => item.id)).toEqual(['a', 'b']);
  });
});

describe('useTeamLeaveQueue — decisions', () => {
  const theirs = row({ id: 'req-1', employeeId: 'other' });

  async function mountWithRow() {
    listOwnerLeave.mockResolvedValue({ data: [theirs], nextCursor: null, hasMore: false });
    await mount();
  }

  it('approve removes the decided row', async () => {
    approveLeave.mockResolvedValue(theirs);
    await mountWithRow();

    let result!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      result = await queue.decide(theirs, 'approve');
    });

    expect(approveLeave).toHaveBeenCalledWith('req-1');
    expect(result).toEqual({ ok: true });
    expect(queue.items).toEqual([]);
  });

  it('decline sends the trimmed reason, and no reason when it is blank', async () => {
    rejectLeave.mockResolvedValue(theirs);
    await mountWithRow();

    await act(async () => {
      await queue.decide(theirs, 'reject', '  Understaffed that day  ');
    });
    expect(rejectLeave).toHaveBeenLastCalledWith('req-1', 'Understaffed that day');

    listOwnerLeave.mockResolvedValue({ data: [theirs], nextCursor: null, hasMore: false });
    await act(async () => {
      queue.retry();
    });
    await act(async () => {
      await queue.decide(theirs, 'reject', '   ');
    });
    expect(rejectLeave).toHaveBeenLastCalledWith('req-1', undefined);
  });

  it('a 409 becomes the already-handled notice, drops the row and re-reads the page', async () => {
    await mountWithRow();
    approveLeave.mockRejectedValue({ status: 409, code: 'LEAVE_NOT_PENDING', message: 'x' });
    // The refetch answers the server's true state — the row is no longer pending.
    listOwnerLeave.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    let result!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      result = await queue.decide(theirs, 'approve');
    });

    expect(result).toEqual({ ok: false, kind: 'handled', message: ALREADY_HANDLED_NOTICE });
    expect(queue.notice).toBe(ALREADY_HANDLED_NOTICE);
    expect(queue.items).toEqual([]);
    expect(listOwnerLeave).toHaveBeenCalledTimes(2);
  });

  it('any other refusal keeps the row and surfaces the server message', async () => {
    await mountWithRow();
    approveLeave.mockRejectedValue({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' });

    let result!: Awaited<ReturnType<Queue['decide']>>;
    await act(async () => {
      result = await queue.decide(theirs, 'approve');
    });

    expect(result).toEqual({ ok: false, kind: 'error', message: 'Not allowed' });
    expect(queue.actionError).toBe('Not allowed');
    expect(queue.items.map(item => item.id)).toEqual(['req-1']);
  });
});
