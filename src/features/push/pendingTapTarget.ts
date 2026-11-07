/**
 * features/push/pendingTapTarget.ts — the held cold-start tap target, in a
 * module of its own so the logout chain (useLogOut → pushToken) never
 * imports `navigation/navigationRef` (whose module init calls
 * `createNavigationContainerRef()` — several screen suites partially mock
 * `@react-navigation/native` and must not gain that dependency). The
 * navigation side (reading the container's readiness, flushing) lives in
 * `pushTap.ts`; this file is just the slot.
 */
import type { NotificationTapTarget } from '../notifications/notificationTapModel';

/** One held cold-start tap (at most one — a cold start opens one message). */
let pendingTarget: NotificationTapTarget | null = null;

/** Holds a target for the container's `onReady` flush. */
export function holdPendingPushTap(target: NotificationTapTarget): void {
  pendingTarget = target;
}

/** Takes the held target (clearing it), or null when nothing is held. */
export function takePendingPushTap(): NotificationTapTarget | null {
  const target = pendingTarget;
  pendingTarget = null;
  return target;
}

/** Sign-out (explicit or forced) — a held target is stale, drop it. */
export function discardPendingPushTap(): void {
  pendingTarget = null;
}
