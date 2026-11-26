/**
 * Model tests for `ownerLeaveModel`: the decision-write failure
 * classification (409 → already-handled, transport → the offline line,
 * anything else → the server message), the preview-fetch posture (17-7
 * D5) and the convert partial-failure copy (20-1). The owner-queue
 * pagination reducer these used to cover moved to `requestsModel.test.ts`
 * with the two-tab Leave redesign (2026-11-25).
 */
import {
  classifyLeavePreviewFailure,
  classifyLeaveWriteFailure,
  convertPartialFailureMessage,
} from './ownerLeaveModel';

describe('classifyLeaveWriteFailure', () => {
  it('409 LEAVE_NOT_PENDING → the already-handled sheet branch', () => {
    expect(classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_PENDING', message: 'x' }, 'approve')).toEqual({
      kind: 'already-handled',
    });
  });

  it('409 LEAVE_NOT_REVOKABLE / LEAVE_NOT_CANCELLABLE share the already-handled posture (17-7)', () => {
    expect(
      classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_REVOKABLE', message: 'No future dates left to revoke' }, 'revoke'),
    ).toEqual({ kind: 'already-handled' });
    expect(
      classifyLeaveWriteFailure({ status: 409, code: 'LEAVE_NOT_CANCELLABLE', message: 'No future dates left to cancel' }, 'cancel'),
    ).toEqual({ kind: 'already-handled' });
  });

  it('transport failures carry the FE-owned offline line, named for the action', () => {
    for (const code of ['NETWORK_ERROR', 'TIMEOUT']) {
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'approve')).toEqual({
        kind: 'offline',
        message: "You're offline. Approving needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'reject')).toEqual({
        kind: 'offline',
        message: "You're offline. Rejecting needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'revoke')).toEqual({
        kind: 'offline',
        message: "You're offline. Revoking needs a working connection.",
      });
      expect(classifyLeaveWriteFailure({ status: 0, code, message: 'x' }, 'cancel')).toEqual({
        kind: 'offline',
        message: "You're offline. Cancelling needs a working connection.",
      });
    }
  });

  it('any other failure surfaces the server message verbatim; empty falls back', () => {
    expect(
      classifyLeaveWriteFailure({ status: 403, code: 'FORBIDDEN', message: 'Not allowed' }, 'approve'),
    ).toEqual({ kind: 'failed', message: 'Not allowed' });
    expect(
      classifyLeaveWriteFailure({ status: 500, code: 'SERVER_ERROR', message: '' }, 'reject'),
    ).toEqual({ kind: 'failed', message: 'Something went wrong. Please try again.' });
  });
});

describe('classifyLeavePreviewFailure (17-7 D5)', () => {
  it('offline keeps the action-named line', () => {
    expect(
      classifyLeavePreviewFailure({ status: 0, code: 'NETWORK_ERROR', message: 'x' }, 'revoke'),
    ).toEqual({ message: "You're offline. Revoking needs a working connection." });
    expect(
      classifyLeavePreviewFailure({ status: 0, code: 'TIMEOUT', message: 'x' }, 'cancel'),
    ).toEqual({ message: "You're offline. Cancelling needs a working connection." });
  });

  it('an HTTP failure surfaces the server message verbatim', () => {
    expect(
      classifyLeavePreviewFailure({ status: 500, code: 'SERVER_ERROR', message: 'Server is angry' }, 'revoke'),
    ).toEqual({ message: 'Server is angry' });
  });

  it('a message-less non-offline failure falls back to the transport line', () => {
    expect(
      classifyLeavePreviewFailure({ status: 502, code: 'SERVER_ERROR', message: '' }, 'cancel'),
    ).toEqual({ message: "Couldn't load the preview. Check your connection." });
  });
});

describe('convertPartialFailureMessage (Story 20-1, AC 10)', () => {
  it('appends the already-cancelled plain line after a terminated server message', () => {
    expect(
      convertPartialFailureMessage('You can file a new request from tomorrow.'),
    ).toBe(
      'You can file a new request from tomorrow. Your half-day request is already cancelled.',
    );
  });

  it('a server message without a full stop gets its stop — the two sentences never fuse ("off Your")', () => {
    expect(convertPartialFailureMessage('Those dates are already off')).toBe(
      'Those dates are already off. Your half-day request is already cancelled.',
    );
  });

  it('a question/already-punctuated message is not double-stopped', () => {
    expect(convertPartialFailureMessage('Try again later?')).toBe(
      'Try again later? Your half-day request is already cancelled.',
    );
  });

  it('an empty server message still leaves the employee knowing the truth', () => {
    expect(convertPartialFailureMessage('')).toBe(
      'Your half-day request is already cancelled.',
    );
  });
});
