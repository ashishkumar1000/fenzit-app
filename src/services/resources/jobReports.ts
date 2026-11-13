/**
 * services/resources/jobReports.ts
 * ────────────────────────────────
 * Job reports (Epic 22, story 6): the signed-in employee's OWN created-job
 * numbers from `GET /job-reports/employee`. The owner report
 * (`GET /job-reports/owner`) is web-console territory (story 22-8) — the
 * mobile app only ever calls the employee one.
 *
 * Every figure is computed server-side from job rows in the window; the app
 * only displays what comes back. Window ends are IST calendar days
 * (`YYYY-MM-DD`, inclusive) — the same convention as the owner report. With
 * no params the server uses its default 30-day window ending today.
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `jobs.ts`). Rejects with `ApiError` on failure. Documented failures:
 *   401 (missing/invalid JWT) · 403 (not an employee of this company) ·
 *   422 (window not valid — real dates, ≤ 366 days).
 */
import { apiClient } from '../api/apiClient';

/** `created` — one job = exactly one of these outcomes (BE `countOutcomes`). */
export interface EmployeeReportOutcomes {
  created: number;
  approved: number;
  autoApproved: number;
  rejected: number;
  pending: number;
  cancelled: number;
}

/** One rejection in the reasons list, newest decision first. */
export interface EmployeeReportRejection {
  jobId: string;
  jobNumber: string;
  /** The owner's reason, or null when they declined without one. */
  reason: string | null;
  decidedAt: string;
}

/** `GET /job-reports/employee` response (fenzit-be `EmployeeReportResponse`). */
export interface EmployeeReportResponse {
  range: { from: string; to: string };
  created: EmployeeReportOutcomes;
  /**
   * approved / (approved + rejected) over the window, 0–1 — jobs that needed
   * approval only. null when nothing was decided (the rate is meaningless).
   */
  approvalRate: number | null;
  averageMinutesToDecision: number | null;
  medianMinutesToDecision: number | null;
  /** My jobs scheduled or in progress right now. */
  assignedNow: number;
  /** My jobs completed inside the window. */
  completedInRange: number;
  /** Capped list (50); `rejectionReasonsTotal` is the true count. */
  rejectionReasons: EmployeeReportRejection[];
  rejectionReasonsTotal: number;
}

async function employeeReport(
  query: { from?: string; to?: string } = {},
): Promise<EmployeeReportResponse> {
  const res = await apiClient.get<EmployeeReportResponse>(
    '/job-reports/employee',
    { params: query },
  );
  return res.data;
}

/** The owner dashboard's four required headline counts (CAP-8). */
export interface OwnerReportHeadline {
  /** Jobs created by employees in the window. */
  employeeCreated: number;
  /** Employee-created jobs the owner approved manually. */
  employeeApproved: number;
  /** Employee-created jobs auto-approved (approval off). */
  employeeAutoApproved: number;
  /** Jobs the owner created. */
  ownerCreated: number;
}

/**
 * `GET /job-reports/owner` — the mobile summary reads ONLY the headline and
 * the pending count (reports-dashboard.md: the full dashboard is web-only,
 * story 22-8). The response carries more (pipeline detail, per-employee
 * table); this type names just what the app renders.
 */
export interface OwnerReportSummary {
  range: { from: string; to: string };
  headline: OwnerReportHeadline;
  /** Jobs waiting for the owner's decision right now. */
  pending: number;
}

async function ownerReport(
  query: { from?: string; to?: string } = {},
): Promise<OwnerReportSummary> {
  const res = await apiClient.get<{
    range: { from: string; to: string };
    headline: OwnerReportHeadline;
    // Optional: an older backend predating Epic 22 omits the pipeline
    // object entirely — degrade to "nothing waiting", never a TypeError
    // (every other Epic 22 read follows the same additive rule).
    pipeline?: { pending: number };
  }>('/job-reports/owner', {
    params: query,
  });
  // The API nests the waiting count under `pipeline.pending` (the owner
  // dashboard's pipeline object); the mobile summary surfaces it flat.
  return {
    range: res.data.range,
    headline: res.data.headline,
    pending: res.data.pipeline?.pending ?? 0,
  };
}

export const jobReportService = { employeeReport, ownerReport };
