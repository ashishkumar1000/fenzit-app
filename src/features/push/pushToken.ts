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
import {
  clearPendingDeletion,
  readPendingDeletion,
  savePendingDeletion,
} from './pendingDeletion';
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
 * Retries a pending logout deletion (signed in or not — App.tsx kicks this
 * once per cold start, and registration awaits it too, so a stale token's
 * DELETE lands BEFORE the next register). Serialized: one in-flight retry
 * at a time; a failure keeps the pending slot for the next start.
 */
let retryInFlight: Promise<void> | null = null;

export function retryPendingDeletion(): Promise<void> {
  // Clear the in-flight slot on every outcome, including "nothing pending".
  // Otherwise a settled promise stays cached and later failed logouts in this
  // session never get retried.
  retryInFlight ??= runPendingDeletionRetry().finally(() => {
    retryInFlight = null;
  });
  return retryInFlight;
}

async function runPendingDeletionRetry(): Promise<void> {
  const pending = readPendingDeletion();
  if (!pending) return;
  try {
    await deviceTokenService.unregister(pending.token, pending.bearer);
    clearPendingDeletion();
  } catch (err) {
    console.warn('[push] pending token deletion retry failed (kept):', err);
  }
}

/**
 * Registers one FCM token against the signed-in user (an idempotent upsert
 * on the token PK — StrictMode double-mounts and rotation both land here).
 * A failed offline-logout deletion retries FIRST, so a shared phone's token
 * rebinds to the new user with the old user's row already gone.
 */
export async function registerFcmToken(token: string): Promise<void> {
  await retryPendingDeletion();
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
 * A failed backend DELETE records the pending slot; a forced-401 call
 * (`notifyBackend: false`) is local-only per the matrix. Never throws.
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
    clearPendingDeletion();
  } catch (err) {
    console.warn('[push] backend token delete failed — will retry next start:', err);
    savePendingDeletion(token, bearer);
  }
}
