/**
 * services/resources/payrollPayslips.ts
 * ────────────────────────────
 * The employee's own payslip self-service (stories 23-8 BE / 23-12 FE,
 * CAP-7 employee leg). A plain function object on the shared `apiClient`
 * (the `reports.ts` shape). Everything here is the `/me` legs — the
 * `payroll.own` permission is employee-only, and the client never
 * assumes own-payslip-only: it renders exactly what the API answers and
 * nothing keyed off `membershipId`/`runId` (routes are month-keyed).
 *
 *   listMyPayslips    GET /payroll/payslips/me — own history, LOCKED
 *                     months only, newest first; `[]` before the first
 *                     lock. Every row carries the live `pdf` status.
 *   getMyPayslip      GET /payroll/payslips/me/:month — one row; 404s
 *                     are branched plain-English (not run / not locked /
 *                     not yours) — the FE renders `err.message` verbatim.
 *   requestMyPayslipPdf  POST /payroll/payslips/me/:month/pdf — 201
 *                     `{id, status, createdAt}`; the BE dedupes when the
 *                     newest matching request is queued/generating
 *                     (returned as-is) and never blocks on failed.
 *
 * PDF URLs are NEVER stored: `pdf.url` rides a GET read (fresh presign
 * per read, ~10 min TTL) and is present only when `pdf.status ===
 * 'ready'` — a presign failure leaves `url` absent without failing the
 * row. "Open the PDF" therefore always starts from a fresh
 * `getMyPayslip`, which makes an expired URL unreachable from the UI.
 *
 * NOTE the two status vocabularies (wire truth, do not merge): the POST
 * answers the report-request enum (`generating`), the GET `pdf` field
 * maps that to `running`.
 *
 * Rejects with `ApiError` on failure. Documented failures:
 *   list     500 (internal)
 *   get      404 RESOURCE_NOT_FOUND (branched copy) · 422 bad month
 *   request  404 · 429 REPORT_IN_FLIGHT_LIMIT
 */
import { apiClient } from '../api/apiClient';

/** The GET `pdf` field's status (`PayslipPdfStatus` on the BE). */
export type PayslipPdfStatus = 'none' | 'queued' | 'running' | 'ready' | 'failed';

/** The POST response's status (the raw report-request enum). */
export type PayslipPdfRequestStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface PayslipPdf {
  status: PayslipPdfStatus;
  /** Present only when `ready` AND presigning succeeded. */
  url?: string;
}

/** One leave-balance snapshot row of the payslip (the as-of-lock capture
 *  — `availed`, NOT the live endpoint's `consumed`; the two shapes stay
 *  separate types so neither surface can consume the other). */
export interface PayslipLeaveBalance {
  code: string;
  name: string;
  accrued: number;
  availed: number;
  carryForward: number;
  remaining: number;
}

/** One earning line (`name` is already human — the head/component name). */
export interface PayslipEarningLine {
  name: string;
  amount: number;
}

/** One deduction line — `source` is a MACHINE token the FE labels:
 *  `pf_employee` | `tds` | `head:<name>` | `recovery:<YYYY-MM>`. */
export interface PayslipDeductionLine {
  source: string;
  amount: number;
}

/** The payslip view (fenzit-be `PayslipView`). Fields the app renders
 *  today plus the identity/statutory block it may grow into — hand-typed
 *  to the wire, optional where the BE answers null. */
export interface PayslipView {
  id: string;
  membershipId: string;
  runId: string;
  /** `YYYY-MM`. */
  month: string;
  slipNumber: string;
  employeeName: string | null;
  employeeCode: string | null;
  fatherName: string | null;
  motherName: string | null;
  spouseName: string | null;
  designation: string | null;
  department: string | null;
  pan: string | null;
  uanNumber: string | null;
  bankAccountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  dateOfJoining: string | null;
  establishmentName: string | null;
  establishmentAddress: string | null;
  wagePeriodStart: string | null;
  wagePeriodEnd: string | null;
  divisorConvention: string | null;
  cutoffDay: number | null;
  payDate: number | null;
  payableDays: number;
  lopDays: number;
  paidDays: number;
  daysWorked: number | null;
  grossEarnings: number;
  pfEmployee: number;
  pfEmployer: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
  netWages: number;
  earningLines: PayslipEarningLine[];
  deductionLines: PayslipDeductionLine[];
  leaveBalances: PayslipLeaveBalance[];
  warnings: string[];
  createdAt: string;
  pdf: PayslipPdf;
}

/** `POST .../pdf` response — queued, not generated. */
export interface PayslipPdfRequestView {
  id: string;
  status: PayslipPdfRequestStatus;
  createdAt: string;
}

async function listMyPayslips(): Promise<PayslipView[]> {
  const res = await apiClient.get<PayslipView[]>('/payroll/payslips/me');
  return res.data;
}

async function getMyPayslip(month: string): Promise<PayslipView> {
  const res = await apiClient.get<PayslipView>(
    `/payroll/payslips/me/${encodeURIComponent(month)}`,
  );
  return res.data;
}

async function requestMyPayslipPdf(
  month: string,
  idempotencyKey: string,
): Promise<PayslipPdfRequestView> {
  const res = await apiClient.post<PayslipPdfRequestView>(
    `/payroll/payslips/me/${encodeURIComponent(month)}/pdf`,
    undefined,
    // Caller-minted fresh key per tap, the house write idiom (reports.ts).
    { headers: { 'X-Idempotency-Key': idempotencyKey } },
  );
  return res.data;
}

export const payslipsService = {
  listMyPayslips,
  getMyPayslip,
  requestMyPayslipPdf,
};
