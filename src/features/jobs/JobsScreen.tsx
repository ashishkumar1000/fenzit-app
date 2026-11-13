/**
 * JobsScreen — the owner's full job timeline: a segmented scope control
 * (Today · Upcoming · Overdue · History) over the status filter chips, plus a
 * "+ New job" action that pushes the NewJob route.
 *
 * Live data via the `useJobs` store (`GET /jobs?scope=…`): loads on mount and
 * on focus (throttled server-side in the store, so coming back from a created
 * job refreshes without hammering the endpoint), pages in on scroll-end, and
 * pulls to refresh. Home's stat tiles navigate here pre-set to a scope — the
 * one-shot `scope` route param is consumed then cleared on focus (tab params
 * persist, so an uncleared param would re-apply on every tab-bar focus).
 *
 * Chips are visible only where status is user-selectable: all five under
 * Today, All/Done/Cancelled under History. Upcoming and Overdue hide the row —
 * the server pre-narrows status there, so chips would lie. Every
 * scope × chip combination gets its own real empty-state copy.
 *
 * List rows carry only `customerId`/`technicianId`, so display names are
 * resolved client-side: customers from the customers store, technicians from
 * the roster in `GET /users/me`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  BellIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClipboardListIcon,
  PlusIcon,
  WrenchIcon,
  type IconComponent,
} from './icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, IconButton, InlineError, SegmentedControl } from '../../components/ui';
import { PushEnableCard, PUSH_CARD_CLEARANCE } from '../push/PushEnableCard';
import { isAdminRole, useCanWrite, useSessionRole } from '../auth';
import { colors, spacing, typography } from '../../theme';
import { useNow } from '../../hooks';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { loadMyProfile, useMyProfile } from '../profile';
import { useCustomers } from '../customers';
import { useNotifications } from '../notifications';
import { bellBadgeLabel } from '../notifications/bellBadge';
import { JobCard } from './components/JobCard';
import { StatusFilterBar } from './components/StatusFilterBar';
import { DispatchTip } from './components/DispatchTip';
import { PendingQueue } from './components/PendingQueue';
import { useJobs } from './useJobs';
import { TODAY_FILTERS, filterForScope, HISTORY_FILTERS } from './scopeFilters';
import { loadApprovalQueue } from './useApprovalQueue';
import type { ApiJob, JobFilter, JobScope } from './types';

/**
 * The segment values the owner's tab offers: the four timeline buckets plus
 * Epic 22's Pending queue — not a `GET /jobs` scope at all (its list comes
 * from `GET /approval-queue`, so the screen keeps a segment state distinct
 * from the store's `scope`).
 */
type ScreenScope = JobScope | 'pending';

/** Scope selector labels — the timeline buckets + the approval queue. */
const SCOPES: { value: ScreenScope; label: string; badge?: number }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'history', label: 'History' },
  { value: 'pending', label: 'Pending' },
];

/**
 * Empty-state icon + copy per scope × chip — the icon hints at the section's
 * meaning so empty pages aren't identical. Today keeps the original per-chip
 * entries (the Story 1.1 baseline); the other scopes get their own.
 */
type EmptyStateSpec = { icon: IconComponent; title: string; description: string };

// The employee-only `pending_approval` filter never reaches this screen
// (its chips never offer it and `filterForScope` resets it on any scope
// change), so the map excludes it. `rejected` is a real History chip here
// (Epic 22) — the owner sees tenant-wide rejections too.
const EMPTY_BY_FILTER: Record<
  Exclude<JobFilter, 'pending_approval'>,
  { icon: IconComponent; description: string }
> = {
  all: {
    icon: ClipboardListIcon,
    description:
      'Create your first job to assign it to an employee and track it through to completion.',
  },
  scheduled: {
    icon: CalendarClockIcon,
    description: 'Jobs booked for a future date and time will show up here.',
  },
  in_progress: {
    icon: WrenchIcon,
    description:
      'Jobs an employee has started, but not yet finished, will show up here.',
  },
  completed: {
    icon: CircleCheckIcon,
    description: 'Jobs an employee has marked complete will show up here.',
  },
  cancelled: {
    icon: CircleXIcon,
    description: 'Jobs called off before completion will show up here.',
  },
  rejected: {
    icon: CircleXIcon,
    description: 'Jobs declined on review will show up here.',
  },
};

