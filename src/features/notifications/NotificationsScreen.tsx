/**
 * NotificationsScreen — the shared notification inbox (Story 3.4, redesigned
 * 2026-09; generalized to both roles in Story 14-3 — one screen, never a
 * second inbox).
 *
 * A full-screen root-stack route (sibling of JobDetail / TechJobDetail —
 * covers the tab bar), opened from either bell (Jobs header, Home header,
 * technician Today header). Newest-first cursor-paginated list over the
 * `useNotifications` shared store: loads on focus (TTL-throttled in the
 * store), pages in on scroll-end, pulls to refresh, and carries the
 * "Mark all as read" action in its header.
 *
 * The redesign renders one CARD per job (grouped client-side from the flat
 * list by `notificationCardModel.ts` — the card's stage timeline comes from
 * that job's own notifications, no extra API calls) behind an All / Active /
 * Completed filter chip row. Epic 12 report notifications (`report_ready` /
 * `report_failed`, job_id NULL) get their own card kind instead (see
 * `reportNotificationModel.ts`): they show under "All" only — the Active /
 * Completed chips are job-status buckets — and their button opens the
 * Reports screen, never JobDetail.
 *
 * Story 14-3's event-type registry (`notificationEventRegistry.ts`) decides
 * what EVERY row renders as, keyed on event type + role: job-status rows →
 * the grouped job card, report rows → the report card (owner only), and
 * anything this build doesn't know yet → the inert generic card. A tap's
 * deep link routes per role: job cards open JobDetail for the owner and
 * TechJobDetail for the technician; report cards are owner-only; generic
 * cards are not tappable. The empty state has no action button: notifications
 * can be of many types, so no single destination fits.
 *
 * Tapping a card is NAVIGATE-FIRST: the deep link to that event's screen is
 * the user's intent; the optimistic mark-read of the card's unread events is
 * cosmetic and happens alongside it (read cards still navigate — no POST,
 * no rollback ceremony).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Bell,
  CalendarOff,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Undo2,
  XCircle,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, IconButton, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type {
  MainTabParamList,
  RootStackParamList,
  TechnicianRootStackParamList,
  TechnicianTabParamList,
} from '../../navigation/types';
import { useAuth } from '../auth/useAuth';
import {
  loadMoreNotifications,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from './useNotifications';
import { NotificationCard } from './components/NotificationCard';
import { NotificationFilterBar } from './components/NotificationFilterBar';
import { GenericNotificationCard } from './components/GenericNotificationCard';
import { filterCards, groupNotificationsByJob } from './notificationCardModel';
import {
  buildReportCards,
  mergeNotificationCards,
} from './reportNotificationModel';
import {
  buildAttendanceCards,
  buildGenericCards,
  type AttendanceNotificationCardData,
  type SessionRole,
} from './notificationEventRegistry';
import {
  buildLeaveCards,
  type LeaveCardIconName,
  type LeaveNotificationCardData,
} from './leaveNotificationModel';
import {
  buildJobAssignedCards,
  type JobAssignedNotificationCardData,
} from './jobAssignedNotificationModel';
import { isAttendanceReachable } from '../../services/attendanceAccessEvents';
import { useJobTemplateCache } from './useJobTemplateCache';
import {
  openTapTarget,
  tapTargetForAttendance,
  tapTargetForJobCard,
  tapTargetForReportCard,
  tapTargetForLeave,
  type TapNavigate,
} from './notificationTapModel';
import { PushPermissionCard } from '../push/PushPermissionCard';
import type { NotificationFilter } from './notificationCardModel';
import type {
  NotificationListItem,
  TappableNotificationListItem,
} from './reportNotificationModel';

/**
 * Both stacks' routes plus both tab groups, in one param list — the shared
 * screen is registered in the owner's RootNavigator AND the technician's
 * TechnicianRootNavigator (Story 14-3), and the role decides which routes a
 * tap leads to: job cards → JobDetail (owner) / TechJobDetail (technician),
 * report cards → Reports (owner), the empty-state CTA → the Jobs tab
 * (owner). `Notifications` itself is deliberately declared in both stacks
 * (this screen's own route), so the intersection typechecks for every
 * `navigate` below — cross-tree routes are kept apart only by the runtime
 * role guards, not by the types.
 */
type SharedRoutes = RootStackParamList &
  TechnicianRootStackParamList &
  MainTabParamList &
  TechnicianTabParamList;

