/**
 * Hook tests for `useMyPayslips` (story 23-12). The services barrel is
 * mocked; pins: initial skeleton state, the focus-load TTL throttle
 * (15s window, `force` bypasses it), the in-flight latch (a second load
 * while one is pending is a no-op — one GET), the FE-owned transport
 * copy vs the server's message verbatim, the error path KEEPING existing
 * rows, and the refresh flag semantics (isRefreshing only when rows
 * exist to dim).
 */
jest.mock('../../services', () => ({
  payslipsService: {
    listMyPayslips: jest.fn(),
    getMyPayslip: jest.fn(),
    requestMyPayslipPdf: jest.fn(),
  },
}));

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { payslipsService } from '../../services';
import type { PayslipView } from '../../services';
import type { ApiError } from '../../services/api/apiError';
import { PAYSLIPS_LOAD_ERROR, useMyPayslips } from './useMyPayslips';

const listMyPayslips = payslipsService.listMyPayslips as jest.Mock;

function makePayslip(overrides: Partial<PayslipView> = {}): PayslipView {
  return {
    id: 'ps-1',
    membershipId: 'm-1',
    runId: 'run-1',
    month: '2026-10',
    slipNumber: 'PS-2026-10-0001',
    employeeName: 'Ajay Sharma',
    employeeCode: 'EMP-042',
    fatherName: null,
    motherName: null,
    spouseName: null,
    designation: null,
    department: null,
    pan: null,
    uanNumber: null,
    bankAccountNumber: null,
    ifscCode: null,
    bankName: null,
    dateOfJoining: null,
    establishmentName: null,
    establishmentAddress: null,
    wagePeriodStart: null,
    wagePeriodEnd: null,
    divisorConvention: null,
    cutoffDay: 25,
    payDate: 5,
    payableDays: 26,
    lopDays: 0,
    paidDays: 26,
    daysWorked: null,
    grossEarnings: 50000,
    pfEmployee: 1800,
    pfEmployer: 1800,
    tds: 0,
    otherDeductions: 0,
    totalDeductions: 1900,
    netWages: 48100,
    earningLines: [{ name: 'Basic', amount: 20000 }],
    deductionLines: [{ source: 'pf_employee', amount: 1800 }],
    leaveBalances: [],
    warnings: [],
    createdAt: '2026-11-05T10:00:00.000Z',
    pdf: { status: 'none' },
    ...overrides,
  };
}

function apiErr(overrides: Partial<ApiError> = {}): ApiError {
  return { status: 0, code: 'NETWORK_ERROR', message: '', ...overrides };
}

type Hook = ReturnType<typeof useMyPayslips>;
let latest: Hook;

function Probe() {
  latest = useMyPayslips();
  return null;
}

let root: ReactTestRenderer;

async function mount() {
  await act(async () => {
    root = create(<Probe />);
  });
}

function makeListResult(rows: PayslipView[]) {
  return () => Promise.resolve(rows);
}