function emptyStateFor(scope: JobScope, filter: JobFilter): EmptyStateSpec {
  if (scope === 'today') {
    // Belt for the type system: the employee-only `pending_approval` chip
    // and the Rejected chip can't survive a move to Today (filterForScope
    // resets both), but the index must stay total.
    return {
      title: 'No jobs yet',
      ...EMPTY_BY_FILTER[
        filter === 'pending_approval' || filter === 'rejected' ? 'all' : filter
      ],
    };
  }
  if (scope === 'upcoming') {
    return {
      icon: CalendarClockIcon,
      title: 'No upcoming jobs',
      description: 'Jobs booked for tomorrow or later will show up here.',
    };
  }
  if (scope === 'overdue') {
    return {
      icon: CircleAlertIcon,
      title: 'Nothing overdue',
      description: 'Jobs past their date that were never finished will show up here.',
    };
  }
  if (filter === 'completed') {
    return { title: 'No history yet', ...EMPTY_BY_FILTER.completed };
  }
  if (filter === 'cancelled') {
    return { title: 'No history yet', ...EMPTY_BY_FILTER.cancelled };
  }
  if (filter === 'rejected') {
    return { title: 'No history yet', ...EMPTY_BY_FILTER.rejected };
  }
  return {
    icon: ClipboardListIcon,
    title: 'No history yet',
    description: 'Finished, cancelled or declined jobs will show up here.',
  };
}

