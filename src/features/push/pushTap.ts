/**
 * features/push/pushTap.ts — the push tap seam (Firebase spec CAP-3).
 * `FirebaseBridge` feeds every tap surface through `handlePushTap`:
 *
 *   - cold start (app opened BY the tap): `getInitialNotification` — the
 *     navigation tree does not exist yet, so the resolved target is HELD;
 *   - background/quit → foreground (tap on the system notification):
 *     `onNotificationOpenedApp` — the tree is normally ready, so the tap
 *     navigates immediately.
 *
 * A held target is flushed by the NavigationContainer's `onReady`
 * (`flushPendingPushTap`, wired in App.tsx) the moment the signed-in tree
 * exists. It is DROPPED on sign-out (`discardPendingPushTap` from
 * unregisterPush) — a target computed under session A must never land
 * session B somewhere A's role allowed.
 *
 * The route decision itself is the bell's shared mapping
 * (notifications/notificationTapModel.ts) — same role rules, same
 * attendance guard, same unknown-type no-op ("app opens, no navigation").
 */
import type { RemoteMessage } from '@react-native-firebase/messaging';
import { navigationRef } from '../../navigation/navigationRef';
import type { UserRole } from '../../services';
import {
  openTapTarget,
  pushTapTargetForEvent,
  type TapNavigate,
} from '../notifications/notificationTapModel';
import { holdPendingPushTap, takePendingPushTap } from './pendingTapTarget';

/**
 * The hybrid message's data payload: `{ type: <event_type>, id: <job_id ?? entity_id> }`
 * — flat strings (stack.md's message contract). Anything missing/malformed
 * reads as null and lands on the no-navigation path.
 */
export function messageData(message: RemoteMessage): { type: string | null; id: string | null } {
  const data = message.data;
  const type = typeof data?.type === 'string' && data.type.length > 0 ? data.type : null;
  const id = typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
  return { type, id };
}

function navigateViaRef(): TapNavigate {
  // navigationRef is typed to RootStackParamList; the shared route names
  // span both stacks (TechJobDetail / TechnicianTabs live on the technician
  // side) — the tap model owns runtime validity, the cast is the bridge.
  // A param-less route is called WITHOUT the second argument (the same
  // call-shape contract the inbox's pinned tap tests hold).
  const loose = navigationRef.navigate as unknown as TapNavigate;
  return (name, params) => {
    if (params === undefined) loose(name);
    else loose(name, params);
  };
}

/**
 * One push tap landed. Computes the bell's target for the CURRENT role;
 * navigates when the tree is ready, holds it otherwise (cold start).
 */
export function handlePushTap(message: RemoteMessage, role: UserRole | null): void {
  const { type, id } = messageData(message);
  const target = pushTapTargetForEvent(type, id, role);
  if (target === null) return; // unknown type — the app opens, no navigation
  if (navigationRef.isReady()) {
    openTapTarget(navigateViaRef(), target, 'push');
  } else {
    holdPendingPushTap(target);
  }
}

/**
 * NavigationContainer `onReady` — flush the cold-start tap held before the
 * tree existed. (The tree only mounts for a signed-in company session, so
 * a signed-out cold start never flushes: the matrix's "dropped when signed
 * out".)
 */
export function flushPendingPushTap(): void {
  if (!navigationRef.isReady()) return;
  const target = takePendingPushTap();
  if (target === null) return;
  openTapTarget(navigateViaRef(), target, 'push');
}
