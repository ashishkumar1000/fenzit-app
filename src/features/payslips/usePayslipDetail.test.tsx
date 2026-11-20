/**
 * Hook tests for `usePayslipDetail` (story 23-12). The services barrel
 * and `openUrl` are mocked; the poll runs on FAKE timers (the real loop
 * sleeps 5s). Pins: the mount GET (+ transport copy vs the BE's branched
 * 404 copy verbatim); the THREE-state download tap (plan review P1):
 * `none|failed` → POST with a fresh idempotency key then poll,
 * `queued|running` → resume polling with NO re-POST, `ready` → fresh GET
 * + openUrl, never a re-POST of a finished PDF; the poll's terminal
 * states; the 12-tick hard stop with the honest "still generating"
 * notice; and the open flow's failures (dead viewer / failed fresh GET).
 */
jest.mock('../../services', () => ({
  payslipsService: {
    listMyPayslips: jest.fn(),
    getMyPayslip: jest.fn(),
    requestMyPayslipPdf: jest.fn(),
  },
}));

jest.mock('../../utils/linking', () => ({
  openUrl: jest.fn(),
  openMaps: jest.fn(),
  openDialer: jest.fn(),
}));

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { payslipsService } from '../../services';
import { openUrl } from '../../utils/linking';
import type { PayslipView } from '../../services';
import type { PayslipPdfStatus } from '../../services/resources/payrollPayslips';
import type { ApiError } from '../../services/api/apiError';
import {
  PDF_LINK_ERROR,
  PDF_OPEN_ERROR,
  PDF_REQUEST_ERROR,
  PDF_STILL_GENERATING,
  usePayslipDetail,
} from './usePayslipDetail';

const getMyPayslip = payslipsService.getMyPayslip as jest.Mock;
const requestMyPayslipPdf = payslipsService.requestMyPayslipPdf as jest.Mock;
const openUrlMock = openUrl as jest.Mock;

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
    earningLines: [],
    deductionLines: [],
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

type Hook = ReturnType<typeof usePayslipDetail>;
let latest: Hook;

function Probe({ month }: { month: string }) {
  latest = usePayslipDetail(month);
  return null;
}

let root: ReactTestRenderer;

