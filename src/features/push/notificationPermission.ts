/**
 * features/push/notificationPermission.ts — the notification permission
 * seam (Firebase spec CAP-1/3, UX spec "Asking for permission").
 *
 * The PROBE answers "are notifications actually enabled" on EVERY platform
 * state, not just the Android 13 dialog: on Android RNFB's hasPermission
 * maps onto NotificationManagerCompat.areNotificationsEnabled, so a user
 * who switched notifications off in Settings (any Android version) reads
 * as denied — exactly what the two offer-cards must show.
 *
 * The REQUEST (an explicit Allow tap — never at launch):
 *   - Android 13+ (API ≥ 33): the OS POST_NOTIFICATIONS prompt, while it
 *     can still be shown; `never_ask_again` reports 'never_ask'.
 *   - Older Android, "don't ask again", or switched off in Settings: there
 *     is no prompt left to show — 'never_ask' tells the caller to route
 *     straight to the app's Settings.
 *   - iOS: RNFB's requestPermission (the APNs-backed prompt). A never-asked
 *     user sees the OS dialog; an already-denied user gets no dialog and
 *     reports 'denied' (the cards then open Settings — iOS has no
 *     never-ask signal).
 *   - Anything else: granted (web/other platforms never run here).
 *
 * Denial keeps today's in-app-only behaviour — nothing in the app gates on
 * this except the offer cards.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getMessaging,
  hasPermission,
  requestPermission,
} from '@react-native-firebase/messaging';

export type NotificationPermissionState = 'granted' | 'denied';

/**
 * Result of an explicit request: 'never_ask' means the OS will not (or
 * cannot) prompt again — the caller routes to the app's Settings.
 */
export type NotificationPermissionRequestResult = 'granted' | 'denied' | 'never_ask';

/** Android 13 (API 33) is where POST_NOTIFICATIONS became a runtime permission. */
const ANDROID_RUNTIME_PERMISSION_API = 33;

// Copy constants for the OS dialog (UX spec final copy): named, in one place.
const REQUEST_DIALOG_TITLE = 'Notifications';
const REQUEST_DIALOG_MESSAGE =
  'Allow Fenzit to notify you about job assignments, attendance and reports.';
const REQUEST_DIALOG_POSITIVE = 'Allow';
const REQUEST_DIALOG_NEGATIVE = 'Cancel';

function isAuthorizedStatus(status: number): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL ||
    status === AuthorizationStatus.EPHEMERAL
  );
}

/**
 * The CURRENT state — "are notifications actually enabled" (no OS prompt).
 * 'denied' covers every not-enabled state, including iOS's not-determined
 * and Android's switched-off-in-Settings — the rows/cards that show
 * "Allow" are exactly what a denied probe means. Fail-closed to 'denied'
 * (the primer's probe rule): the caller then offers Allow, and tapping it
 * runs the real request.
 */
export async function notificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    if (Platform.OS === 'android') {
      // RNFB's hasPermission maps onto NotificationManagerCompat
      // .areNotificationsEnabled() on Android — it covers the API < 33
      // settings switch AND the API ≥ 33 runtime permission alike.
      const status = await hasPermission(getMessaging());
      return isAuthorizedStatus(status) ? 'granted' : 'denied';
    }
    if (Platform.OS === 'ios') {
      const status = await hasPermission(getMessaging());
      return isAuthorizedStatus(status) ? 'granted' : 'denied';
    }
    return 'granted';
  } catch (err) {
    console.warn('[push] permission probe failed:', err);
    return 'denied';
  }
}

/**
 * Fires the OS prompt IN CONTEXT where one still exists (Android 13+ before
 * "don't ask again"). Every can't-prompt state reports 'never_ask' — older
 * Android versions have no runtime prompt at all (notifications are managed
 * in Settings), and an already-permanently-denied API 33+ install gets no
 * dialog either — so the caller opens the app's Settings.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionRequestResult> {
  try {
    if (Platform.OS === 'android') {
      if (Number(Platform.Version) < ANDROID_RUNTIME_PERMISSION_API) return 'never_ask';
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: REQUEST_DIALOG_TITLE,
          message: REQUEST_DIALOG_MESSAGE,
          buttonPositive: REQUEST_DIALOG_POSITIVE,
          buttonNegative: REQUEST_DIALOG_NEGATIVE,
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'never_ask' : 'denied';
    }
    if (Platform.OS === 'ios') {
      // iOS shows its prompt once. A status already DENIED means no prompt
      // can appear again, so the caller must route to Settings.
      const before = await hasPermission(getMessaging());
      if (before === AuthorizationStatus.DENIED) return 'never_ask';
      const status = await requestPermission(getMessaging());
      return isAuthorizedStatus(status) ? 'granted' : 'denied';
    }
    return 'granted';
  } catch (err) {
    console.warn('[push] permission request failed:', err);
    return 'denied';
  }
}
