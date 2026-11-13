/**
 * `useMyJobReport` — the employee's "My jobs" summary numbers (Epic 22).
 *
 * Local-state hook (NOT a store): the card is its only reader. The suite
 * pins the window math (`from` = `to` − (N−1) IST days), the seq guard (a
 * stale response from a switched window never lands), the `enabled` gate
 * (the collapsed card fetches nothing) and the failure path.
 *
 * `../src/services` is mocked at the barrel; the IST utils stay REAL so the
 * window params are exact. The clock is pinned to 2026-11-13T14:30:00Z —
 * 20:00 IST, so `istTodayDate()` reads `2026-11-13`.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/services', () => ({
  jobReportService: { employeeReport: jest.fn() },
}));

import { useMyJobReport, type ReportRangeDays } from '../src/features/technicianApp/useMyJobReport';
import { jobReportService } from '../src/services';
import type { EmployeeReportResponse } from '../src/services';

const employeeReport = jobReportService.employeeReport as jest.Mock;

/** 2026-11-13T14:30:00Z = 20:00 IST on 13 Nov 2026. */
const CLOCK = Date.parse('2026-11-13T14:30:00.000Z');
const TODAY = '2026-11-13';

const makeReport = (overrides: Partial<EmployeeReportResponse> = {}): EmployeeReportResponse => ({
  range: { from: '2026-10-15', to: TODAY },
  created: { created: 9, approved: 6, autoApproved: 0, rejected: 3, pending: 0, cancelled: 0 },
  approvalRate: 0.67,
  averageMinutesToDecision: 4,
  medianMinutesToDecision: 3,
  assignedNow: 14,
  completedInRange: 0,
  rejectionReasons: [],
  rejectionReasonsTotal: 0,
  ...overrides,
} as EmployeeReportResponse);

let probe: ReturnType<typeof useMyJobReport> | null = null;
let instance: ReactTestRenderer | null = null;

function Probe({ enabled = true, days }: { enabled?: boolean; days?: ReportRangeDays }) {
  probe = useMyJobReport(enabled);
  // The range change is a user event; drive it like the screen does.
  React.useEffect(() => {
    if (days && probe && probe.rangeDays !== days) probe.setRangeDays(days);
  }, [days]);
  return null;
}

async function mount(props: { enabled?: boolean; days?: ReportRangeDays } = {}): Promise<void> {
  await act(async () => {
    instance = create(React.createElement(Probe, props));
  });
}

async function run(fn: () => unknown): Promise<void> {
  await act(async () => {
    await fn();
  });
}

async function remount(props: { enabled?: boolean; days?: ReportRangeDays } = {}): Promise<void> {
  await run(async () => {
    instance?.unmount();
    instance = null;
    probe = null;
  });
  await mount(props);
}

beforeEach(() => {
  jest.useFakeTimers({ now: CLOCK });
  jest.clearAllMocks();
});

afterEach(async () => {
  if (instance) {
    await act(async () => {
      instance?.unmount();
      instance = null;
      probe = null;
    });
  }
  jest.useRealTimers();
});

describe('the enabled gate', () => {
  it('fetches nothing while the card is collapsed (enabled = false)', async () => {
    await mount({ enabled: false });
    expect(employeeReport).not.toHaveBeenCalled();
    expect(probe).toMatchObject({ report: null, isLoading: false, error: null });
  });

  it('starts loading the moment the card expands', async () => {
    employeeReport.mockImplementation(() => new Promise(() => {}));
    await mount({ enabled: true });
    expect(employeeReport).toHaveBeenCalledTimes(1);
    expect(probe?.isLoading).toBe(true);
  });

  it('a fresh mount while collapsed refetches nothing (the fetch is the mounted screen\'s, local state dies with it)', async () => {
    employeeReport.mockResolvedValue(makeReport());
    await mount({ enabled: true });
    await run(() => undefined); // let the fetch settle
    const loaded = probe?.report ?? null;
    expect(loaded).not.toBeNull();

    await run(async () => {
      instance?.unmount();
      instance = null;
      probe = null;
    });
    await mount({ enabled: false });
    // Local state, not a store: the collapsed fresh mount has nothing to
    // show and consults nothing (a re-expansion refetches, tested below).
    expect(employeeReport).toHaveBeenCalledTimes(1);
  });

  it('refetches fresh on re-expansion after a collapse', async () => {
    employeeReport.mockResolvedValue(makeReport());
    await mount({ enabled: true });
    await run(() => undefined);
    await remount({ enabled: false });
    await remount({ enabled: true });
    expect(employeeReport).toHaveBeenCalledTimes(2);
  });
});