async function mount(month = '2026-10') {
  await act(async () => {
    root = create(<Probe month={month} />);
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

/** The GET's pdf status — the test flips this between poll advances. */
let pdfStatusValue: PayslipPdfStatus;

function detailPayslip(): PayslipView {
  return makePayslip({
    pdf: {
      status: pdfStatusValue,
      ...(pdfStatusValue === 'ready' ? { url: 'https://pdf.example/x' } : {}),
    },
  });
}

describe('usePayslipDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openUrlMock.mockResolvedValue(undefined);
    requestMyPayslipPdf.mockResolvedValue({
      id: 'pr-1',
      status: 'queued',
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    pdfStatusValue = 'none';
    getMyPayslip.mockImplementation(() => Promise.resolve(detailPayslip()));
  });

  afterEach(async () => {
    // act-wrapped: a pending poll tick's setState must flush inside act.
    await act(async () => {
      root?.unmount();
    });
    jest.useRealTimers();
  });

  it('the mount GET fills the payslip and clears the skeleton', async () => {
    await mount();
    expect(getMyPayslip).toHaveBeenCalledWith('2026-10');
    expect(latest.payslip?.month).toBe('2026-10');
    expect(latest.isLoading).toBe(false);
    expect(latest.error).toBeNull();
  });

  it('a server failure renders the BE\'s branched 404 copy VERBATIM', async () => {
    getMyPayslip.mockRejectedValueOnce(
      apiErr({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'No payroll run covers 2026-10 yet.',
      }),
    );
    await mount();
    expect(latest.error).toBe('No payroll run covers 2026-10 yet.');
    expect(latest.payslip).toBeNull();
  });

  it('a transport failure renders the FE-owned copy', async () => {
    getMyPayslip.mockRejectedValueOnce(apiErr({ code: 'NETWORK_ERROR' }));
    await mount();
    expect(latest.error).toBe("Couldn't load the payslip. Try again.");
  });

  describe('the three-state download tap', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('`none` → POST with a fresh idempotency key, then the poll runs to ready', async () => {
      await mount();
      await flush();
      pdfStatusValue = 'queued';
      await act(async () => {
        latest.downloadPdf();
      });
      expect(requestMyPayslipPdf).toHaveBeenCalledTimes(1);
      expect(requestMyPayslipPdf).toHaveBeenCalledWith(
        '2026-10',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
      expect(latest.pdfBusy).toBe(true);

      // tick(0) saw queued → one 5s sleep → tick(1) re-reads.
      pdfStatusValue = 'ready';
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      await flush();
      expect(getMyPayslip).toHaveBeenCalledTimes(3); // mount + tick0 + tick1
      expect(latest.pdfBusy).toBe(false);
      expect(latest.pdfNotice).toBeNull();
    });

    it('`ready` → fresh GET + openUrl; a finished PDF is NEVER re-POSTed', async () => {
      pdfStatusValue = 'ready';
      await mount();
      await flush();
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(requestMyPayslipPdf).not.toHaveBeenCalled();
      expect(openUrlMock).toHaveBeenCalledWith('https://pdf.example/x');
      expect(latest.isOpening).toBe(false);
      expect(latest.openError).toBeNull();
    });

    it('`queued` → the poll RESUMES with no re-POST (the request exists)', async () => {
      pdfStatusValue = 'queued';
      await mount();
      await flush();
      await act(async () => {
        latest.downloadPdf();
      });
      expect(requestMyPayslipPdf).not.toHaveBeenCalled();
      expect(latest.pdfBusy).toBe(true);

      pdfStatusValue = 'ready';
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      await flush();
      expect(latest.pdfBusy).toBe(false);
    });

    it('`failed` → a fresh POST (failure never blocks a retry), then the poll', async () => {
      pdfStatusValue = 'failed';
      await mount();
      await flush();
      await act(async () => {
        latest.downloadPdf();
      });
      expect(requestMyPayslipPdf).toHaveBeenCalledTimes(1);

      pdfStatusValue = 'ready';
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      await flush();
      expect(latest.pdfBusy).toBe(false);
    });

    it('a POST rejection renders the server message VERBATIM (or the transport copy)', async () => {
      await mount();
      await flush();
      requestMyPayslipPdf.mockRejectedValueOnce(
        apiErr({
          status: 429,
          code: 'REPORT_IN_FLIGHT_LIMIT',
          message: 'Too many PDF requests right now — try again shortly.',
        }),
      );
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(latest.openError).toBe(
        'Too many PDF requests right now — try again shortly.',
      );
      expect(latest.pdfBusy).toBe(false);

      requestMyPayslipPdf.mockRejectedValueOnce(
        apiErr({ code: 'NETWORK_ERROR' }),
      );
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(latest.openError).toBe(PDF_REQUEST_ERROR);
    });

    it('the poll hard-stops at 12 ticks with the honest still-generating notice', async () => {
      await mount();
      await flush();
      pdfStatusValue = 'queued';
      await act(async () => {
        latest.downloadPdf();
      });
      // tick(0)…tick(11): 11 sleeps of 5s; tick(11) hits the cap.
      for (let i = 0; i < 11; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          jest.advanceTimersByTime(5_000);
        });
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
      expect(latest.pdfBusy).toBe(false);
      expect(latest.pdfNotice).toBe(PDF_STILL_GENERATING);
    });

    it('a terminal poll result (failed) clears the busy state with no notice', async () => {
      await mount();
      await flush();
      pdfStatusValue = 'queued';
      await act(async () => {
        latest.downloadPdf();
      });
      pdfStatusValue = 'failed';
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      await flush();
      expect(latest.pdfBusy).toBe(false);
      expect(latest.pdfNotice).toBeNull();
    });

    it('a colliding in-flight GET (the null read) SKIPS the tick — the poll never settles as `none` (Sally F5)', async () => {
      // The mount GET never lands — a focus refetch holds the lane, so
      // every poll tick's fetchDetail resolves null via the in-flight
      // guard (the real collision path, not a fabricated null body).
      getMyPayslip.mockImplementation(() => new Promise(() => undefined));
      await mount();
      await flush();
      await act(async () => {
        latest.downloadPdf(); // payslip unknown → treated as `none` → POST + poll
      });
      expect(requestMyPayslipPdf).toHaveBeenCalledTimes(1);
      expect(latest.pdfBusy).toBe(true);
      // Three ticks pass on the held lane: each read is skipped, the poll
      // keeps sleeping — the button must not flip while nothing settled.
      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          jest.advanceTimersByTime(5_000);
        });
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
      expect(getMyPayslip).toHaveBeenCalledTimes(1); // the held mount GET only
      expect(latest.pdfBusy).toBe(true);
      expect(latest.pdfNotice).toBeNull();
      // The cap still bounds the loop — the honest notice lands (ticks 1-11
      // skip; tick 11 hits the cap).
      for (let i = 0; i < 9; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          jest.advanceTimersByTime(5_000);
        });
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
      expect(latest.pdfBusy).toBe(false);
      expect(latest.pdfNotice).toBe(PDF_STILL_GENERATING);
    });
  });

  describe('the open flow', () => {
    it('a dead viewer surfaces the retryable open error', async () => {
      pdfStatusValue = 'ready';
      await mount();
      await flush();
      openUrlMock.mockRejectedValueOnce(new Error('dead viewer'));
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(latest.openError).toBe(PDF_OPEN_ERROR);
      expect(latest.isOpening).toBe(false);
    });

    it('a fresh GET without a URL (presign gone) is the LINK error, not openUrl', async () => {
      pdfStatusValue = 'ready'; // the LOOKED-AT status routes the tap to open
      await mount();
      await flush();
      // The open flow's fresh GET: ready but presign-less (url absent).
      getMyPayslip.mockImplementationOnce(() =>
        Promise.resolve(makePayslip({ pdf: { status: 'ready' } })),
      );
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(openUrlMock).not.toHaveBeenCalled();
      expect(latest.openError).toBe(PDF_LINK_ERROR);
    });

    it('a failed fresh GET during open is the LINK error too', async () => {
      pdfStatusValue = 'ready';
      await mount();
      await flush();
      getMyPayslip.mockRejectedValueOnce(apiErr({ code: 'NETWORK_ERROR' }));
      await act(async () => {
        latest.downloadPdf();
      });
      await flush();
      expect(latest.openError).toBe(PDF_LINK_ERROR);
    });
  });
});
