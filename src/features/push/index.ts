/**
 * Push feature — public surface (Firebase spec CAP-1/3/4/5).
 *
 * App.tsx mounts `FirebaseBridge` beside RealtimeBridge in BOTH role
 * branches and wires `flushPendingPushTap` to the NavigationContainer's
 * `onReady`; useLogOut and the 401 handler call `unregisterPush`.
 */
export { FirebaseBridge } from './FirebaseBridge';
export { flushPendingPushTap } from './pushTap';
export { unregisterPush } from './pushToken';
export { PushPermissionCard } from './PushPermissionCard';
export { PushEnableCard } from './PushEnableCard';
export {
  notificationPermissionState,
  requestNotificationPermission,
} from './notificationPermission';
export type {
  NotificationPermissionRequestResult,
  NotificationPermissionState,
} from './notificationPermission';
