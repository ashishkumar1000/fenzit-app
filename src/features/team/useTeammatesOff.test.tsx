/**
 * Tests for `useTeammatesOff` (Epic 24, story 24-5): the "Also off on these
 * days" line under a leave detail — approved rows overlapping the span minus
 * the requester and the caller, one name per person, and a failure that is
 * NOT the "nobody else is off" fact. The regression this file pins: the read
 * keys off primitive dates, so a caller passing a fresh object literal every
 * render must not restart the request forever (the device bug where the line
 * never painted).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { attendanceLeaveService } from '../../services';
import type { LeaveRequestRow } from '../../services';
import { TEAMMATES_OFF_ERROR, useTeammatesOff } from './useTeammatesOff';

const listOwnerLeave = jest.spyOn(attendanceLeaveService, 'listOwnerLeave');

function row(overrides: Partial<LeaveRequestRow> & { id: string; employeeId: string }): LeaveRequestRow {
  return {
    startDate: '2026-12-15',
    endDate: '2026-12-15',
    part: 'full_day',
    reason: 'Family event',
    status: 'approved',
    workingDays: 1,
    totalDays: 1,
    createdBy: overrides.employeeId,
    createdAt: '2026-11-27T00:00:00Z',
    dates: [{ date: '2026-12-15', state: 'approved' }],
    ...overrides,
  } as LeaveRequestRow;
}

let line: string | null;

function Probe(props: {
  request: { employeeId: string; startDate: string; endDate: string } | null;
  myId: string | null;
  enabled: boolean;
}) {
  line = useTeammatesOff(props).line;
  return null;
}

const REQUEST = { employeeId: 'vijay', startDate: '2026-12-15', endDate: '2026-12-16' };

beforeEach(() => {
  jest.clearAllMocks();
  line = null;
  listOwnerLeave.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
});

describe('useTeammatesOff', () => {
  it('lists the other people off, skipping the requester and the caller', async () => {
    listOwnerLeave.mockResolvedValue({
      data: [
        row({ id: 'r1', employeeId: 'vijay', employeeName: 'Vijay Singh' }),
        row({ id: 'r2', employeeId: 'me', employeeName: 'Me' }),
        row({ id: 'r3', employeeId: 'priya', employeeName: 'Priya Reddy' }),
        row({ id: 'r4', employeeId: 'priya', employeeName: 'Priya Reddy' }),
        row({ id: 'r5', employeeId: 'rekha', employeeName: '  ' }),
      ],
      nextCursor: null,
      hasMore: false,
    });

    await act(async () => {
      create(<Probe request={REQUEST} myId="me" enabled />);
    });

    expect(listOwnerLeave).toHaveBeenCalledWith({
      status: 'approved',
      from: '2026-12-15',
      to: '2026-12-16',
      limit: 50,
    });
    expect(line).toBe('Also off on these days: Priya Reddy');
  });

  it('states the empty fact when nobody else is off', async () => {
    listOwnerLeave.mockResolvedValue({
      data: [row({ id: 'r1', employeeId: 'vijay', employeeName: 'Vijay Singh' })],
      nextCursor: null,
      hasMore: false,
    });

    await act(async () => {
      create(<Probe request={REQUEST} myId="me" enabled />);
    });

    expect(line).toBe('Nobody else in your team is off on these days.');
  });

  it('a failed read is not the empty fact', async () => {
    listOwnerLeave.mockRejectedValue(new Error('offline'));

    await act(async () => {
      create(<Probe request={REQUEST} myId="me" enabled />);
    });

    expect(line).toBe(TEAMMATES_OFF_ERROR);
  });

  it('does not read while closed, and clears the line', async () => {
    await act(async () => {
      create(<Probe request={REQUEST} myId="me" enabled={false} />);
    });
    expect(listOwnerLeave).not.toHaveBeenCalled();
    expect(line).toBeNull();
  });

  it('a fresh request object each render does not restart the read (device regression)', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Probe request={{ ...REQUEST }} myId="me" enabled />);
    });
    expect(listOwnerLeave).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<Probe request={{ ...REQUEST }} myId="me" enabled />);
    });
    await act(async () => {
      tree.update(<Probe request={{ ...REQUEST }} myId="me" enabled />);
    });

    expect(listOwnerLeave).toHaveBeenCalledTimes(1);
    expect(line).toBe('Nobody else in your team is off on these days.');
  });
});
