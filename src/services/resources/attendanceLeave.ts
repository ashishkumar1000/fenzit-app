/**
 * services/resources/attendanceLeave.ts
 * ─────────────────────────────────────
 * The technician's self-apply leave surface (Story 17-5 over the shipped
 * 17-1..17-4 routes — contract source: fenzit-be `docs/api-contracts.md`
 * → "Attendance me leave", spec-17-5 D7). A plain function object on the
 * shared `apiClient` (the attendanceCheckIn.ts shape).
 *
 *   previewLeave  GET /attendance/me/leave/preview — the FR-12 live
 *                 working-days check. Gate failures and overlap answer
 *                 `200 { ok: false, errorCode, message }` (NOT HTTP
 *                 errors — the FE renders the message inline); only a
 *                 transport/HTTP failure rejects.
 *   applyLeave    POST /attendance/me/leave — the caller owns the
 *                 idempotency key: one fresh UUID v4 per tap, sent as
 *                 `X-Idempotency-Key`. 201 is BOTH outcomes (create and
 *                 replay answer the stored view, same handler) — success
 *                 has exactly one shape.
 *
 * Rejections surface as `ApiError` whose `code` is the error-catalogue
 * string (`LEAVE_INVALID_RANGE`, `LEAVE_OVERLAP`, …) — the exact wire
 * strings the hook branches on (never the message text).
 *
 * Dates stay `YYYY-MM-DD` strings end to end (AD-7 — never `new Date()`).
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/** Full day | first half | second half — halves are single-date only. */
export type LeavePart = 'full_day' | 'first_half' | 'second_half';

/** `ok: true` — the range passes validation; counts are server integers. */
export interface LeavePreviewOk {
  ok: true;
  workingDays: number;
  totalDays: number;
  part: string;
  dates: { date: string; isWorkingDay: boolean; kind: string }[];
}

/**
 * `ok: false` — a validation/gate rejection, inline-renderable. The union
 * is the FULL rejection set: the preview gate answers gate failures
 * (incl. NOT_TRACKED) and overlap as `200 { ok: false }`; 23-14 adds the
 * write path's later gates (a disabled/foreign type, a payroll-locked
 * month, an insufficient balance) — the preview runs the POST's whole
 * validation ladder so the forms catch a refusal at pick time.
 */
export type LeavePreviewErrorCode =
  | 'ATTENDANCE_NOT_TRACKED'
  | 'LEAVE_INVALID_RANGE'
  | 'LEAVE_BEFORE_START_DATE'
  | 'LEAVE_TOO_OLD'
  | 'LEAVE_CHECKED_IN_CONFLICT'
  | 'LEAVE_ALREADY_OFF'
  | 'LEAVE_OVERLAP'
  | 'LEAVE_TYPE_DISABLED'
  | 'RESOURCE_NOT_FOUND'
  | 'PAYROLL_MONTH_LOCKED'
  | 'LEAVE_INSUFFICIENT_BALANCE'
  | 'VALIDATION_ERROR';

export interface LeavePreviewRejection {
  ok: false;
  errorCode: LeavePreviewErrorCode;
  message: string;
}

export type LeavePreview = LeavePreviewOk | LeavePreviewRejection;

export interface ApplyLeaveBody {
  startDate: string;
  /** Omitted for a single date (the BE defaults startDate). */
  endDate?: string;
  /** Omitted for full_day (the BE DTO defaults it). */
  part?: LeavePart;
  reason: string;
  /** Story 23-14 — the picked catalog type. Absent/null = untyped, which
   *  reads as paid leave and skips the balance check (the shipped BE
   *  semantic — the FE renders it as an explicit "No type" choice). */
  leaveTypeId?: string | null;
}

export interface ApplyOnBehalfBody {
  employeeId: string;
  startDate: string;
  /** Omitted for a single date (the BE defaults startDate). */
  endDate?: string;
  /** Omitted for full_day (the BE DTO defaults it). */
  part?: LeavePart;
  reason: string;
  /** Same 23-14 semantic as the self body. */
  leaveTypeId?: string | null;
}

// --- Story 23-14 — the fixed catalog types + per-type balances -------------

/**
 * One row of `GET /attendance/me/leave/types` (enabled only — a disabled
 * type structurally never reaches the app). `accrualMode: 'none'` is
 * Comp-Off — no balance, the owner approves each request; `null` is a
 * legacy remnant (never returned by the enabled list, kept for the
 * type's own honesty).
 */
