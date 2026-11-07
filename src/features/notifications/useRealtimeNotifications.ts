/**
 * useRealtimeNotifications — Supabase Realtime as a refetch hint for the
 * signed-in user, whichever role they have (Story 3.3, generalized to both
 * roles in Story 14-3). One socket, one hook, no per-role duplication: the
 * channel machinery below is role-agnostic, and only the event handler
 * branches on the session role.
 *
 * OWNER events (job status / report terminal events) — the original Story
 * 3.3/12-6 behaviour, unchanged: an event force-refetches the jobs store
 * (`GET /jobs` — the Jobs tab) AND the profile store (`GET /users/me` —
 * Home's counts and Today's-jobs cards, a user-approved post-spec
 * extension) and raises a transient banner; report events route to the
 * reports store instead. All job state keeps flowing from those GETs
 * through the existing stores.
 *
 * TECHNICIAN events — the inbox is the consumer: an event force-refetches
 * the shared notification list + unread-count stores. No job banner (job
 * status events are never emitted to technicians — epic non-goal) and no
 * owner-store refetches. Later epics' event types need no change here: the
 * frontend event-type registry (notificationEventRegistry.ts) owns what a
 * row renders as.
 *
 * Lifecycle rules (per the story spec):
 * - Foreground-only: one socket while the app is `active`, zero while
 *   backgrounded (`'inactive'` counts as background — app-switcher glances
 *   tear down and re-subscribe; that flap is accepted battery-friendly
 *   behaviour, not a bug).
 * - Topic-derived-from-profile: `user:<user_id>:notifications`, rebuilt
 *   whenever the signed-in user changes (profile store resets to null on
 *   the global 401 reset, which tears the socket down with it).
 * - Silent degradation: a failed token exchange or socket error is
 *   log-only — the app is fully functional without the socket via the
 *   existing focus-refresh/pull-to-refresh paths.
 * - `resetRegistry` teardown composes with the global 401 reset that App.tsx
 *   wires via `setOnUnauthorized → runAllResets()`.
 *
 * Mounted ONLY via `RealtimeBridge` in BOTH role branches of App.tsx's role
 * gate (never at `App()` top level — the role gate is a conditional render
 * chain). `enabled: false` (no session) means zero Realtime code runs: no
 * listener, no subscription, no token exchange.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '../auth/useAuth';
import { isCompanyWideRole } from '../auth/roles';
import { loadMyProfile, useMyProfile } from '../profile/useMyProfile';
import { loadJobs } from '../jobs/useJobs';
// Story 12-6: report terminal events (`report_ready` / `report_failed`)
// ride the same channel — they force-refetch the reports store instead of
// raising the job-status banner (owner branch only).
import { loadReports } from '../reports/useReports';
// Story 3.4: a broadcast is the cheapest unread-count signal there is —
// refresh the bell's badge alongside the stores it already force-refetches.
// Story 14-3: the notification list itself joins it on the technician
// branch — the inbox is a technician's only consumer of these events.
import { loadNotifications, loadUnreadCount } from './useNotifications';
// Firebase plan (user decision 2026-11-07): `job.assigned` refreshes the
// technician's job list (Today) — the same cross-feature-loader pattern the
// owner branch's loadJobs uses; no import cycle (technicianApp never
// imports notifications).
import { loadToday } from '../technicianApp/useTechnicianJobs';
import {
  emitAttendanceAccessRefresh,
  isAttendanceEventType,
} from '../../services/attendanceAccessEvents';
import {
  getRealtimeToken,
  getUserChannel,
  registerReset,
  teardownChannel,
  userNotificationsTopic,
} from '../../services';
import type { UserRole } from '../../services';
import {
  BANNER_VISIBLE_MS,
  bannerPartsFromEvent,
  bannerTextFromParts,
  eventRowPayload,
  notificationEventType,
  notificationStepStatus,
  type JobStatusEventPayload,
} from './notificationBannerModel';
import {
  JOB_ASSIGNED_TITLE,
  readJobAssignedParts,
} from './jobAssignedNotificationModel';
import type { StatusKey } from '../../theme';

export interface OwnerNotificationBanner {
  /** Render-ready line (all fields joined), e.g. "Priya · JOB-1042 · On my way" — also the accessibility label. */
  text: string;
  /** Per-field parts — the toast renders each independently, dropping whatever the payload lacked. */
  technicianName: string | null;
  jobNumber: string | null;
  /** UX spec: the technician's `job.assigned` banner carries the customer as its third chip; owner banners leave it null. */
  customerName: string | null;
  stepLabel: string | null;
  stepStatus: StatusKey;
}