/**
 * Jobs is a tab screen, but "New job" is a full-screen route on the root
 * stack — hence the composite props rather than plain tab props.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Jobs'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function JobsScreen({ navigation, route }: Props) {
  const [pushCardShown, setPushCardShown] = useState(false);
  const {
    jobs,
    filter,
    scope,
    isLoading,
    isLoadingMore,
    error,
    loadJobs,
    loadMoreJobs,
    refresh,
    setFilter,
  } = useJobs();
  const { customers } = useCustomers();
  const { profile } = useMyProfile();
  // Epic 22 — the Pending segment is screen-local (it reads the approval
  // queue, not the jobs store), so the segment state lives here while the
  // store's `scope` keeps tracking the GET /jobs buckets.
  const [pendingSelected, setPendingSelected] = useState(false);
  const segment: ScreenScope = pendingSelected ? 'pending' : scope;
  // The bell's badge (Story 3.4) — refreshed on focus below, TTL-throttled
  // in the store, and driven live by the 3.3 socket's own refetch.
  const { unreadCount, loadUnreadCount } = useNotifications();
  // The Pending segment is admin-only (the queue endpoint is company-
  // admin-only); read once at the top so both the focus effect (deep link)
  // and the segment list can gate on it.
  const sessionRole = useSessionRole();
  const isAdminViewer = isAdminRole(sessionRole);

  // The urgency rail's clock — one 60s tick for the whole list. `now` is in
  // renderJob's deps, so every visible row re-renders on each tick (cheap at
  // list scale); that's what turns rails green→amber→red as thresholds pass.
  const now = useNow();

  // Server-computed overdue count for the segment badge — the same figure
  // Home's Overdue strip shows, so the two screens can never disagree.
  const overdueCount = profile?.jobCounts.overdue ?? 0;

  // Refetch on every focus — the stores throttle (skipping within 15s of a
  // success), so returning from a created job shows it without extra load.
  // The profile refetch keeps the Overdue badge live; job mutations elsewhere
  // already force-refresh it (NewJob, JobDetail), this covers tab hopping.
  // Home's tiles land here with a one-shot `scope` param: applied when it
  // differs from the store's scope, then cleared immediately — tab params
  // persist across navigations, so leaving it would re-apply on every later
  // tab-bar focus and fight a scope the user picked manually. Param
  // consumption happens BEFORE the focus refetch, inside the same effect, so
  // the param's load and the focus refetch are one query, not a race.
  useFocusEffect(
    useCallback(() => {
      const paramScope = route.params?.scope;
      if (paramScope === 'pending' && isAdminViewer) {
        // Epic 22 — the Home strip's deep link: the Pending segment is
        // screen-local, so this branch only flips the segment (the queue
        // store's mount effect loads it). Admin-only: a viewer has no
        // Pending segment (and the strip only deep-links for admins).
        if (!pendingSelected) setPendingSelected(true);
      } else if (
        paramScope &&
        // A viewer deep-linked with `pending` has no such segment — ignore.
        paramScope !== 'pending' &&
        (paramScope !== scope || pendingSelected)
      ) {
        setPendingSelected(false);
        void loadJobs(paramScope, filterForScope(filter, paramScope));
      }
      if (paramScope) {
        navigation.setParams({ scope: undefined });
      }
      void loadJobs();
      void loadMyProfile();
      void loadUnreadCount();
      // Epic 22 — returning to the tab while the Pending queue is on screen
      // refreshes it too (the store throttles within its TTL window).
      if (pendingSelected) {
        void loadApprovalQueue();
      }
    }, [route.params?.scope, scope, filter, loadJobs, navigation, loadUnreadCount, pendingSelected, isAdminViewer]),
  );

  /** Scope selector handler — one `loadJobs` with the reset/kept filter. */
  const handleScopeChange = useCallback(
    (next: ScreenScope) => {
      if (next === segment) return;
      if (next === 'pending') {
        setPendingSelected(true);
        return;
      }
      setPendingSelected(false);
      void loadJobs(next, filterForScope(filter, next));
    },
    [segment, filter, loadJobs],
  );

  // `customerId` → display name, for the card titles.
  const customerNames = useMemo(
    () => new Map(customers.map(c => [c.id, c.name])),
    [customers],
  );

  // `technicianId` → display name, from the server-issued roster.
  const technicianNames = useMemo(
    () => new Map((profile?.technicians ?? []).map(t => [t.id, t.name])),
    [profile],
  );
  const technicianAvatarUrls = useMemo(
    () => new Map((profile?.technicians ?? []).map(t => [t.id, t.avatarUrl ?? null])),
    [profile],
  );

  // A failed refresh keeps its rows on screen behind a dismissible banner;
  // the dismissal is local (the store's error clears on the next success).
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  const hasData = jobs.length > 0;
  // A failed load with nothing to show replaces the empty state entirely —
  // "no jobs yet" would be a lie when the request just failed.
  const failedWithNoData = Boolean(error) && !isLoading && !hasData;
  const showBanner = Boolean(error) && hasData && !errorDismissed;

  // Pull-to-refresh runs over rows already on screen, where the store's
  // `isLoading` deliberately stays false — so the spinner is local state.
  // The profile is force-refreshed alongside: the Overdue badge and the
  // dispatch tip read `jobCounts`, and a stale badge next to a fresh list
  // would contradict itself. Forced past the 15s focus throttle, as on Home.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
    void loadMyProfile({ force: true });
  }, [refresh]);

  const isEmpty = !isLoading && !failedWithNoData && !hasData;
  const { icon: EmptyIcon, title: emptyTitle, description: emptyDescription } =
    emptyStateFor(scope, filter);

  const canWrite = useCanWrite();
  // Epic 22 — the Pending segment is the OWNER's approval queue: a viewer
  // cannot decide anything, and the queue endpoint is company-admin-only —
  // a viewer who opened it would land in a permanent 403 InlineError
  // (review 2026-11-13). The segment simply doesn't exist for them.
  const scopesForViewer = useMemo(
    () => (isAdminViewer ? SCOPES : SCOPES.filter(s => s.value !== 'pending')),
    [isAdminViewer],
  );

  const handleNewJob = () => {
    navigation.navigate('NewJob');
  };

  const handleOpenNotifications = () => {
    navigation.navigate('Notifications');
  };

  const handleOpenJob = useCallback(
    (job: ApiJob) => {
      navigation.navigate('JobDetail', { jobId: job.id });
    },
    [navigation],
  );

  /** The Pending queue's rows carry only the id — same destination. */
  const handleOpenJobById = useCallback(
    (jobId: string) => {
      navigation.navigate('JobDetail', { jobId });
    },
    [navigation],
  );

  const renderJob = useCallback(
    ({ item }: { item: ApiJob }) => (
      <JobCard
        job={item}
        scope={scope}
        // Every scope gets the rail now (Today / Upcoming / Overdue /
        // History): the model in urgency.ts gates inactive rows itself, so
        // History (always completed/cancelled) renders no rail.
        urgencyNow={now}
        customerName={customerNames.get(item.customerId)}
        technicianName={technicianNames.get(item.technicianId)}
        technicianAvatarUrl={technicianAvatarUrls.get(item.technicianId) ?? null}
        onPress={handleOpenJob}
      />
    ),
    [customerNames, technicianNames, technicianAvatarUrls, scope, now, handleOpenJob],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <View style={styles.headerActions}>
          <IconButton
            variant="ghost"
            size="md"
            label="Notifications"
            onPress={handleOpenNotifications}>
            <BellIcon size={22} color={colors.textStrong} strokeWidth={2} />
            {unreadCount !== null && unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{bellBadgeLabel(unreadCount)}</Text>
              </View>
            ) : null}
          </IconButton>
          {/* A viewer cannot create jobs — the button is hidden, not
              dead (the viewer's Home states "View-only access"). */}
          {canWrite ? (
            <Button
              variant="primary"
              size="md"
              shape="pill"
              onPress={handleNewJob}
              leadingIcon={<PlusIcon size={18} color={colors.onPrimary} />}>
              New job
            </Button>
          ) : null}
        </View>
      </View>

      <View style={styles.filterWrap}>
        <SegmentedControl
          options={scopesForViewer.map(s =>
            s.value === 'overdue' && overdueCount > 0 ? { ...s, badge: overdueCount } : s,
          )}
          value={segment}
          onChange={handleScopeChange}
          // Five full-word scopes don't fit equal slots on a phone without
          // truncating — content-sized segments keep every label whole (the
          // track scrolls if a future scope set ever overflows).
          sizing="content"
        />
        {/* Chips only where status is user-selectable: all five under Today,
            All/Done/Cancelled under History. Upcoming and Overdue hide the
            row — the server pre-narrows status there, so chips would lie.
            The row stays visible even with no jobs, as in Story 1.1, so the
            sections stay discoverable. Visual hierarchy: the segmented
            control owns "you are here" (view switching); these chips are a
            filter and use a soft-tint active state (StatusFilterBar). */}
        {segment === 'today' || segment === 'history' ? (
          <StatusFilterBar
            value={filter}
            onChange={setFilter}
            filters={segment === 'today' ? TODAY_FILTERS : HISTORY_FILTERS}
          />
        ) : null}
      </View>

      {/* Epic 22 — the Pending segment swaps the jobs tree for the approval
          queue: different endpoint, different row shape, own state grammar
          (PendingQueue), so nothing of the GET /jobs branch runs under it. */}
      {segment === 'pending' ? (
        <PendingQueue onOpenJob={handleOpenJobById} />
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failedWithNoData ? (
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the
              way out, so this banner stays non-dismissible. */}
          <InlineError message={error ?? 'Something went wrong'} />
          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              void refresh();
              void loadMyProfile({ force: true }); // fresh jobCounts for the badge too
            }}>
            Retry
          </Button>
        </View>
      ) : (
        <>
          {/* A failed refresh with rows already on screen: keep the rows,
              explain why they may be stale. */}
          {showBanner ? (
            <View style={styles.bannerWrap}>
              <InlineError message={error ?? ''} onDismiss={() => setErrorDismissed(true)} />
            </View>
          ) : null}
          <FlatList
            data={jobs}
            keyExtractor={item => item.id}
            renderItem={renderJob}
            onEndReached={() => void loadMoreJobs()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerSpinner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : undefined // RN 0.87 list types reject `null` here
            }
            // When empty: flexGrow gives EmptyState's `flex: 1` a height to
            // centre itself in, and the list padding drops away since
            // EmptyState brings its own horizontal inset.
            contentContainerStyle={[
              styles.listContent,
              isEmpty && styles.listContentEmpty,
              pushCardShown && { paddingBottom: PUSH_CARD_CLEARANCE },
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
              // One empty state for every scope — copy and icon come from
              // emptyStateFor(). Upcoming adds the "Schedule a job" CTA
              // (the header "New job" stays the single entry point on the
              // other scopes) and, when work is actually overdue, the tip
              // strip pointing at the Overdue segment.
              <View style={styles.emptyList}>
                <EmptyState
                  icon={<EmptyIcon size={36} color={colors.primary} strokeWidth={1.5} />}
                  title={emptyTitle}
                  description={
                    canWrite || filter !== 'all'
                      ? emptyDescription
                      : 'Jobs your team creates will show up here.'
                  }
                  ctaLabel={canWrite && scope === 'upcoming' ? 'Schedule a job' : undefined}
                  ctaIcon={
                    canWrite && scope === 'upcoming' ? (
                      <PlusIcon size={20} color={colors.onPrimary} />
                    ) : undefined
                  }
                  onPressCta={canWrite && scope === 'upcoming' ? handleNewJob : undefined}
                />
                {scope === 'upcoming' && overdueCount > 0 ? (
                  <DispatchTip overdueCount={overdueCount} />
                ) : null}
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
      <PushEnableCard onVisibleChange={setPushCardShown} />
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  // Bell + "New job" grouped on the trailing edge of the header row.
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // Unread count pill, overlaid on the bell's top-right corner.
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    ...typography.captionStrong,
    color: colors.onPrimary,
  },
  filterWrap: {
    paddingLeft: spacing.s4,
    paddingRight: spacing.s4,
    paddingBottom: spacing.s3,
    // Gap between the segmented control and the status chip row (s3 = 12).
    // No-op on Upcoming/Overdue, where the chip row is hidden.
    gap: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
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
  listContent: {
    padding: spacing.s4,
  },
  listContentEmpty: {
    flexGrow: 1,
    paddingHorizontal: 0,
  },
  emptyList: {
    flex: 1,
  },
  separator: {
    height: spacing.s3,
  },
});