export interface LeaveTypeView {
  id: string;
  code: string | null;
  name: string;
  accrualMode: 'monthly' | 'annual' | 'none' | null;
  accrualDays: number;
  carryForward: boolean;
  allowOverBalance: boolean;
  paid: boolean;
  enabled: boolean;
  configurable: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One row of the balances endpoints (self + owner's per-employee): one
 * per accrual-bearing type, DISABLED included (their consumed days still
 * count and show); Comp-Off (`mode none`) never appears — it has no
 * balance. Derived as of today for the current April–March FY:
 * `remaining = credits + accrued + carryForward − consumed`, and it is
 * NOT clamped — an allow-over-balance type can answer negative.
 */
export interface LeaveBalanceView {
  typeId: string;
  code: string;
  name: string;
  accrualMode: 'monthly' | 'annual';
  accrualDays: number;
  paid: boolean;
  enabled: boolean;
  credits: number;
  accrued: number;
  carryForward: number;
  consumed: number;
  remaining: number;
}

// --- The owner Types surface (27-x) — the values-only PATCH + summary. ----

/**
 * The five values the PATCH accepts. The catalog is fixed — names, codes
 * and accrual modes are inherent, and unknown keys are stripped server-side.
 */
export type LeaveTypePatch = Partial<{
  accrualDays: number;
  carryForward: boolean;
  allowOverBalance: boolean;
  paid: boolean;
  enabled: boolean;
}>;

/** The derived-status keys the summary answers (the D5 vocabulary). */
export interface LeaveSummary {
  activeEmployees: number;
  counts: {
    pending: number;
    approved: number;
    revoked: number;
    cancelled: number;
    rejected: number;
  };
}

// --- Story 17-7 — the revoke/cancel split preview + write shapes -----------

/** One `keepDates[]` entry — a day the action will NOT touch (wire-exact:
 *  the BE's `LeaveActionPreview`, fenzit-be leave.model.ts). `reason` is
 *  wire truth the FE deliberately never branches on (spec D2). */
export interface LeaveKeepDay {
  date: string;
  state: string;
  reason: 'past' | 'cutoff_passed';
}

/**
 * The split preview (FR-14/FR-15): exactly which dates the action would
 * change vs keep. `GET .../preview` answers 200 even with an EMPTY
 * `actionDates` (previews never 409 — BE D13); the empty case is a state
 * the FE renders, not an error. `request` is the live request view.
 */
export interface LeaveActionPreview {
  action: 'revoke' | 'cancel';
  actionDates: string[];
  keepDates: LeaveKeepDay[];
  request: LeaveRequestView;
}

/**
 * A write response (revoke/cancel): the refreshed view plus the action's
 * split array — OPTIONAL on the wire (spec D6 wire lens #1): an own-retry
 * 200 answers the bare view without it, so handlers never read the arrays
 * unconditionally. Like every write view it carries no `employeeName`.
 */
export interface LeaveActionView extends LeaveRequestRow {
  /** Present only when the write actually transitioned days. */
  revokedDates?: string[];
  /** Present only when the write actually transitioned days. */
  cancelledDates?: string[];
}

/**
 * The list/write row — the request view plus `employeeName` (and its
 * `employeeCode` companion), which the owner list adds and write responses
 * never carry (wire-truth F5: the envelope is the house `Paginated<T>`).
 * The owner list rows also carry the request's catalog typing and the
 * person's office line (27-1/27-2 wire truth, optional — absent on legacy
 * rows created before the fixed catalog).
 */
export type LeaveRequestRow = LeaveRequestView & {
  employeeName?: string;
  /** Photo link or null; owner list reads only. */
  employeeAvatarUrl?: string | null;
  /** Per-tenant human reference (`'EMP-004'`); owner list reads only. */
  employeeCode?: string;
  /** The request's catalog type (owner list rows); absent on legacy rows. */
  leaveTypeId?: string;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  /** The person's office assignment covering today; owner list reads only. */
  officeName?: string;
};

/** The request view (list adds `employeeName`; never this shape). */
export interface LeaveRequestView {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  part: LeavePart;
  reason: string;
  status: string;
  workingDays: number;
  totalDays: number;
  createdBy: string;
  createdAt: string;
  dates: { date: string; state: string }[];
}

export const attendanceLeaveService = {
  previewLeave(params: {
    startDate: string;
    endDate?: string;
    part?: LeavePart;
    /** 23-14: a named type makes the preview run the apply-time balance
     *  check too — the form catches the refusal at pick time. */
    leaveTypeId?: string;
  }): Promise<LeavePreview> {
    return apiClient
      .get<LeavePreview>('/attendance/me/leave/preview', { params })
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave/on-behalf/preview` (23-14) — the owner's
   * apply-on-behalf form had NO preview (the `me` one is
   * technician-scoped and the owner JWT answers 403 there); this route
   * runs the on-behalf POST's validation read-only for one employee, so
   * that form gets the same working-days count, the same inline verdict
   * and the same submit gate as the self-apply form. Rejections render
   * `ok: false` with the message verbatim, exactly like `previewLeave`.
   */
  previewOnBehalf(params: {
    employeeId: string;
    startDate: string;
    endDate?: string;
    part?: LeavePart;
    leaveTypeId?: string;
  }): Promise<LeavePreview> {
    return apiClient
      .get<LeavePreview>('/attendance/leave/on-behalf/preview', { params })
      .then(res => res.data);
  },

  applyLeave(body: ApplyLeaveBody, idempotencyKey: string): Promise<LeaveRequestView> {
    return apiClient
      .post<LeaveRequestView>('/attendance/me/leave', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      })
      .then(res => res.data);
  },

  // --- Story 17-6 (spec D7) — history, owner queue + decisions, on-behalf.

  /**
   * `GET /attendance/me/leave` — the employee's own history, newest first
   * (cursor scope `leave-me-list`). `employeeName` is list-only wire truth
   * and is meaningless on this endpoint (the caller's own name).
   */
  listMyLeave(params: { cursor?: string; limit?: number } = {}): Promise<
    Paginated<LeaveRequestRow>
  > {
    return apiClient
      .get<Paginated<LeaveRequestRow>>('/attendance/me/leave', { params })
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave` — the owner list. `status` filters the DERIVED
   * status (`'pending'` is the queue; the unfiltered list is the All tab) —
   * cursors are endpoint-scoped (`leave-owner-list`), so a pending cursor
   * replayed against the unfiltered list would answer garbage: the FE keeps
   * per-tab state and never crosses them (spec D1). `q` is the 27-1
   * server-side needle (name / employee code / reason, case-insensitive
   * contains) — the client trims and caps it at 100 chars (the BE 422s
   * longer); a cursor minted under one `q` is never replayed under another.
   */
  listOwnerLeave(
    params: {
      status?: string;
      employeeId?: string;
      q?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<Paginated<LeaveRequestRow>> {
    return apiClient
      .get<Paginated<LeaveRequestRow>>('/attendance/leave', { params })
      .then(res => res.data);
  },

  /**
   * `POST /attendance/leave/:id/approve` — single-tap decision, NO
   * idempotency key (BE D7: state-guarded own-retry — a retry after a
   * lost response answers 200 with the refreshed view, one server event).
   * 409 `LEAVE_NOT_PENDING` = the request moved to a DIFFERENT terminal
   * state under us — the FE's "already handled" sheet (spec D2).
   */
  approveLeave(id: string): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>(`/attendance/leave/${encodeURIComponent(id)}/approve`)
      .then(res => res.data);
  },

  /** `POST /attendance/leave/:id/reject` — empty reason is valid (FR-13):
   *  omit the field entirely rather than sending an empty string. */
  rejectLeave(id: string, reason?: string): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>(
        `/attendance/leave/${encodeURIComponent(id)}/reject`,
        reason ? { reason } : {},
      )
      .then(res => res.data);
  },

  /**
   * `POST /attendance/leave/on-behalf` — FR-16, born approved (D10). The
   * idempotency key is REQUIRED here (a replayed create must never double
   * a person's leave): one fresh UUID v4 per tap.
   */
  applyOnBehalf(
    body: ApplyOnBehalfBody,
    idempotencyKey: string,
  ): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>('/attendance/leave/on-behalf', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      })
      .then(res => res.data);
  },

  // --- Story 17-7 (spec D6) — the revoke/cancel previews + writes.

  /**
   * `GET /attendance/leave/:id/preview` — the owner's revoke split (FR-14).
   * Empty `actionDates` is a 200 shape (nothing left to revoke), never an
   * error; the preview runs the same access gate as the write (403 both
   * ways, 404 cross-tenant).
   */
  previewRevoke(id: string): Promise<LeaveActionPreview> {
    return apiClient
      .get<LeaveActionPreview>(
        `/attendance/leave/${encodeURIComponent(id)}/preview`,
      )
      .then(res => res.data);
  },

  /**
   * `GET /attendance/me/leave/:id/preview` — the employee's cancel split
   * (FR-15). Same contract as the revoke preview.
   */
  previewCancel(id: string): Promise<LeaveActionPreview> {
    return apiClient
      .get<LeaveActionPreview>(
        `/attendance/me/leave/${encodeURIComponent(id)}/preview`,
      )
      .then(res => res.data);
  },

  /**
   * `POST /attendance/leave/:id/revoke` — the reason is REQUIRED on the
   * wire (RevokeLeaveDto trims + rejects empty-after-trim); the FE's
   * disabled-until-filled gate makes the 422 unreachable. No idempotency
   * key (BE D7: state-guarded own-retry answers 200 with the refreshed
   * view — WITHOUT `revokedDates`). 409 `LEAVE_NOT_REVOKABLE` = someone
   * else moved it first.
   */
  revokeLeave(id: string, reason: string): Promise<LeaveActionView> {
    return apiClient
      .post<LeaveActionView>(
        `/attendance/leave/${encodeURIComponent(id)}/revoke`,
        { reason },
      )
      .then(res => res.data);
  },

  /**
   * `POST /attendance/me/leave/:id/cancel` — NO body (FR-15 needs no
   * reason). Own-retry answers 200 with the bare view (no
   * `cancelledDates`); 409 `LEAVE_NOT_CANCELLABLE` = the request moved
   * under us.
   */
  cancelLeave(id: string): Promise<LeaveActionView> {
    return apiClient
      .post<LeaveActionView>(
        `/attendance/me/leave/${encodeURIComponent(id)}/cancel`,
      )
      .then(res => res.data);
  },

  // --- Story 23-14 — the catalog types + per-type balances. ----------------

  /**
   * `GET /attendance/me/leave/types` — the enabled leave types for the
   * apply form's picker (a disabled type never reaches the app; Comp-Off
   * is included with `accrualMode: 'none'`). EMPLOYEE-only (`leave.own`)
   * — the owner surfaces use `listCompanyLeaveTypes` below.
   */
  listMyLeaveTypes(): Promise<LeaveTypeView[]> {
    return apiClient
      .get<LeaveTypeView[]>('/attendance/me/leave/types')
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave/types` — the owner's read of the FULL catalog
   * (`leave.types`): the fixed four plus disabled types and read-only
   * legacy remnants. The on-behalf picker filters `enabled` CLIENT-SIDE
   * from this response — a disabled type must never reach the picker,
   * and the owner has no enabled-only endpoint of their own.
   */
  listCompanyLeaveTypes(): Promise<LeaveTypeView[]> {
    return apiClient
      .get<LeaveTypeView[]>('/attendance/leave/types')
      .then(res => res.data);
  },

  /**
   * `GET /attendance/me/leave/balances` — the employee's own per-type
   * balances (accrual-bearing types only, disabled included; Comp-Off
   * never appears). NOT clamped — an overdrawn allow-over type answers
   * negative, which the card renders as "Overdrawn by N days".
   */
  getMyLeaveBalances(): Promise<LeaveBalanceView[]> {
    return apiClient
      .get<LeaveBalanceView[]>('/attendance/me/leave/balances')
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave/:employeeId/balances` — the owner's read of
   * one employee's balances (the detail sheet's Balances section, the
   * on-behalf form's card). Unknown/foreign id answers 404 "The employee
   * is not in this company" — the hosts render it as a quiet notice, not
   * a blocking failure.
   */
  getEmployeeBalances(employeeId: string): Promise<LeaveBalanceView[]> {
    return apiClient
      .get<LeaveBalanceView[]>(
        `/attendance/leave/${encodeURIComponent(employeeId)}/balances`,
      )
      .then(res => res.data);
  },

  // --- The owner Types surface (27-x catalog config; web parity). ----------

  /**
   * `PATCH /attendance/leave/types/:id` — values-only edit (the catalog is
   * FIXED: names, codes and accrual modes are inherent; unknown keys are
   * stripped server-side). The body carries CHANGED fields only. The BE
   * answers 200 with the stored view (an unchanged answer carries no audit
   * entry), 409 `LEAVE_TYPE_NOT_CONFIGURABLE` for a legacy remnant, 422
   * for bad values (accrualDays bounds/decimals, a rate on comp_off,
   * carryForward/allowOverBalance on a non-monthly type), 404 cross-tenant.
   */
  patchLeaveType(
    id: string,
    values: LeaveTypePatch,
  ): Promise<LeaveTypeView> {
    return apiClient
      .patch<LeaveTypeView>(
        `/attendance/leave/types/${encodeURIComponent(id)}`,
        values,
      )
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave/summary` — the requests tab's pill counts in one
   * read: the whole tenant's request counts by derived status (the same
   * CASE the list filters with — a pill's number can never disagree with
   * its filter). `activeEmployees` is the console's team-size fact; the
   * mobile surface reads only `counts`.
   */
  leaveSummary(): Promise<LeaveSummary> {
    return apiClient
      .get<LeaveSummary>('/attendance/leave/summary')
      .then(res => res.data);
  },
};
