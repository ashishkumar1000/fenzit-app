/**
 * ownerLeaveModel.ts — the leave write/preview FAILURE POSTURES shared by
 * every leave surface (Story 17-6's D2/D4 vocabulary, 17-7 extends it to
 * the revoke/cancel actions for both roles, 20-1 adds the convert's
 * 'apply' leg). One home, so a change to "what a 409 means" never forks.
 *
 * The owner-queue PAGINATION model that used to live here moved to
 * `requestsModel.ts` with the two-tab Leave redesign (2026-11-25) —
 * same invariant, generalized to six filters × committed q. The retired
 * `useOwnerLeaveQueue` hook was replaced by `useLeaveRequests`.
 */
import type { ApiError } from '../../../services/api/apiError';

// --- The decision-write error posture (spec D2/D4; 17-7 extends the
// --- vocabulary to the revoke/cancel actions for BOTH roles — the one
// --- home for the leave write/preview failure classification).

/** The FE-owned transport line (§4 copy table) — the action is named so a
 *  rejected-while-offline owner isn't told about "Approving" (review P2).
 *  20-1 adds 'apply' (the convert's re-file leg — a fresh full-day apply). */
export type LeaveWriteAction = 'approve' | 'reject' | 'revoke' | 'cancel' | 'apply';

export function leaveWriteOfflineMessage(action: LeaveWriteAction): string {
  switch (action) {
    case 'reject':
      return "You're offline. Rejecting needs a working connection.";
    case 'revoke':
      return "You're offline. Revoking needs a working connection.";
    case 'cancel':
      return "You're offline. Cancelling needs a working connection.";
    case 'apply':
      return "You're offline. Sending the request needs a working connection.";
    default:
      return "You're offline. Approving needs a working connection.";
  }
}
export const LEAVE_WRITE_GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** The preview-fetch transport fallback (17-7 D5: transport line). */
export const LEAVE_PREVIEW_GENERIC_MESSAGE =
  "Couldn't load the preview. Check your connection.";

export type LeaveWriteFailure =
  /** 409 — the request moved to a terminal state under us
   *  (LEAVE_NOT_PENDING / LEAVE_NOT_REVOKABLE / LEAVE_NOT_CANCELLABLE);
   *  the sheet swaps to the already-handled notice. */
  | { kind: 'already-handled' }
  /** The FE-owned transport line (§4 copy table). */
  | { kind: 'offline'; message: string }
  /** Any other failure — `ApiError.message` verbatim. */
  | { kind: 'failed'; message: string };

/** The 409 state-conflict codes that all share the already-handled posture. */
const ALREADY_HANDLED_CODES = new Set([
  'LEAVE_NOT_PENDING',
  'LEAVE_NOT_REVOKABLE',
  'LEAVE_NOT_CANCELLABLE',
]);

export function classifyLeaveWriteFailure(
  err: ApiError,
  action: LeaveWriteAction,
): LeaveWriteFailure {
  if (ALREADY_HANDLED_CODES.has(err.code)) return { kind: 'already-handled' };
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return { kind: 'offline', message: leaveWriteOfflineMessage(action) };
  }
  return { kind: 'failed', message: err.message || LEAVE_WRITE_GENERIC_MESSAGE };
}

// --- Story 20-1 — the day-sheet leave write state + the convert posture ---

/**
 * The DayDetailSheet leave stages' host-reported write state (the
 * LeaveDetailActionState vocabulary, narrowed to the two writes the day
 * sheet owns). The sheet renders it; the host owns the lifecycle.
 */
export type LeaveSheetActionState =
  | { kind: 'idle' }
  | { kind: 'submitting'; action: 'cancel' | 'convert' }
  | { kind: 'error'; message: string }
  /** Write-time 409 already-handled — the notice + OK closing the sheet. */
  | { kind: 'handled' };

/**
 * AC 10 — the convert PARTIAL failure copy: the apply leg failed after
 * the cancel leg succeeded, so the employee must not be left guessing
 * that the half-day request is gone. The server's message rides
 * verbatim; the plain line appends after it.
 */
export function convertPartialFailureMessage(serverMessage: string): string {
  // The server's line is sentence copy — give it its full stop when it
  // arrived without one, so the appended plain line never reads "off Your".
  // An empty server message contributes no prefix at all (never a bare space).
  const trimmed = serverMessage.trim();
  const prefix =
    trimmed.length === 0
      ? ''
      : `${trimmed}${/[.!?…]$/.test(trimmed) ? '' : '.'} `;
  return `${prefix}Your half-day request is already cancelled.`;
}

/**
 * The PREVIEW-fetch failure (17-7 D5): offline keeps the action-named
 * line; any HTTP failure surfaces the server message verbatim; only a
 * message-less non-offline failure falls back to the transport line.
 */
export function classifyLeavePreviewFailure(
  err: ApiError,
  action: LeaveWriteAction,
): { message: string } {
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return { message: leaveWriteOfflineMessage(action) };
  }
  const message = err.message?.trim();
  return { message: message ? message : LEAVE_PREVIEW_GENERIC_MESSAGE };
}
