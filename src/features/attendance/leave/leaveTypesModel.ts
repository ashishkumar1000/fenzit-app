/**
 * leaveTypesModel.ts — the Types pane's pure display/edit model (the
 * two-tab Leave redesign, 2026-11). Everything the LeaveTypesPane renders
 * or sends derives here, over the shipped 27-x wire shapes (web parity —
 * the console's LeaveTypesTab/LeaveTypeEditor is the semantic reference):
 * the catalog's stable display order, the chip's sub-label, the per-type
 * edit draft, the numeric-equality dirty check ("1.0" == "1"), the
 * ±0.5 stepper and the changed-fields-only PATCH body.
 *
 * Sleep semantics (the web editor's): with the type off, every rule row
 * sleeps and the draft HOLDS — a rule drafted before the flip ships with
 * the next awake save; while asleep the PATCH carries the `enabled`
 * change alone. Pure functions only: no React, no network, no `new
 * Date()` (AD-7 — everything here is date-string-free anyway).
 */
import type { ApiError } from '../../../services/api/apiError';
import type {
  LeaveTypePatch,
  LeaveTypeView,
} from '../../../services/resources/attendanceLeave';

/** The catalog's stable display order — the chips' order (web TYPE_ORDER);
 *  legacy remnants (code null) sort after the fixed four in list order. */
const CODE_ORDER = ['earned', 'sick', 'bereavement', 'comp_off'] as const;

function codeRank(code: string | null): number {
  const rank = (CODE_ORDER as readonly string[]).indexOf(code ?? '');
  return rank === -1 ? CODE_ORDER.length : rank;
}

/** The chips' order: fixed four by CODE_ORDER, then any legacy rows. */
export function orderLeaveTypes(rows: LeaveTypeView[]): LeaveTypeView[] {
  return [...rows].sort(
    (a, b) => codeRank(a.code) - codeRank(b.code) || a.name.localeCompare(b.name),
  );
}

/** "N configured" counts the editable rows only — a legacy remnant is not
 *  something the owner configured (web's split). */
export function configuredCount(rows: LeaveTypeView[]): number {
  return rows.filter(row => row.configurable).length;
}

// --- Chip sub-label --------------------------------------------------------

/** One decimal place, trailing zeros trimmed ("12" · "1.5" → "18"). */
function trimNum(n: number): string {
  return String(Number(n.toFixed(2)));
}

/**
 * The chip's secondary line: monthly types annualize the rate ("12 d / yr"
 * for 1/mo — the design's own reading), annual types show the grant,
 * comp-off reads "As earned"; a disabled type swaps the state word to
 * "Off". (`accrualMode: null` = remnant — falls back to the bare name.)
 */
export function chipSubLabel(type: LeaveTypeView): string {
  const state = type.enabled ? 'Active' : 'Off';
  if (type.accrualMode === 'monthly') {
    return `${trimNum(type.accrualDays * 12)} d / yr · ${state}`;
  }
  if (type.accrualMode === 'annual') {
    return `${trimNum(type.accrualDays)} d / yr · ${state}`;
  }
  if (type.accrualMode === 'none') {
    return `As earned · ${state}`;
  }
  return state;
}

/** The header's mode chip (web MODE_CHIP) — "Legacy" for a null mode. */
export function modeChipLabel(type: LeaveTypeView): string {
  if (type.accrualMode === 'monthly') return 'Monthly accrual';
  if (type.accrualMode === 'annual') return 'Annual grant';
  if (type.accrualMode === 'none') return 'Event basis';
  return 'Legacy';
}

// --- The edit draft --------------------------------------------------------

/** One type's editable draft — string days (the input's truth), booleans
 *  by value. Not stored: names/codes/modes are inherent to the catalog. */
export interface LeaveTypeDraft {
  days: string;
  carryForward: boolean;
  allowOverBalance: boolean;
  paid: boolean;
  enabled: boolean;
}

export function draftFromType(type: LeaveTypeView): LeaveTypeDraft {
  return {
    days: String(type.accrualDays),
    carryForward: type.carryForward,
    allowOverBalance: type.allowOverBalance,
    paid: type.paid,
    enabled: type.enabled,
  };
}

/** The rate block renders for monthly AND annual types (web's `hasRate`);
 *  comp-off and remnants show the no-rate note instead. */