describe('useMyPayslips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    root?.unmount();
  });

  it('starts on the skeleton state (isLoading true, no rows, no error)', async () => {
    listMyPayslips.mockImplementation(makeListResult([]));
    await mount();
    expect(latest.isLoading).toBe(true);
    expect(latest.payslips).toEqual([]);
    expect(latest.error).toBeNull();
    expect(latest.isRefreshing).toBe(false);
  });

  it('a successful load fills the rows and clears loading', async () => {
    listMyPayslips.mockImplementation(makeListResult([makePayslip()]));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(1);
    expect(latest.payslips).toHaveLength(1);
    expect(latest.isLoading).toBe(false);
    expect(latest.error).toBeNull();
  });

  it('an empty list is the honest no-locks state — never an error', async () => {
    listMyPayslips.mockImplementation(makeListResult([]));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.isLoading).toBe(false);
    expect(latest.payslips).toEqual([]);
    expect(latest.error).toBeNull();
  });

  it('the second load inside the TTL window is throttled (one GET)', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    listMyPayslips.mockImplementation(makeListResult([makePayslip()]));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(1);

    // Two seconds later — inside the 15s window: skipped.
    nowSpy.mockReturnValue(3_000);
    await act(async () => {
      latest.load();
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(1);
  });

  it('a load past the TTL window re-fetches', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    listMyPayslips.mockImplementation(makeListResult([makePayslip()]));
    await mount();
    await act(async () => {
      latest.load();
    });

    nowSpy.mockReturnValue(1_000 + 15_001);
    await act(async () => {
      latest.load();
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(2);
  });

  it('refresh() bypasses the TTL throttle', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    listMyPayslips.mockImplementation(makeListResult([makePayslip()]));
    await mount();
    await act(async () => {
      latest.load();
    });

    nowSpy.mockReturnValue(1_500); // well inside the window
    await act(async () => {
      latest.refresh();
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(2);
    expect(latest.error).toBeNull();
  });

  it('a load while one is pending is a no-op (the in-flight latch)', async () => {
    let resolveList: (rows: PayslipView[]) => void = () => {};
    listMyPayslips.mockImplementation(
      () =>
        new Promise<PayslipView[]>(resolve => {
          resolveList = resolve;
        }),
    );
    await mount();
    await act(async () => {
      latest.load();
      latest.load(); // second tap inside the same window — no second GET
    });
    expect(listMyPayslips).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveList([makePayslip()]);
    });
    expect(latest.payslips).toHaveLength(1);
    expect(latest.isLoading).toBe(false);
  });

  it('refresh with rows dims via isRefreshing while isLoading stays false', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    listMyPayslips.mockResolvedValue([makePayslip()]);
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.isLoading).toBe(false);

    // The refresh's GET is held pending — assert the mid-flight flags.
    nowSpy.mockReturnValue(1_000 + 15_001);
    let resolveRefresh: (rows: PayslipView[]) => void = () => {};
    listMyPayslips.mockImplementation(
      () =>
        new Promise<PayslipView[]>(resolve => {
          resolveRefresh = resolve;
        }),
    );
    await act(async () => {
      latest.refresh();
    });
    expect(latest.isLoading).toBe(false); // rows exist — never the skeleton
    expect(latest.isRefreshing).toBe(true);

    await act(async () => {
      resolveRefresh([makePayslip()]);
    });
    expect(latest.isRefreshing).toBe(false);
    expect(latest.payslips).toHaveLength(1);
  });

  it('a transport failure renders the FE-owned copy verbatim', async () => {
    listMyPayslips.mockRejectedValue(apiErr({ code: 'NETWORK_ERROR' }));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.error).toBe(PAYSLIPS_LOAD_ERROR);
    expect(latest.isLoading).toBe(false);
    expect(latest.isRefreshing).toBe(false);
  });

  it('a timeout maps to the same transport copy', async () => {
    listMyPayslips.mockRejectedValue(apiErr({ code: 'TIMEOUT' }));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.error).toBe(PAYSLIPS_LOAD_ERROR);
  });

  it('a server failure renders the server message VERBATIM (render-never-reword)', async () => {
    listMyPayslips.mockRejectedValue(
      apiErr({ code: 'SERVER_ERROR', message: 'Payslips are unavailable right now.' }),
    );
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.error).toBe('Payslips are unavailable right now.');
  });

  it('a server failure with an empty message falls back to the transport copy', async () => {
    listMyPayslips.mockRejectedValue(apiErr({ code: 'SERVER_ERROR', message: '' }));
    await mount();
    await act(async () => {
      latest.load();
    });
    expect(latest.error).toBe(PAYSLIPS_LOAD_ERROR);
  });

  it('a failed load keeps the rows already on screen', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    listMyPayslips.mockImplementation(makeListResult([makePayslip()]));
    await mount();
    await act(async () => {
      latest.load();
    });

    nowSpy.mockReturnValue(1_000 + 15_001);
    listMyPayslips.mockRejectedValue(apiErr({ code: 'NETWORK_ERROR' }));
    await act(async () => {
      latest.load();
    });
    expect(latest.error).toBe(PAYSLIPS_LOAD_ERROR);
    expect(latest.payslips).toHaveLength(1);
    expect(latest.isLoading).toBe(false);
  });
});
