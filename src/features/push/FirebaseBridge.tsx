/**
 * FirebaseBridge — the mount point for the Firebase wiring (Firebase spec
 * CAP-1/3/5), beside `RealtimeBridge` in BOTH role branches of App.tsx's
 * role gate (never at `App()` top level — the gate is a conditional render
 * chain, so a top-level mount would run Firebase code for unsigned users).
 *
 * Why a bridge: same reasoning as RealtimeBridge — it renders only for a
 * signed-in company session, and internally:
 *   1. re-checks the session (defense in depth; `hasCompanyAccess`),
 *   2. registers the FCM token (start + rotation) — log-only failures,
 *   3. foreground `onMessage` → `refreshStoresForEvent` — the same
 *      role-aware refresh the Realtime socket runs (no system notification
 *      is shown in foreground; spec CAP-3),
 *   4. tap surfaces (`getInitialNotification` cold start +
 *      `onNotificationOpenedApp` background) → the bell's shared tap
 *      mapping via `navigationRef` (cold-start taps are HELD until the
 *      containers' `onReady` flushes them),
 *   5. stamps the telemetry role (Analytics + Crashlytics; no user id) on
 *      profile change and clears it when the session goes away.
 *
 * Renders null always — no UI.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';
import { useAuth } from '../auth/useAuth';
import { hasCompanyAccess } from '../auth/useRole';
import { useMyProfile } from '../profile/useMyProfile';
import { refreshStoresForEvent } from '../notifications/useRealtimeNotifications';
import type { UserRole } from '../../services';
import { setTelemetryRole, clearTelemetryRole } from '../../services/telemetry';
import { messageData, handlePushTap } from './pushTap';
import { claimLaunchTap } from './pendingTapTarget';
import { registerFcmToken } from './pushToken';

export function FirebaseBridge() {
  const { session } = useAuth();
  const { profile } = useMyProfile();
  // Allowlist, not denylist — same gate RealtimeBridge applies: bootstrap
  // (null session), a removed person and Fenzit staff run zero Firebase
  // code (no token exchange, no listeners).
  const enabled = hasCompanyAccess(session);

  // The listeners read the role through a ref: a session/role change can
  // never leave a stale role in a still-registered callback.
  const roleRef = useRef<UserRole | null>(session?.role ?? null);
  roleRef.current = session?.role ?? null;

  useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    const messaging = getMessaging(getApp());

    // Token rotation (frozen matrix "Rotation"): the new token is upserted;
    // the old one is pruned server-side on its next send failure.
    const unsubscribeRefresh = onTokenRefresh(messaging, token => {
      void registerFcmToken(token);
    });

    const registerCurrent = async () => {
      try {
        // iOS must be registered for remote messages before getToken (a
        // no-op on Android — safe to call unconditionally); the ARM64
        // simulator may reject — log-only, iOS delivery ships post-enrollment.
        if (Platform.OS === 'ios') {
          await registerDeviceForRemoteMessages(messaging);
        }
        const token = await getToken(messaging);
        if (!disposed) await registerFcmToken(token);
      } catch (err) {
        console.warn('[push] token registration unavailable:', err);
      }
    };
    void registerCurrent();

    // Foreground: silent store refresh only — the same seam the Realtime
    // socket calls; no system notification (spec CAP-3, matrix "Foreground").
    const unsubscribeMessage = onMessage(messaging, message => {
      const { type } = messageData(message);
      refreshStoresForEvent(type, roleRef.current);
    });

    // Taps. Background/quit: the container is ready (the app was alive in
    // the background) — navigate now. Cold start: hold, `onReady` flushes.
    const unsubscribeOpened = onNotificationOpenedApp(messaging, message => {
      handlePushTap(message, roleRef.current);
    });
    // Launch tap: handled once per process. The claim is taken only when the
    // tap is actually handled, so a read cut short by teardown or a failed
    // read leaves the launch tap for the next mount. A later sign-in on this
    // phone finds the claim spent and must not replay it.
    void (async () => {
      try {
        const initial = await getInitialNotification(messaging);
        if (!disposed && initial && claimLaunchTap()) {
          handlePushTap(initial, roleRef.current);
        }
      } catch (err) {
        console.warn('[push] initial notification read failed:', err);
      }
    })();

    return () => {
      disposed = true;
      unsubscribeRefresh();
      unsubscribeMessage();
      unsubscribeOpened();
    };
    // registerFcmToken / handlePushTap are module functions; roleRef is a
    // ref — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Telemetry role (CAP-4/5): stamp on profile change, clear whenever this
  // effect tears down (role-gate unmount on logout / forced 401 — profile
  // resets to null through the global reset first). Role only, no user id.
  const userId = profile?.id ?? null;
  const userRole = profile?.role ?? null;
  useEffect(() => {
    if (userId !== null) setTelemetryRole(userRole);
    return () => clearTelemetryRole();
  }, [userId, userRole]);

  return null;
}
