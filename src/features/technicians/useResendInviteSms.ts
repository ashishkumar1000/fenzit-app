/**
 * useResendInviteSms — the Resend action for one invited person.
 *
 * Server data goes through `technicianService.resendInviteSms`; the outcome
 * (status, in-flight, cap, error copy) is local UI state for one row or one
 * notice, so nothing is written to the shared technicians store.
 *
 * `inFlightRef` is the same-frame double-tap guard: `inFlight` state only
 * commits after the render, so two taps in one frame would both pass it.
 */
import { useCallback, useRef, useState } from 'react';
import { technicianService } from '../../services';
import type { ApiError } from '../../services';
import { parseInviteSmsStatus, resendErrorMessage, RESEND_UNKNOWN_COPY } from './inviteSms';
import type { InviteSmsStatus } from './types';

export function useResendInviteSms(
  membershipUserId: string,
  initialStatus: InviteSmsStatus | null,
  /** Called with the new status after a successful resend, so the caller can persist it. */
  onStatus?: (status: InviteSmsStatus) => void,
) {
  const [smsStatus, setSmsStatus] = useState<InviteSmsStatus | null>(initialStatus);
  const [inFlight, setInFlight] = useState(false);
  /** A 429 this session: the button stays visible but disabled, with the reason beside it. */
  const [capReached, setCapReached] = useState(false);
  /** A 403: the button is hidden and the copy says why. */
  const [forbidden, setForbidden] = useState(false);
  /** A 404 or 409: the invite can no longer be resent, so the button is hidden. */
  const [gone, setGone] = useState(false);
  const [errorCopy, setErrorCopy] = useState('');
  const inFlightRef = useRef(false);

  const resend = useCallback(async () => {
    if (inFlightRef.current || capReached) return;
    inFlightRef.current = true;
    setInFlight(true);
    setErrorCopy('');
    try {
      const next = parseInviteSmsStatus(
        await technicianService.resendInviteSms(membershipUserId),
      );
      if (next === null) {
        setErrorCopy(RESEND_UNKNOWN_COPY);
        return;
      }
      setSmsStatus(next);
      onStatus?.(next);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'INVITE_SMS_LIMIT_REACHED') {
        // The reason is shown by the status line (INVITE_SMS_CAP_COPY), not here.
        setCapReached(true);
        return;
      }
      if (apiErr.code === 'NOT_COMPANY_ADMIN' || apiErr.code === 'FORBIDDEN') {
        setForbidden(true);
      } else if (
        apiErr.code === 'INVITE_NOT_FOUND' ||
        apiErr.code === 'NOT_FOUND' ||
        apiErr.code === 'INVITE_NOT_PENDING'
      ) {
        setGone(true);
      }
      setErrorCopy(resendErrorMessage(apiErr));
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }, [membershipUserId, capReached, onStatus]);

  return { smsStatus, inFlight, capReached, forbidden, gone, errorCopy, resend };
}