type Props = NativeStackScreenProps<SharedRoutes, 'Notifications'>;

/**
 * The D5 card glyph map — the model's icon names to lucide components,
 * styled exactly like the generic card's default bell (same slot, same
 * size/stroke).
 */
const LEAVE_CARD_ICONS: Record<
  LeaveCardIconName,
  typeof CalendarOff
> = {
  CalendarOff,
  CalendarX,
  CheckCircle2,
  Clock,
  XCircle,
  Undo2,
};

function LeaveCardIcon({ name }: { name: LeaveCardIconName }) {
  const Icon = LEAVE_CARD_ICONS[name];
  return <Icon size={18} color={colors.textStrong} strokeWidth={2} />;
}

export default function NotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  // The screen is only reachable with a company session; `company_admin` is
  // also the bootstrap fallback so the original behaviour is the default.
  const role: SessionRole = session?.role ?? 'company_admin';
  const {
    items,
    isLoading,
    isLoadingMore,
    error,
    mutationError,
    hasLoaded,
    hasMore,
    loadUnreadCount,
    refresh,
    markNotificationRead,
  } = useNotifications();

  // Same discipline as JobsScreen: refetch on focus (the store throttles),
  // so returning to the screen picks up events fired while it was closed.
  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
      void loadUnreadCount();
    }, [loadNotifications, loadUnreadCount]),
  );

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
    void loadUnreadCount({ force: true });
  }, [refresh, loadUnreadCount]);

  const handleMarkAllRead = useCallback(() => {
    void markAllNotificationsRead();
    // The badge is shared state — the store force-refetches the count from
    // the server on success; a failure lands in `mutationError` (banner
    // below) and reconciles via the store's server re-ask.
  }, []);

  /**
   * The kind→route decisions live in `notificationTapModel.ts` — the ONE
   * shared mapping the push tap also uses (Firebase spec CAP-3), so a push
   * always lands where the bell's tap for the same event lands. This side
   * only adds the cosmetic optimistic mark-read (navigate first was the
   * old order; here the mark-read is fired alongside — both fire-and-forget
   * or synchronous, never blocking the navigation).
   */
  const navigate = useCallback<TapNavigate>(
    (name, params) => {
      // The shared route names span BOTH stacks' param lists (no single
      // type covers them — see SharedRoutes above), so the executor's
      // permissive signature is the honest one; runtime validity is the
      // tap model's job (role guards + the delegate form). A param-less
      // route is called WITHOUT the second argument — the recorded call
      // shape is part of the screens' pinned tap contracts.
      const loose = navigation.navigate as unknown as TapNavigate;
      if (params === undefined) loose(name);
      else loose(name, params);
    },
    [navigation],
  );

  const handleCardPress = useCallback(
    (card: TappableNotificationListItem) => {
      // Job and report cards route differently (and a report card carries
      // no jobId at all) — the decisions live in the shared tap model.
      const target =
        card.kind === 'report'
          ? tapTargetForReportCard(role)
          : tapTargetForJobCard(role, card.jobId);
      if (target === null) return;
      // Opening a job's card settles ALL of its unread events (the POSTs
      // are idempotent; a card usually carries at most a couple).
      for (const id of card.unreadIds) void markNotificationRead(id);
      openTapTarget(navigate, target, 'inbox');
    },
    [markNotificationRead, navigate, role],
  );

  // Memoize job IDs to avoid refetch on every render. Report notifications
  // carry jobId null — never a template-lookup target.
  const jobIds = useMemo(
    () => items.flatMap(n => (n.jobId !== null ? [n.jobId] : [])),
    [items],
  );
  // Fetch workflow templates for all notification jobs to display dynamic stages.
  // Also returns an update trigger that fires when templates load.
  const { getTemplate, updateTrigger } = useJobTemplateCache(jobIds);

  // The flat newest-first list becomes one card per job; the stage timeline
  // on each card is derived from that job's own notifications AND the job's
  // stamped workflow template (Story 4.5 dynamic). Rebuild when templates load.
  // Report notifications (jobId null) are skipped by the grouping itself.
  const cards = useMemo(
    () => groupNotificationsByJob(items, getTemplate),
    [items, getTemplate, updateTrigger],
  );
  // Epic 12: report notifications get their own one-card-per-row cards —
  // owner only (the registry renders them generic for technicians).
  const reportCards = useMemo(() => buildReportCards(items, role), [items, role]);
  // Story 14-3: the event-type registry's fallback — unknown event types
  // (later attendance/leave epics) render the inert generic card, one per
  // row, under "All" only. Owner job/report rows are classified exactly as
  // before, so this is additive.
  const genericCards = useMemo(() => buildGenericCards(items, role), [items, role]);
  // Story 15-10: attendance.* rows (technician) — composed-copy cards whose
  // tap is guarded by the access seam (no Attendance tab for `none`).
  const attendanceCards = useMemo(() => buildAttendanceCards(items, role), [items, role]);
  // Story 17-6: the leave cards — role-keyed, composed copy per the D5
  // table, each with its own glyph and tap target.
  const leaveCards = useMemo(() => buildLeaveCards(items, role), [items, role]);
  // Firebase plan (user decision 2026-11-07): the technician's assignment
  // notices — one readable "New job assigned" card per `job.assigned` row,
  // never a workflow-step stage (the grouper skips them).
  const jobAssignedCards = useMemo(() => buildJobAssignedCards(items), [items]);
  // Interleaved by recency under "All"; the job buckets (below) stay job-only.
  const listCards = useMemo(
    () =>
      mergeNotificationCards(
        cards,
        reportCards,
        genericCards,
        attendanceCards,
        leaveCards,
        jobAssignedCards,
      ),
    [cards, reportCards, genericCards, attendanceCards, leaveCards, jobAssignedCards],
  );
  const [filter, setFilter] = useState<NotificationFilter>('all');
  // Active/Completed are JOB-status buckets — report and generic
  // notifications show under "All" only and never enter either bucket.
  const visibleCards = useMemo(
    () => (filter === 'all' ? listCards : filterCards(cards, filter)),
    [listCards, cards, filter],
  );
  // Derived through the SAME `filterCards` the list filters with — a drifted
  // card counts as active in both places, and the chips can never disagree
  // with what a filter actually shows. "All" counts every card (jobs +
  // reports + generic).
  const counts = useMemo(
    () => ({
      all:
        cards.length +
        reportCards.length +
        genericCards.length +
        attendanceCards.length +
        leaveCards.length +
        jobAssignedCards.length,
      active: filterCards(cards, 'active').length,
      completed: filterCards(cards, 'completed').length,
    }),
    [cards, reportCards, genericCards, attendanceCards, leaveCards, jobAssignedCards],
  );

  // 15-10: attendance taps mark the row read, then deep link ONLY when the
  // access seam says the Attendance tab exists — a card from an enrolment
  // since revoked must never navigate to a route that is not registered
  // (FR-3; the seam mirrors the store's `attendanceAccess !== 'none'`).
  // 19-4: the OWNER's summary card (`dashboard` tap) bypasses that guard —
  // it lands on the AttendanceDashboard, an owner-stack route that never
  // rides the tab seam. The decisions (incl. the guard-consults-first
  // no-op and the nested-delegate form) live in the shared tap model.
  const handleAttendanceCardPress = useCallback(
    (card: AttendanceNotificationCardData) => {
      const target = tapTargetForAttendance(card.tap, isAttendanceReachable);
      if (target === null) return;
      for (const id of card.unreadIds) void markNotificationRead(id);
      openTapTarget(navigate, target, 'inbox');
    },
    [markNotificationRead, navigate],
  );

  // 17-6: leave-card taps. Owner cards land on the Leave surface's right
  // segment (leave.applied → Pending — the actionable queue; every other
  // owner event → All). Employee cards reuse the 15-10 guarded attendance
  // tap: the guard consults FIRST, so a card about an employee whose
  // tracking was since disabled (cancelled_by_disable's exact audience)
  // no-ops — the tab no longer exists for them.
  const handleLeaveCardPress = useCallback(
    (card: LeaveNotificationCardData) => {
      const target = tapTargetForLeave(card.tap, isAttendanceReachable);
      if (target === null) return;
      for (const id of card.unreadIds) void markNotificationRead(id);
      openTapTarget(navigate, target, 'inbox');
    },
    [markNotificationRead, navigate],
  );

  // Firebase plan (user decision 2026-11-07): an assignment card's tap is
  // the SHARED job-card decision — the technician lands on TechJobDetail,
  // exactly where the push tap for the same event lands.
  const handleJobAssignedCardPress = useCallback(
    (card: JobAssignedNotificationCardData) => {
      const target = tapTargetForJobCard(role, card.jobId);
      if (target === null) return;
      for (const id of card.unreadIds) void markNotificationRead(id);
      openTapTarget(navigate, target, 'inbox');
    },
    [markNotificationRead, navigate, role],
  );

  const renderCard = useCallback(
    ({ item }: { item: NotificationListItem }) =>
      item.kind === 'generic' ? (
        <GenericNotificationCard card={item} />
      ) : item.kind === 'attendance' ? (
        <GenericNotificationCard
          card={item}
          onPress={() => handleAttendanceCardPress(item)}
        />
      ) : item.kind === 'leave' ? (
        <GenericNotificationCard
          card={item}
          icon={<LeaveCardIcon name={item.icon} />}
          onPress={() => handleLeaveCardPress(item)}
        />
      ) : item.kind === 'job-assigned' ? (
        <GenericNotificationCard
          card={item}
          onPress={() => handleJobAssignedCardPress(item)}
        />
      ) : (
        <NotificationCard card={item} onPress={handleCardPress} />
      ),
    [handleAttendanceCardPress, handleCardPress, handleJobAssignedCardPress, handleLeaveCardPress],
  );

  const hasData = items.length > 0;
  // A failed load with nothing to show replaces the empty state entirely —
  // "no notifications yet" would be a lie when the request just failed.
  const failedWithNoData = Boolean(error) && !isLoading && !hasData;

  // A failed refresh with rows already on screen: keep the rows, explain why
  // they may be stale (JobsScreen precedent). The dismissal is local — the
  // store's error clears on the next successful load.
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  // A failed mark-read / mark-all: the rows rolled back (or the server was
  // re-asked) — the banner is the only signal, since the list looks normal.
  const [mutationDismissed, setMutationDismissed] = useState(false);
  useEffect(() => {
    setMutationDismissed(false);
  }, [mutationError]);

  const showBanner = Boolean(error) && hasData && !errorDismissed;
  const showMutationError = Boolean(mutationError) && hasData && !mutationDismissed;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          Notifications
        </Text>
        {/* Always rendered once the list has loaded: with nothing unread the
            POST is an idempotent no-op, and hiding the action would invite a
            stale-count trap (a missed live event with unread rows on screen). */}
        <Button
          variant="secondary"
          size="sm"
          onPress={handleMarkAllRead}
          disabled={!hasData}
          leadingIcon={<Check size={16} color={colors.textStrong} strokeWidth={2.5} />}>
          Mark all as read
        </Button>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failedWithNoData ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={error ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void refresh()}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* Firebase plan: the existing-installs permission ask lives in
              context, here — one inline card while notifications are off
              (denial keeps today's in-app-only behaviour). */}
          <PushPermissionCard />
          <NotificationFilterBar value={filter} onChange={setFilter} counts={counts} />
          {showBanner ? (
            <View style={styles.bannerWrap}>
              <InlineError message={error ?? ''} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          {showMutationError ? (
            <View style={styles.bannerWrap}>
              <InlineError
                message={mutationError ?? ''}
                onDismiss={() => setMutationDismissed(true)}
              />
            </View>
          ) : null}
          <FlatList
            data={visibleCards}
            keyExtractor={item => item.key}
            renderItem={renderCard}
            onEndReached={() => void loadMoreNotifications()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : undefined // RN 0.87 list types reject `null` here
            }
            // When empty: flexGrow gives the empty state's `flex: 1` a height
            // to centre itself in.
            contentContainerStyle={[
              styles.listContent,
              visibleCards.length === 0 && styles.listContentEmpty,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              hasData ? (
                // Rows exist but this filter matches none of them — a quiet
                // line, not the "no notifications yet" empty state (which
                // would lie).
                <Text style={styles.filterEmpty}>
                  {filter === 'active'
                    ? 'No ongoing jobs right now.'
                    : 'No finished jobs yet.'}
                </Text>
              ) : (
                <EmptyState
                  icon={<Bell size={36} color={colors.primary} strokeWidth={1.5} />}
                  title="No notifications yet"
                  description={
                    role === 'employee'
                      ? 'Updates for you will show up here.'
                      : 'Updates from your employees — job arrivals, progress, completions and report updates — will show up here.'
                  }
                />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  footerSpinner: {
    paddingVertical: spacing.s4,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.s3,
  },
  filterEmpty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.s4,
  },
});