describe('the report window', () => {
  it('loads the 30-day window ending today (from = to − 29)', async () => {
    employeeReport.mockResolvedValue(makeReport());
    await mount({ enabled: true });
    expect(employeeReport).toHaveBeenCalledWith({ from: '2026-10-15', to: TODAY });
  });

  it('loads the 7-day window ending today (from = to − 6)', async () => {
    // The default range fires first, then the effect flips to 7 days — the
    // wasted first request is real work (a 30-day GET) and the FINAL state
    // must be the 7-day window's. Exact counts + last call, not just
    // "some call matched" (a toHaveBeenCalledWith alone would pass even
    // with the switch inverted).
    employeeReport.mockResolvedValue(makeReport());
    await mount({ enabled: true, days: 7 });
    await run(() => undefined); // let the second fetch settle
    expect(employeeReport).toHaveBeenCalledTimes(2);
    expect(employeeReport).toHaveBeenLastCalledWith({ from: '2026-11-07', to: TODAY });
    // The reader reflects the fetch's final state: range 7, no error.
    expect(probe?.rangeDays).toBe(7);
    expect(probe?.isLoading).toBe(false);
  });

  it('carries the loaded report and range to the reader', async () => {
    const report = makeReport();
    employeeReport.mockResolvedValue(report);
    await mount({ enabled: true });
    await run(() => undefined);
    expect(probe).toMatchObject({ report, rangeDays: 30, isLoading: false, error: null });
  });
});

describe('switching the window', () => {
  it('refetches with the new window on a range change', async () => {
    employeeReport.mockResolvedValue(makeReport());
    await mount({ enabled: true });
    await run(() => undefined);
    await run(() => probe?.setRangeDays(7));
    expect(employeeReport).toHaveBeenLastCalledWith({ from: '2026-11-07', to: TODAY });
    expect(probe?.rangeDays).toBe(7);
  });

  it('drops the stale response of the old window (seq guard)', async () => {
    // QA race: the 30-day request stalls; the user switches to 7 days, whose
    // response lands; then the 30-day one resolves — it must not overwrite
    // the newer window's report.
    let resolve30: (v: EmployeeReportResponse) => void = () => {};
    employeeReport
      .mockImplementationOnce(
        () =>
          new Promise<EmployeeReportResponse>(resolve => {
            resolve30 = resolve;
          }),
      )
      .mockResolvedValueOnce(makeReport({ range: { from: '2026-11-07', to: TODAY } }));
    await mount({ enabled: true });
    await run(() => probe?.setRangeDays(7));
    expect(probe?.report?.range.from).toBe('2026-11-07');

    await act(async () => {
      resolve30(makeReport({ range: { from: '2026-10-15', to: TODAY } }));
    });
    // Still the 7-day window's report.
    expect(probe?.report?.range.from).toBe('2026-11-07');
    expect(probe?.isLoading).toBe(false);
  });

  it('shows a loader while the switched fetch is in flight', async () => {
    employeeReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise(() => {}));
    await mount({ enabled: true });
    await run(() => undefined);
    await run(() => probe?.setRangeDays(7));
    expect(probe?.isLoading).toBe(true);
  });
});

describe('retry and failure', () => {
  it('surfaces the error message and stops loading on a failed load', async () => {
    employeeReport.mockRejectedValue(new Error('Network request failed'));
    await mount({ enabled: true });
    await run(() => undefined);
    expect(probe).toMatchObject({
      report: null,
      isLoading: false,
      error: 'Network request failed',
    });
  });

  it('maps a non-Error rejection to the plain fallback copy', async () => {
    employeeReport.mockRejectedValue('garbage');
    await mount({ enabled: true });
    await run(() => undefined);
    expect(probe?.error).toBe('Failed to load your job summary.');
  });

  it('retry() refetches the same window after a failure', async () => {
    employeeReport.mockRejectedValueOnce(new Error('down'));
    await mount({ enabled: true });
    await run(() => undefined);
    employeeReport.mockResolvedValue(makeReport());
    await run(() => probe?.refresh());
    expect(employeeReport).toHaveBeenLastCalledWith({ from: '2026-10-15', to: TODAY });
    expect(probe?.error).toBeNull();
    expect(probe?.isLoading).toBe(false);
  });

  it('a failure on a switched window cannot resurrect the old report', async () => {
    // The error path must respect the seq guard too: the 7-day load fails,
    // the stalled 30-day response resolves later — dropped, and no error
    // shown for a window the user left.
    let resolve30: (v: EmployeeReportResponse) => void = () => {};
    employeeReport
      .mockImplementationOnce(
        () =>
          new Promise<EmployeeReportResponse>(resolve => {
            resolve30 = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('down'));
    await mount({ enabled: true });
    await run(() => probe?.setRangeDays(7));
    expect(probe?.error).toBe('down');

    await act(async () => {
      resolve30(makeReport());
    });
    expect(probe?.error).toBe('down'); // unchanged — the stale result was dropped
    expect(probe?.report).toBeNull();
  });
});

describe('unmount safety', () => {
  it('a response landing after unmount never writes state (and React never hears about it)', async () => {
    let resolveFetch: (v: { data: EmployeeReportResponse }) => void = () => {};
    employeeReport.mockImplementation(
      () =>
        new Promise<{ data: EmployeeReportResponse }>(resolve => {
          resolveFetch = resolve;
        }),
    );
    await mount({ enabled: true });
    await run(async () => {
      instance?.unmount();
      instance = null;
      probe = null;
    });
    // React 18 no longer WARNS on setState-after-unmount — the honest pin
    // is "no console.error reached the console" (a post-unmount write that
    // crashes the setState path would surface here).
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => {
        resolveFetch({ data: makeReport() });
      });
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
    // The service was not re-consulted after the unmount either.
    expect(employeeReport).toHaveBeenCalledTimes(1);
  });
});