export function hasRate(type: LeaveTypeView): boolean {
  return type.accrualMode === 'monthly' || type.accrualMode === 'annual';
}

/** The rate input's validity: 0–366, at most 2 decimals (the BE's PATCH
 *  contract; anything else blocks Save while the type is awake). */
export function daysOk(daysText: string): boolean {
  return /^\d{1,3}(\.\d{1,2})?$/.test(daysText.trim()) && Number(daysText) <= 366;
}

/** The stepper's ±0.5 nudge, clamped to 0–366. A half-typed value ("12.")
 *  keeps its numeric head — only junk reads as 0 (web stepDays). */
export function stepDays(daysText: string, delta: number): string {
  const base = Number.parseFloat(daysText.trim()) || 0;
  return String(Math.min(366, Math.max(0, Number((base + delta).toFixed(2)))));
}

/** Monthly types show the annualized conversion ("1 day/mo = 12 days/yr").
 *  Null when the input is not a valid rate (the line hides). */
export function annualConversion(daysText: string): string | null {
  if (!daysOk(daysText)) return null;
  const days = Number(daysText);
  return `${trimNum(days)} day/mo = ${trimNum(days * 12)} days/yr`;
}

/**
 * The dirty check — numeric equality for days ("1.0" and "1" are the same
 * value), plain value compares for the rest. A validity-failing days draft
 * is never dirty on its own (it must not block a disable-only save).
 */
export function typeDirty(type: LeaveTypeView, draft: LeaveTypeDraft): boolean {
  if (hasRate(type) && daysOk(draft.days) && Number(draft.days) !== type.accrualDays) {
    return true;
  }
  return (
    draft.carryForward !== type.carryForward ||
    draft.allowOverBalance !== type.allowOverBalance ||
    draft.paid !== type.paid ||
    draft.enabled !== type.enabled
  );
}

/**
 * The changed-fields-only PATCH body (the web editor's contract). While
 * the type sleeps (draft enabled = false), ONLY the `enabled` change
 * ships — rule drafts hold in the input and ship with the next awake
 * save. The carry/over fields never ship for a non-monthly type (the BE
 * 422s them); the rate ships only when valid.
 */
export function patchBody(type: LeaveTypeView, draft: LeaveTypeDraft): LeaveTypePatch {
  const body: LeaveTypePatch = {};
  if (draft.enabled !== type.enabled) {
    body.enabled = draft.enabled;
  }
  if (!draft.enabled) return body; // asleep: the hold — nothing else posts
  if (hasRate(type) && daysOk(draft.days) && Number(draft.days) !== type.accrualDays) {
    body.accrualDays = Number(draft.days);
  }
  if (type.accrualMode === 'monthly') {
    if (draft.carryForward !== type.carryForward) body.carryForward = draft.carryForward;
    if (draft.allowOverBalance !== type.allowOverBalance) {
      body.allowOverBalance = draft.allowOverBalance;
    }
  }
  if (draft.paid !== type.paid) body.paid = draft.paid;
  return body;
}

// --- The save-failure posture (the pane renders it) -------------------------

export const TYPE_SAVE_OFFLINE_MESSAGE =
  "You're offline. Saving the rules needs a working connection.";
export const TYPE_SAVE_GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export type TypeSaveFailure =
  /** The unmount cancel — the pane ignores it silently (apiError's
   *  CANCELLED contract: the app's own doing, never an error). */
  | { kind: 'cancelled' }
  | { kind: 'offline'; message: string }
  /** 403/404 — the row is gone or no longer editable for this viewer; the
   *  pane shows the line AND refetches the catalog so the editor re-seats
   *  (a vanished type must not keep a stale card open). */
  | { kind: 'gone'; message: string }
  /** Any other failure — `ApiError.message` verbatim (the BE's 409
   *  LEAVE_TYPE_NOT_CONFIGURABLE copy arrives here). */
  | { kind: 'failed'; message: string };

export function classifyTypeSaveFailure(err: ApiError): TypeSaveFailure {
  if (err.code === 'CANCELLED') return { kind: 'cancelled' };
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return { kind: 'offline', message: TYPE_SAVE_OFFLINE_MESSAGE };
  }
  if (err.status === 403 || err.status === 404) {
    return { kind: 'gone', message: err.message || TYPE_SAVE_GENERIC_MESSAGE };
  }
  return { kind: 'failed', message: err.message || TYPE_SAVE_GENERIC_MESSAGE };
}
