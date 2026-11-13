/**
 * `jobReports` service — the two report reads' wire shape.
 *
 * The owner mapper is a pin against a real bug (2026-11-13): the BE nests
 * the waiting count under `pipeline.pending`, and an earlier FE version read
 * a top-level `pending` — the strip's "N waiting" row never showed. These
 * tests break if the mapper ever reverts to passing the payload through.
 *
 * The `decidePending` wire contract lives in `jobs-service.test.ts` —
 * that file owns the `/jobs` family.
 */
jest.mock('../src/services/api/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

import { jobReportService } from '../src/services/resources/jobReports';
import { apiClient } from '../src/services/api/apiClient';

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  get.mockReset();
});

describe('ownerReport', () => {
  it('surfaces the BE-nested pipeline.pending as a flat pending count', async () => {
    get.mockResolvedValue({
      data: {
        range: { from: '2026-10-15', to: '2026-11-13' },
        headline: {
          employeeCreated: 11,
          employeeApproved: 5,
          employeeAutoApproved: 3,
          ownerCreated: 10,
        },
        pipeline: { pending: 1, pendingOverOneDay: 0 },
      },
    });

    const summary = await jobReportService.ownerReport();
    expect(summary.pending).toBe(1);
    expect(summary.headline.employeeCreated).toBe(11);
    expect(summary.range).toEqual({ from: '2026-10-15', to: '2026-11-13' });
  });

  it('reads pending even when the payload carries no other pipeline fields', async () => {
    get.mockResolvedValue({
      data: {
        range: { from: '2026-10-15', to: '2026-11-13' },
        headline: {
          employeeCreated: 0,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pipeline: { pending: 7 },
      },
    });
    expect((await jobReportService.ownerReport()).pending).toBe(7);
  });

  it('degrades to "nothing waiting" when the payload has no pipeline object at all (older backend)', async () => {
    // Additive rule: a pre-Epic-22 backend omits `pipeline` entirely — the
    // mapper must read nothing and return 0, never a TypeError that the
    // hook's catch would swallow into a permanently hidden strip.
    get.mockResolvedValue({
      data: {
        range: { from: '2026-10-15', to: '2026-11-13' },
        headline: {
          employeeCreated: 2,
          employeeApproved: 1,
          employeeAutoApproved: 0,
          ownerCreated: 1,
        },
      },
    });
    const summary = await jobReportService.ownerReport();
    expect(summary.pending).toBe(0);
    expect(summary.headline.employeeCreated).toBe(2);
  });

  it('sends the explicit window params the caller asks for', async () => {
    get.mockResolvedValue({
      data: {
        range: { from: '2026-11-07', to: '2026-11-13' },
        headline: {
          employeeCreated: 1,
          employeeApproved: 1,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pipeline: { pending: 0 },
      },
    });
    await jobReportService.ownerReport({ from: '2026-11-07', to: '2026-11-13' });
    expect(get).toHaveBeenCalledWith('/job-reports/owner', {
      params: { from: '2026-11-07', to: '2026-11-13' },
    });
  });

  it('sends no params for the default (last-30-days) window', async () => {
    get.mockResolvedValue({
      data: {
        range: { from: '2026-10-15', to: '2026-11-13' },
        headline: {
          employeeCreated: 0,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pipeline: { pending: 0 },
      },
    });
    await jobReportService.ownerReport();
    expect(get).toHaveBeenCalledWith('/job-reports/owner', { params: {} });
  });
});

describe('employeeReport', () => {
  it('sends the window params and returns the payload as-is', async () => {
    const payload = {
      range: { from: '2026-11-07', to: '2026-11-13' },
      created: {
        created: 9,
        approved: 6,
        autoApproved: 0,
        rejected: 3,
        pending: 0,
        cancelled: 0,
      },
      approvalRate: 0.67,
      averageMinutesToDecision: 4,
      medianMinutesToDecision: 3,
      assignedNow: 14,
      completedInRange: 0,
      rejectionReasons: [],
      rejectionReasonsTotal: 0,
    };
    get.mockResolvedValue({ data: payload });

    const report = await jobReportService.employeeReport({
      from: '2026-11-07',
      to: '2026-11-13',
    });
    expect(get).toHaveBeenCalledWith('/job-reports/employee', {
      params: { from: '2026-11-07', to: '2026-11-13' },
    });
    expect(report).toEqual(payload);
  });
});
