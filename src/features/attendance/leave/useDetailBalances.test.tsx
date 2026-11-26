/**
 * Hook tests for `useDetailBalances` (23-14; the two-tab redesign, 2026-
 * 11). The services barrel is mocked; a probe renders the hook. Pins: the
 * fetch on open and the null reset; the refreshKey re-fetch for the SAME
 * employeeId (the revoke success morph swaps the refreshed view in without
 * changing the employee — found on device: the sheet kept the pre-write
 * figure); and the sequence guard dropping a stale answer for a newer
 * open.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    getEmployeeBalances: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { attendanceLeaveService } from '../../../services';
import type { LeaveBalanceView } from '../../../services/resources/attendanceLeave';
import { useDetailBalances } from './useDetailBalances';

const getEmployeeBalances = attendanceLeaveService.getEmployeeBalances as jest.Mock;

function balanceRow(name: string, remaining: number): LeaveBalanceView {
  return {
    typeId: `t-${name}`,
    code: 'earned',
    name,
    accrualMode: 'monthly',
    accrualDays: 1,
    paid: true,
    enabled: true,
    credits: 0,
    accrued: remaining + 1,
    carryForward: 0,
    consumed: 1,
    remaining,
  };
}

type Hook = ReturnType<typeof useDetailBalances>;
let latest: Hook;

function Probe({ employeeId, refreshKey = 0 }: { employeeId: string | null; refreshKey?: number }) {
  latest = useDetailBalances(employeeId, refreshKey);
  return null;
}

type Ctx = {
  renderer: ReactTestRenderer.ReactTestRenderer;
  rerender: (employeeId: string | null, refreshKey?: number) => void;
};

function render(employeeId: string | null, refreshKey = 0): Ctx {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const element = (id: string | null, key: number) => (
    <Probe employeeId={id} refreshKey={key} />
  );
  act(() => {
    renderer = create(element(employeeId, refreshKey));
  });
  return {
    renderer,
    rerender(id, key = 0) {
      act(() => {
        renderer.update(element(id, key));
      });
    },
  };
}

/** Flushes the microtask chain inside act. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  });
}

describe('useDetailBalances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches on open, reports loading, and lands the rows', async () => {
    getEmployeeBalances.mockResolvedValue([balanceRow('Earned Leave', 6)]);
    render('e1');
    expect(latest.loading).toBe(true);
    await settle();
    expect(getEmployeeBalances).toHaveBeenCalledWith('e1');
    expect(latest.loading).toBe(false);
    expect(latest.error).toBeNull();
    expect(latest.balances).toHaveLength(1);
  });

  it('a closed sheet resets to empty without a fetch', async () => {
    getEmployeeBalances.mockResolvedValue([balanceRow('Earned Leave', 6)]);
    const ctx = render('e1');
    await settle();
    ctx.rerender(null);
    expect(latest.balances).toEqual([]);
    expect(latest.loading).toBe(false);
    expect(getEmployeeBalances).toHaveBeenCalledTimes(1);
  });

  it('the refreshKey re-fetches for the SAME employeeId (the in-place write morph)', async () => {
    getEmployeeBalances
      .mockResolvedValueOnce([balanceRow('Earned Leave', 2.5)])
      .mockResolvedValueOnce([balanceRow('Earned Leave', 3)]);
    const ctx = render('e1');
    await settle();
    expect(latest.balances[0].remaining).toBe(2.5);
    // The revoke write bumps the version; the employeeId is unchanged.
    ctx.rerender('e1', 1);
    expect(latest.loading).toBe(true);
    await settle();
    expect(getEmployeeBalances).toHaveBeenCalledTimes(2);
    expect(latest.balances[0].remaining).toBe(3);
  });

  it('a stale answer for an older open never lands (the sequence guard)', async () => {
    let resolveSlow!: (rows: LeaveBalanceView[]) => void;
    getEmployeeBalances
      .mockImplementationOnce(() => new Promise(resolve => (resolveSlow = resolve)))
      .mockResolvedValueOnce([balanceRow('Sick Leave', 1.5)]);
    const ctx = render('e1');
    ctx.rerender('e2');
    await settle();
    expect(latest.balances[0].name).toBe('Sick Leave');
    // The slow first answer arrives late — it must be dropped.
    await act(async () => {
      resolveSlow([balanceRow('Earned Leave', 6)]);
      await Promise.resolve();
    });
    expect(latest.balances[0].name).toBe('Sick Leave');
    expect(getEmployeeBalances).toHaveBeenCalledTimes(2);
  });

  it('a failed fetch for the NEW employee never leaves the old figures (clear-on-swap)', async () => {
    getEmployeeBalances
      .mockResolvedValueOnce([balanceRow('Earned Leave', 6)])
      .mockRejectedValueOnce(new Error('gone'));
    const ctx = render('e1');
    await settle();
    expect(latest.balances).toHaveLength(1);
    ctx.rerender('e2');
    // Cleared BEFORE the fetch settles — A's rows must not render under
    // B's title (the review, 2026-11-26), failure or not.
    expect(latest.balances).toEqual([]);
    expect(latest.loading).toBe(true);
    await settle();
    expect(latest.balances).toEqual([]);
    expect(latest.error).toBe("Couldn't load balances.");
  });

  it('a failure is a quiet notice, never a blocking error', async () => {
    getEmployeeBalances.mockRejectedValueOnce(new Error('gone'));
    render('e1');
    await settle();
    expect(latest.error).toBe("Couldn't load balances.");
    expect(latest.balances).toEqual([]);
    expect(latest.loading).toBe(false);
  });
});
