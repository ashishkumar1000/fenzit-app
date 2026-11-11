/**
 * useResendInviteSms — the owner's Resend action, one invited person at a time.
 *
 * What the owner relies on:
 *   - a successful Resend shows the new SMS status;
 *   - a 429 (5 texts in an hour) stops further taps for this session;
 *   - a 403 / 404 / 409 hides the action, and the copy says why;
 *   - a network problem leaves the action usable;
 *   - a double tap in one frame sends one text, not two.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { technicianService } from '../../services';
import type { ApiError } from '../../services';
import { useResendInviteSms } from './useResendInviteSms';
import {
  RESEND_CONNECTION_COPY,
  RESEND_FORBIDDEN_COPY,
  RESEND_GONE_COPY,
  RESEND_UNKNOWN_COPY,
} from './inviteSms';

jest.mock('../../services', () => ({
  technicianService: { resendInviteSms: jest.fn() },
}));

const resendMock = technicianService.resendInviteSms as jest.Mock;
const MEMBER_ID = '4a4a2a57-5b9b-4c26-8c86-8f77fbc1e497';

function apiError(code: string): ApiError {
  return { code, message: 'server text' } as unknown as ApiError;
}

type Hook = ReturnType<typeof useResendInviteSms>;

function renderResend(initial: 'failed' | 'sent' | null = 'failed') {
  const ref: { current: Hook | null } = { current: null };
  function Harness() {
    ref.current = useResendInviteSms(MEMBER_ID, initial);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Harness />);
  });
  return { ref, renderer };
}

async function tapResend(ref: { current: Hook | null }) {
  await act(async () => {
    await ref.current!.resend();
  });
}

beforeEach(() => {
  resendMock.mockReset();
});

describe('useResendInviteSms', () => {
  it('sends the membership user id to the resend endpoint', async () => {
    resendMock.mockResolvedValue('sent');
    const { ref } = renderResend();
    await tapResend(ref);
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('takes the new status from a successful resend', async () => {
    resendMock.mockResolvedValue('sent');
    const { ref } = renderResend('failed');
    await tapResend(ref);
    expect(ref.current!.smsStatus).toBe('sent');
    expect(ref.current!.errorCopy).toBe('');
  });

  it('shows the generic copy and keeps the old status when the reply is not a known status', async () => {
    resendMock.mockResolvedValue('weird_value');
    const { ref } = renderResend('failed');
    await tapResend(ref);
    expect(ref.current!.errorCopy).toBe(RESEND_UNKNOWN_COPY);
    expect(ref.current!.smsStatus).toBe('failed');
  });

  it('shows the generic copy when the reply is empty (null)', async () => {
    resendMock.mockResolvedValue(null);
    const { ref } = renderResend('failed');
    await tapResend(ref);
    expect(ref.current!.errorCopy).toBe(RESEND_UNKNOWN_COPY);
  });

  it('on 429: marks the cap reached, and a further tap does not call the server', async () => {
    resendMock.mockRejectedValue(apiError('INVITE_SMS_LIMIT_REACHED'));
    const { ref } = renderResend();
    await tapResend(ref);
    expect(ref.current!.capReached).toBe(true);
    // The cap reason is shown once, by the status line; no second error line here.
    expect(ref.current!.errorCopy).toBe('');
    expect(ref.current!.forbidden).toBe(false);
    expect(ref.current!.gone).toBe(false);

    await tapResend(ref);
    expect(resendMock).toHaveBeenCalledTimes(1);
  });

  it('on 403 NOT_COMPANY_ADMIN: hides the action with the admin-only copy', async () => {
    resendMock.mockRejectedValue(apiError('NOT_COMPANY_ADMIN'));
    const { ref } = renderResend();
    await tapResend(ref);
    expect(ref.current!.forbidden).toBe(true);
    expect(ref.current!.gone).toBe(false);
    expect(ref.current!.capReached).toBe(false);
    expect(ref.current!.errorCopy).toBe(RESEND_FORBIDDEN_COPY);
  });

  it.each(['INVITE_NOT_FOUND', 'NOT_FOUND', 'INVITE_NOT_PENDING'])(
    'on %s: hides the action because the invite can no longer be resent',
    async code => {
      resendMock.mockRejectedValue(apiError(code));
      const { ref } = renderResend();
      await tapResend(ref);
      expect(ref.current!.gone).toBe(true);
      expect(ref.current!.forbidden).toBe(false);
      expect(ref.current!.errorCopy).toBe(RESEND_GONE_COPY);
    },
  );

  it.each(['TIMEOUT', 'NETWORK_ERROR'])(
    'on %s: keeps the action usable and says to check the connection',
    async code => {
      resendMock.mockRejectedValueOnce(apiError(code)).mockResolvedValueOnce('sent');
      const { ref } = renderResend();
      await tapResend(ref);
      expect(ref.current!.errorCopy).toBe(RESEND_CONNECTION_COPY);
      expect(ref.current!.forbidden).toBe(false);
      expect(ref.current!.gone).toBe(false);
      expect(ref.current!.capReached).toBe(false);

      await tapResend(ref);
      expect(resendMock).toHaveBeenCalledTimes(2);
      expect(ref.current!.errorCopy).toBe('');
      expect(ref.current!.smsStatus).toBe('sent');
    },
  );

  it('on an unknown error code: shows the generic copy and hides nothing', async () => {
    resendMock.mockRejectedValue(apiError('SOMETHING_NEW'));
    const { ref } = renderResend();
    await tapResend(ref);
    expect(ref.current!.errorCopy).toBe(RESEND_UNKNOWN_COPY);
    expect(ref.current!.forbidden).toBe(false);
    expect(ref.current!.gone).toBe(false);
    expect(ref.current!.capReached).toBe(false);
  });

  it('a double tap in the same frame sends one text, not two', async () => {
    let finish!: (value: string) => void;
    resendMock.mockImplementation(
      () => new Promise<string>(resolve => (finish = resolve)),
    );
    const { ref } = renderResend();
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = ref.current!.resend();
      second = ref.current!.resend();
    });
    await act(async () => {
      finish('sent');
      await Promise.all([first, second]);
    });
    expect(resendMock).toHaveBeenCalledTimes(1);
  });

  it('clears the previous error when the next attempt starts', async () => {
    resendMock.mockRejectedValueOnce(apiError('TIMEOUT')).mockResolvedValueOnce('failed');
    const { ref } = renderResend();
    await tapResend(ref);
    expect(ref.current!.errorCopy).toBe(RESEND_CONNECTION_COPY);
    await tapResend(ref);
    expect(ref.current!.errorCopy).toBe('');
    expect(ref.current!.smsStatus).toBe('failed');
  });
});

describe('useResendInviteSms: saving the result', () => {
  function renderWithCallback(onStatus: jest.Mock) {
    const ref: { current: Hook | null } = { current: null };
    function Harness() {
      ref.current = useResendInviteSms(MEMBER_ID, 'failed', onStatus);
      return null;
    }
    act(() => {
      create(<Harness />);
    });
    return ref;
  }

  it('reports the new status to the caller after a successful resend', async () => {
    resendMock.mockResolvedValue('sent');
    const onStatus = jest.fn();
    const ref = renderWithCallback(onStatus);
    await tapResend(ref);
    expect(onStatus).toHaveBeenCalledWith('sent');
  });

  it('does not report a status when the resend fails', async () => {
    resendMock.mockRejectedValue(apiError('TIMEOUT'));
    const onStatus = jest.fn();
    const ref = renderWithCallback(onStatus);
    await tapResend(ref);
    expect(onStatus).not.toHaveBeenCalled();
  });
});
