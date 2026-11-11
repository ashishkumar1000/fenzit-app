/**
 * Invite SMS helpers — the pure rules behind the employee card's status line
 * and the Resend error copy (spec-invite-sms-download-link, story 21-4).
 *
 * Tested as the owner experiences them: only the four known statuses count,
 * anything else shows nothing; a failed Resend is explained by its error
 * code, never by the server's free-text message.
 */
import type { ApiError } from '../../services';
import {
  INVITE_SMS_CAP_COPY,
  RESEND_CONNECTION_COPY,
  RESEND_FORBIDDEN_COPY,
  RESEND_GONE_COPY,
  RESEND_UNKNOWN_COPY,
  inviteSmsStatusLine,
  membershipUserIdOf,
  parseInviteSmsStatus,
  resendErrorMessage,
} from './inviteSms';

function apiError(code: string, message = 'server text'): ApiError {
  return { code, message } as unknown as ApiError;
}

describe('parseInviteSmsStatus', () => {
  it.each(['sent', 'failed', 'not_configured', 'refused_cap'])('accepts %s', value => {
    expect(parseInviteSmsStatus(value)).toBe(value);
  });

  // Boundary and malformed input: the app must never show a status it does not know.
  it.each([
    ['empty string', ''],
    ['wrong case', 'SENT'],
    ['leading space', ' sent'],
    ['trailing space', 'failed '],
    ['near miss', 'refused'],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object', { sms_status: 'sent' }],
  ])('returns null for %s', (_label, raw) => {
    expect(parseInviteSmsStatus(raw)).toBeNull();
  });
});

describe('inviteSmsStatusLine', () => {
  it('shows the cap line for refused_cap', () => {
    expect(inviteSmsStatusLine('refused_cap')).toBe(INVITE_SMS_CAP_COPY);
  });

  it('shows a Resend prompt for failed', () => {
    expect(inviteSmsStatusLine('failed')).toBe('SMS not sent. Tap Resend to try again.');
  });

  it('shows a plain not-switched-on line for not_configured', () => {
    expect(inviteSmsStatusLine('not_configured')).toBe('SMS sending is not switched on yet.');
  });

  it('shows nothing for sent (the text went out)', () => {
    expect(inviteSmsStatusLine('sent')).toBeNull();
  });

  it('shows nothing when there is no status (a roster row)', () => {
    expect(inviteSmsStatusLine(null)).toBeNull();
  });
});

describe('resendErrorMessage', () => {
  it.each([
    ['INVITE_SMS_LIMIT_REACHED', INVITE_SMS_CAP_COPY],
    ['NOT_COMPANY_ADMIN', RESEND_FORBIDDEN_COPY],
    ['FORBIDDEN', RESEND_FORBIDDEN_COPY],
    ['INVITE_NOT_FOUND', RESEND_GONE_COPY],
    ['NOT_FOUND', RESEND_GONE_COPY],
    ['INVITE_NOT_PENDING', RESEND_GONE_COPY],
    ['TIMEOUT', RESEND_CONNECTION_COPY],
    ['NETWORK_ERROR', RESEND_CONNECTION_COPY],
  ])('maps %s to its copy', (code, copy) => {
    expect(resendErrorMessage(apiError(code))).toBe(copy);
  });

  it('falls back to the generic copy for an unknown code', () => {
    expect(resendErrorMessage(apiError('SOMETHING_NEW'))).toBe(RESEND_UNKNOWN_COPY);
  });

  it('never reads the server message: a message that names a code does not change the copy', () => {
    expect(resendErrorMessage(apiError('SOMETHING_NEW', 'NOT_COMPANY_ADMIN'))).toBe(
      RESEND_UNKNOWN_COPY,
    );
  });
});

describe('membershipUserIdOf', () => {
  it('strips the invite_ prefix from a session invite row', () => {
    expect(membershipUserIdOf('invite_4a4a2a57')).toBe('4a4a2a57');
  });

  it('leaves a roster id (already a user id) unchanged', () => {
    expect(membershipUserIdOf('4a4a2a57-5b9b-4c26-8c86-8f77fbc1e497')).toBe(
      '4a4a2a57-5b9b-4c26-8c86-8f77fbc1e497',
    );
  });

  it('strips only one leading prefix', () => {
    expect(membershipUserIdOf('invite_invite_x')).toBe('invite_x');
  });

  it('does not strip the prefix when it is not at the start', () => {
    expect(membershipUserIdOf('xinvite_abc')).toBe('xinvite_abc');
  });

  it('returns an empty id for a bare prefix (the server will reject it)', () => {
    expect(membershipUserIdOf('invite_')).toBe('');
  });
});
