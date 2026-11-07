/**
 * useLogOut — the same forced-logout flow as a 401 expiry (story 5.3): the
 * reset registry wipes every store, the token is cleared, and the session is
 * reset so the gate sends the person back to login. The registry owns the
 * store list — a hand-rolled copy would drift the first time a new store
 * registers.
 *
 * Firebase push (frozen matrix "Explicit logout"): the FCM token follows
 * the login lifecycle — the bearer is captured BEFORE the stored token is
 * cleared (the DELETE must authenticate as the session that registered the
 * token), then the teardown is FIRE-AND-FORGET so it can never block or
 * delay logout: local FCM deleteToken + backend DELETE; a failed backend
 * call lands in the pending-deletion slot and retries on the next app
 * start. The telemetry identity is cleared too (Analytics + Crashlytics
 * stop attributing to this user).
 */
import { useCallback } from 'react';
import { runAllResets } from '../../services';
import { getAuthToken, clearAuthToken } from '../../services/authToken';
import { clearTelemetryRole } from '../../services/telemetry';
import { unregisterPush } from '../push/pushToken';
import { useAuth } from './useAuth';

export function useLogOut(): () => void {
  const { reset } = useAuth();
  return useCallback(() => {
    const bearer = getAuthToken();
    clearAuthToken();
    // Fire-and-forget: logout never waits on the network (frozen matrix).
    void unregisterPush({ notifyBackend: true, bearer });
    clearTelemetryRole();
    runAllResets();
    reset();
  }, [reset]);
}