/**
 * The foreground gate, extracted pure so the AppState rule is unit-testable
 * without a device. iOS nuance: only `'active'` subscribes — `'inactive'`
 * (app switcher, notification-centre glance) counts as background.
 */
export function shouldSubscribe(appState: string | null | undefined): boolean {
  // RN 0.87 types AppState.currentState as string | null | undefined
  // (transient states) — anything that isn't 'active' is not foreground.
  return appState === 'active';
}

/**
 * The designed push seam (Firebase spec NFR-G): the role-aware store
 * refresh, extracted verbatim from the Realtime event handler so a push's
 * foreground `onMessage` can call the SAME refresh the socket would. Takes
 * the event type (or null when the payload carried none) and the signed-in
 * session's role:
 *
 * - Technician branch (Story 14-3) — the inbox is the consumer: the shared
 *   notification list + unread-count stores, past their TTLs. An
 *   `attendance.*` event also refreshes the entry-point gate via the
 *   neutral seam (AD-19; the module boundary forbids importing the
 *   attendance feature from here).
 * - Owner branch — report terminal events (`report_ready` /
 *   `report_failed`) route to the reports store; every other event
 *   force-refetches the jobs store, the bell badge and the profile store
 *   (Home's counts; the heavy-endpoint caveat from the original Story 3.3
 *   note still stands).
 *
 * No banner here — the banner is Realtime-only presentation (the hook's
 * handler keeps it); push refreshes stores silently (spec CAP-3).
 */
export function refreshStoresForEvent(
  eventType: string | null,
  role: UserRole | null,
): void {
  if (!isCompanyWideRole(role)) {
    if (eventType !== null && isAttendanceEventType(eventType)) {
      emitAttendanceAccessRefresh();
    }
    // Firebase plan (user decision 2026-11-07): a `job.assigned` event also
    // refreshes the technician's job list — Today is where an assignment
    // shows up, and its TTL would otherwise hide the new job on the next
    // focus. Realtime and foreground push share this seam, so both paths
    // refresh.
    if (eventType === 'job.assigned') {
      void loadToday({ force: true });
    }
    void loadNotifications({ force: true });
    void loadUnreadCount({ force: true });
    return;
  }
  if (eventType === 'report_ready' || eventType === 'report_failed') {
    void loadReports({ force: true });
    void loadUnreadCount({ force: true });
    return;
  }
  void loadJobs(undefined, undefined, { force: true });
  void loadUnreadCount({ force: true });
  void loadMyProfile({ force: true });
}

interface UseRealtimeNotificationsOptions {
  /** `false` (no session) suspends everything. */
  enabled?: boolean;
}

