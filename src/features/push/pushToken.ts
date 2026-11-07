/**
 * features/push/pushToken.ts — the FCM token lifecycle (Firebase spec
 * CAP-1). The token follows the LOGIN lifecycle (frozen matrix):
 *
 *   register  — after sign-in and on every signed-in app start, and again
 *               on FCM rotation (`onTokenRefresh` in FirebaseBridge);
 *   unregister— on explicit logout (local deleteToken + backend DELETE with
 *               the bearer captured BEFORE the session is cleared; never
 *               blocks logout) and on a forced 401 (local deleteToken only).
 *
 * Every backend failure is log-only — push is additive, an API failure
 * must never surface. The last-registered token is kept in MMKV so logout
 * can DELETE the exact row even though RNFB's `deleteToken` does not hand
 * the token back.
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  deleteToken,
  getMessaging,
} from '@react-native-firebase/messaging';
import { getAuthToken } from '../../services/authToken';
import { installedAppVersion } from '../../services/clientMetadata';
import { deviceTokenService } from '../../services/resources/deviceTokens';
import type { DeviceTokenPlatform } from '../../services/resources/deviceTokens';
import { storage } from '../../services/storage';
// NOTE: imported from pendingTapTarget (NOT pushTap) so the logout chain
// (useLogOut → this module) never pulls in navigation/navigationRef —
// several screen suites partially mock @react-navigation/native.
import { discardPendingPushTap } from './pendingTapTarget';

const PUSH_TOKEN_KEY = 'fenzit.push.fcmToken';

function currentPlatform(): DeviceTokenPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function storedPushToken(): string | null {
  const token = storage.getString(PUSH_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

function rememberPushToken(token: string): void {
  storage.set(PUSH_TOKEN_KEY, token);
}

function forgetPushToken(): void {
  storage.remove(PUSH_TOKEN_KEY);
}

/**
 * Registers one FCM token against the signed-in user (an idempotent upsert
 * on the token PK — StrictMode double-mounts and rotation both land here).
 * A shared phone's token rebinds to the new user on this upsert, so the old
 * user's row is overwritten rather than left behind.
 */
export async function registerFcmToken(token: string): Promise<void> {
  try {
    await deviceTokenService.register({
      token,
      platform: currentPlatform(),
      appVersion: installedAppVersion(),
    });
    rememberPushToken(token);
  } catch (err) {
    // Log-only (frozen matrix "Register": 404/network are not user-facing).
    console.warn('[push] token registration failed (log-only):', err);
  }
}

/**
 * Tears the FCM token down. `notifyBackend: true` (explicit logout) also
 * DELETEs the backend row with the captured bearer — the caller passes
 * `bearer` when it has already cleared the stored session token (useLogOut
 * clears FIRST, so the fallback `getAuthToken()` read would find nothing).
 * A failed backend DELETE is log-only: the bearer is never stored, and the
 * local FCM token deletion above already stops delivery to this device. A
 * forced-401 call (`notifyBackend: false`) is local-only per the matrix.
 * Never throws.
 */
export async function unregisterPush(opts: {
  notifyBackend: boolean;
  bearer?: string | null;
}): Promise<void> {
  // A sign-out invalidates any tap target computed under the old session.
  discardPendingPushTap();
  const token = storedPushToken();
  forgetPushToken();
  try {
    await deleteToken(getMessaging(getApp()));
  } catch (err) {
    console.warn('[push] local FCM deleteToken failed:', err);
  }
  if (!opts.notifyBackend || !token) return;
  const bearer = opts.bearer !== undefined ? opts.bearer : getAuthToken();
  if (!bearer) return;
  try {
    await deviceTokenService.unregister(token, bearer);
  } catch (err) {
    // No retry queue and no stored bearer. The FCM token is already deleted
    // above, so this device gets no more pushes; the push sweep removes the
    // stale row on its next send (FCM reports it unregistered).
    console.warn('[push] backend token delete failed (sweep cleans up):', err);
  }
}
