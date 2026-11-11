/**
 * Invite SMS helpers — pure functions only (no hooks, no store).
 *
 * Owns three things for the invite SMS (spec-invite-sms-download-link, story 21-4):
 *   - turning the raw `sms_status` into a known value (unknown → null, so no line shows),
 *   - the owner's status line copy,
 *   - the Resend error copy, keyed on `ApiError.code` only (never on `message`).
 */
import type { ApiError } from '../../services';
import type { InviteSmsStatus } from './types';

/** Shown when the per-phone limit (5 invite texts in the last hour) stops a send. */
export const INVITE_SMS_CAP_COPY =
  'This person has already received 5 invite SMS in the last hour. Try again later.';

const STATUS_LINE_COPY: Record<'failed' | 'not_configured', string> = {
  failed: 'SMS not sent. Tap Resend to try again.',
  not_configured: 'SMS sending is not switched on yet.',
};

export const RESEND_FORBIDDEN_COPY = 'Only a company admin can resend this SMS.';
export const RESEND_GONE_COPY = 'This invite can no longer be resent.';
export const RESEND_CONNECTION_COPY =
  'Could not send the SMS. Check your connection and try again.';
export const RESEND_UNKNOWN_COPY = 'Could not send the SMS. Try again.';

/** The known `sms_status` values, or `null` for anything else (including a missing field). */
export function parseInviteSmsStatus(raw: unknown): InviteSmsStatus | null {
  switch (raw) {
    case 'sent':
    case 'failed':
    case 'not_configured':
    case 'refused_cap':
      return raw;
    default:
      return null;
  }
}

/** The line shown under the invite row, or `null` when nothing should show (for `sent`). */
export function inviteSmsStatusLine(status: InviteSmsStatus | null): string | null {
  if (status === 'refused_cap') return INVITE_SMS_CAP_COPY;
  if (status === 'failed' || status === 'not_configured') return STATUS_LINE_COPY[status];
  return null;
}

/** Plain-English copy for a failed Resend. Branches on `code` only. */
export function resendErrorMessage(err: ApiError): string {
  switch (err.code) {
    case 'INVITE_SMS_LIMIT_REACHED':
      return INVITE_SMS_CAP_COPY;
    case 'NOT_COMPANY_ADMIN':
    case 'FORBIDDEN':
      return RESEND_FORBIDDEN_COPY;
    case 'INVITE_NOT_FOUND':
    case 'NOT_FOUND':
    case 'INVITE_NOT_PENDING':
      return RESEND_GONE_COPY;
    case 'TIMEOUT':
    case 'NETWORK_ERROR':
      return RESEND_CONNECTION_COPY;
    default:
      return RESEND_UNKNOWN_COPY;
  }
}

/**
 * The membership user id the resend endpoint takes. A row from this session's
 * invite carries `invite_<inviteId>`; a roster row's id is already the user id.
 */
export function membershipUserIdOf(technicianId: string): string {
  return technicianId.replace(/^invite_/, '');
}