export function useRealtimeNotifications(
  options: UseRealtimeNotificationsOptions = {},
): { banner: OwnerNotificationBanner | null } {
  const { enabled = true } = options;
  const { session } = useAuth();
  const { profile } = useMyProfile();
  const userId = profile?.id ?? null;

  // The event handler reads the role through a ref: the handler closes over
  // refs only, so a session/role change can never leave a stale role in a
  // still-registered channel callback.
  const roleRef = useRef<UserRole | null>(session?.role ?? null);
  roleRef.current = session?.role ?? null;

  const [banner, setBanner] = useState<OwnerNotificationBanner | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  /** Topic the CURRENT session listens on — events from a stale topic are dropped. */
  const topicRef = useRef<string | null>(null);

  const dismissTimer = () => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  };

  /**
   * A new event while a banner is visible REPLACES the content and RESETS
   * the timer — the first event's timer must never dismiss the second
   * event's banner.
   */
  const raiseBanner = (record: OwnerNotificationBanner) => {
    dismissTimer();
    setBanner(record);
    bannerTimerRef.current = setTimeout(() => {
      bannerTimerRef.current = null;
      setBanner(null);
    }, BANNER_VISIBLE_MS);
  };

  const showBanner = (payload: JobStatusEventPayload | null) => {
    const parts = bannerPartsFromEvent(payload);
    raiseBanner({
      text: bannerTextFromParts(parts),
      technicianName: parts.technicianName,
      jobNumber: parts.jobNumber,
      customerName: null,
      stepLabel: parts.stepLabel,
      stepStatus: notificationStepStatus(parts.step),
    });
  };

  /**
   * UX spec (resolved Open Question 2): the technician's foreground
   * `job.assigned` banner — the owner StatusBanner pattern, 4s. Raised from
   * the REALTIME path only; FCM's onMessage stays a silent store refresh
   * (Realtime and FCM deliver the same row, so nothing can ever double).
   * Copy mirrors the inbox card: "New job assigned · JOB-1042 · customer",
   * present parts only (payload drift degrades per field, never a crash).
   */
  const showAssignedBanner = (payload: JobStatusEventPayload | null) => {
    const { jobNumber, customerName } =
      payload && typeof payload === 'object'
        ? readJobAssignedParts(payload as Record<string, unknown>)
        : { jobNumber: null, customerName: null };
    const line = [JOB_ASSIGNED_TITLE, jobNumber, customerName]
      .filter((v): v is string => v !== null)
      .join(' · ');
    raiseBanner({
      text: line.length > 0 ? line : JOB_ASSIGNED_TITLE,
      technicianName: null,
      jobNumber,
      customerName,
      stepLabel: JOB_ASSIGNED_TITLE,
      stepStatus: 'neutral',
    });
  };

  // The Realtime event handler: the socket-side caller of
  // `refreshStoresForEvent` (the push seam above). It keeps ONLY the
  // Realtime-specific guards (stale-topic drop, foreground gate) and the
  // owner banner — the store refresh itself lives in the exported seam.
  const handleJobStatusEvent = (topic: string, message: unknown) => {
    // In-flight event from a channel the session has already moved off —
    // an event can land after a user switch before teardown completes.
    if (topicRef.current !== topic) return;
    // Mid-flight event after a background teardown — the channel's removal
    // is async, so its handler can still fire while the app is backgrounded;
    // the foreground rule forbids any banner/refetch work in that state.
    if (!shouldSubscribe(AppState.currentState)) return;

    const eventType = notificationEventType(message);
    // Banners are Realtime-path-only presentation (push's foreground
    // delivery refreshes the stores silently — spec CAP-3), so nothing can
    // ever double:
    //   - company-wide roles: every non-report event raises the job-status
    //     banner, exactly as before;
    //   - the technician: a `job.assigned` raises the assignment banner
    //     (UX spec Open Question 2 — the mirror of the owner's toast).
    if (
      isCompanyWideRole(roleRef.current) &&
      eventType !== 'report_ready' &&
      eventType !== 'report_failed'
    ) {
      showBanner(eventRowPayload(message));
    } else if (!isCompanyWideRole(roleRef.current) && eventType === 'job.assigned') {
      showAssignedBanner(eventRowPayload(message));
    }
    refreshStoresForEvent(eventType, roleRef.current);
  };

  useEffect(() => {
    if (!enabled || !userId) {
      topicRef.current = null;
      dismissTimer();
      setBanner(null);
      return undefined;
    }

    const topic = userNotificationsTopic(userId);
    topicRef.current = topic;
    let disposed = false;

    const teardownCurrentChannel = () => {
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) teardownChannel(channel);
    };

    const setupChannel = async () => {
      if (disposed || channelRef.current) return;
      const token = await getRealtimeToken();
      if (disposed || !token || topicRef.current !== topic) return;
      // The token fetch awaited a state change mid-flight — never open a
      // socket the foreground rule now forbids (backgrounding during the
      // fetch used to leave the socket subscribed while backgrounded).
      if (!shouldSubscribe(AppState.currentState)) return;

      const channel = getUserChannel(userId)
        .on('broadcast', { event: 'INSERT' }, (message: unknown) =>
          handleJobStatusEvent(topic, message),
        )
        .subscribe(status => {
          // Log-only — connect failures are silent to the user.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[useRealtimeNotifications] socket ${status} on ${topic}`);
          }
        });
      // Re-check everything the await may have invalidated (a rapid
      // background/foreground flap can have two setups in flight — the
      // loser's channel is torn down here, not overwritten into a leak).
      if (
        disposed ||
        topicRef.current !== topic ||
        !shouldSubscribe(AppState.currentState) ||
        channelRef.current
      ) {
        teardownChannel(channel);
        return;
      }
      channelRef.current = channel;
    };

    const onAppStateChange = (state: string) => {
      if (shouldSubscribe(state)) void setupChannel();
      else teardownCurrentChannel();
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    if (shouldSubscribe(AppState.currentState)) void setupChannel();

    // Global 401 reset: socket gone, banner gone. Registered while mounted
    // (the bridge unmounts with the session) — mirrors the
    // one-line-per-store pattern in resetRegistry.ts.
    const unregisterReset = registerReset(() => {
      teardownCurrentChannel();
      topicRef.current = null;
      dismissTimer();
      setBanner(null);
    });

    return () => {
      disposed = true;
      subscription.remove();
      unregisterReset();
      teardownCurrentChannel();
      topicRef.current = null;
      dismissTimer();
    };
    // handleJobStatusEvent closes over stable refs only; showBanner over
    // refs — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);

  return { banner };
}
