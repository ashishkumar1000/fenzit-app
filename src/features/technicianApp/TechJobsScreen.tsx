/**
 * TechJobsScreen — the technician's "Jobs" tab (Epic 22, replaces the old
 * History tab): the same visual system as the owner's JobsScreen — a
 * segmented scope control over status filter chips, JobCard rows, the same
 * list states — riding the SAME `useJobs` store (the server self-scopes
 * employee calls, so one store serves both roles and the two lists can never
 * drift). The owner's screen file is untouched.
 *
 * Differences from the owner's screen, by design:
 *   - Pending is NOT a segment: it is the amber `PendingJobsRow` pinned
 *     under the control (server `scope=all` + the pending_approval status —
 *     a created job waiting for the owner's OK lives on no other scope;
 *     CAP-4 keeps it off the day windows). See the SEGMENTS comment below
 *     for why five segments were rejected (2026-11-13 rework).
 *   - No technician footer on the cards (the employee is themselves), no
 *     DispatchTip, no push card. It DOES read the one-shot `scope`/`filter`
 *     route param (the My-jobs record's Pending/Rejected tiles deep-link
 *     here) — applied once on focus, then cleared, like the owner screen.
 *   - The header action is "Add job", fail-hidden: it renders ONLY while
 *     the profile says `canCreateJobs` (an older backend omits the flag →
 *     hidden; POST /jobs re-checks server-side). It replaces the old
 *     Today-header Plus action. It opens TechNewJob, not NewJob.
 *
 * Epic 22 also retired the old Today-header Plus action — this tab is now
 * the single create entry point.
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
  ClockIcon,
  PlusIcon,
  WrenchIcon,
  type IconComponent,
} from '../jobs/icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  EmptyState,
  IconButton,
  InlineError,
  SegmentedControl,
  type SegmentOption,
} from '../../components/ui';
import { PendingJobsRow } from './components/PendingJobsRow';
import { colors, spacing, typography } from '../../theme';
import { useNow } from '../../hooks';
import type {
  TechnicianRootStackParamList,
  TechnicianTabParamList,
} from '../../navigation/types';
import { loadMyProfile, useMyProfile } from '../profile';
import { useCustomers } from '../customers';
import { useNotifications } from '../notifications';
import { bellBadgeLabel } from '../notifications/bellBadge';
import { JobCard } from '../jobs/components/JobCard';
import { StatusFilterBar } from '../jobs/components/StatusFilterBar';
import { useJobs } from '../jobs/useJobs';
import { TODAY_FILTERS, filterForScope, HISTORY_FILTERS } from '../jobs/scopeFilters';
import type { ApiJob, JobFilter, JobScope } from '../jobs/types';

/**
 * Segment labels — the owner's four timeline buckets. Pending is NOT a
 * segment: five full-word scopes can never fit one equal-width tab row on
 * a phone (they truncated, then a scrollable track lived permanently cut
 * at the left edge), and "waiting for the owner's decision" is an action,
 * not a peer of "Today". Pending is the amber `PendingJobsRow` pinned
 * under the control (2026-11-13 rework); the value type stays widened
 * (`| 'pending'`) so the control can honestly show NO active segment
 * while the Pending list is open — never a fake "Today" highlight.
 */
type JobSegment = (typeof SEGMENTS)[number]['value'];

const SEGMENTS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'history', label: 'History' },
] as const;

/** Empty-state icon + copy per scope × chip — the owner screen's pattern. */
type EmptyStateSpec = { icon: IconComponent; title: string; description: string };

const EMPTY_BY_FILTER: Record<
  Exclude<JobFilter, 'pending_approval'>,
  { icon: IconComponent; description: string }
> = {
  all: {
    icon: ClipboardListIcon,
    description: 'Jobs scheduled for today will show up here.',
  },
  scheduled: {
    icon: CalendarClockIcon,
    description: 'Jobs booked for today will show up here.',
  },
  in_progress: {
    icon: WrenchIcon,
    description: 'Jobs you have started will show up here.',
  },
  completed: {
    icon: CircleCheckIcon,
    description: 'Jobs you have marked complete will show up here.',
  },
  cancelled: {
    icon: CircleXIcon,
    description: 'Jobs called off before completion will show up here.',
  },
  rejected: {
    icon: CircleXIcon,
    description: 'Jobs the owner declined will show up here.',
  },
};

function emptyStateFor(scope: JobScope, filter: JobFilter): EmptyStateSpec {
  if (scope === 'today') {
    // Belt for the type system: `pending_approval` and `rejected` can't
    // survive a move to Today (filterForScope resets both), but the index
    // must stay total.
    return {
      title: 'No jobs today',
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
  if (scope === 'all') {
    return {
      icon: ClockIcon,
      title: 'Nothing waiting for approval',
      description: 'Jobs you create wait here until the owner approves them.',
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
    description:
      'Jobs you finished, or that were cancelled or declined, will show up here.',
  };
}

/**
 * Jobs is a tab screen, but the detail/create/notification routes are
 * full-screen routes on the technician root stack — hence the composite
 * props rather than plain tab props.
 */
type Props = CompositeScreenProps<
  BottomTabScreenProps<TechnicianTabParamList, 'History'>,
  NativeStackScreenProps<TechnicianRootStackParamList>
>;

export default function TechJobsScreen({ navigation, route }: Props) {
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
  // The bell's badge — refreshed on focus below, TTL-throttled in the store.
  const { unreadCount, loadUnreadCount } = useNotifications();

  // The urgency rail's clock — one 60s tick for the whole list.
  const now = useNow();

  // Server-computed overdue count for the segment badge — the same figure
  // Home's Overdue strip shows on the owner side.
  const overdueCount = profile?.jobCounts?.overdue ?? 0;
  // The amber row only earns its place when something actually waits
  // (`pending` is additive on the BE — an older cached profile omits it).
  const pendingCount = profile?.jobCounts?.pending ?? 0;

  // Epic 22 — fail-hidden create entry: only an employee whose profile says
  // `canCreateJobs: true` sees the button.
  const canCreateJobs = profile?.canCreateJobs === true;

  // Refetch on every focus — the stores throttle (skipping within 15s of a
  // success), so returning from a created job shows it without extra load.
  // The profile refetch keeps the Overdue badge live.
  //
  // Epic 22 — the summary card's tiles deep-link a segment: a one-shot
  // `scope` (+ History's `filter` chip) param applies once, then clears —
  // the same consume-and-clear rule the owner Jobs screen applies, so a
  // later tab-bar focus never re-fights a segment the user picked manually.
  useFocusEffect(
    useCallback(() => {
      const paramScope = route.params?.scope;
      if (paramScope) {
        const paramFilter = route.params?.filter;
        if (paramScope === 'pending') {
          void loadJobs('all', 'pending_approval');
        } else {
          void loadJobs(
            paramScope,
            paramFilter ?? filterForScope(filter, paramScope),
          );
        }
        navigation.setParams({ scope: undefined, filter: undefined });
      }
      void loadJobs();
      void loadMyProfile();
      void loadUnreadCount();
    }, [route.params?.scope, route.params?.filter, filter, loadJobs, loadUnreadCount, navigation]),
  );

  /** Segment handler — Pending is `scope=all` + its fixed status filter. */
  const handleScopeChange = useCallback(
    (next: 'today' | 'upcoming' | 'overdue' | 'history' | 'pending') => {
      const currentSegment = scope === 'all' ? 'pending' : scope;
      if (next === currentSegment) return;
      if (next === 'pending') {
        void loadJobs('all', 'pending_approval');
      } else {
        void loadJobs(next, filterForScope(filter, next));
      }
    },
    [scope, filter, loadJobs],
  );

  // `customerId` → display name, for the card titles.
  const customerNames = useMemo(
    () => new Map(customers.map(c => [c.id, c.name])),
    [customers],
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
  // The profile is force-refreshed alongside: the Overdue badge reads
  // `jobCounts`, and a stale badge next to a fresh list would contradict
  // itself. Forced past the 15s focus throttle, as on the owner screen.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
    void loadMyProfile({ force: true });
  }, [refresh]);

  const isEmpty = !isLoading && !failedWithNoData && !hasData;
  const { icon: EmptyIcon, title: emptyTitle, description: emptyDescription } =
    emptyStateFor(scope, filter);

  const handleOpenNotifications = () => {
    navigation.navigate('Notifications');
  };

  const handleOpenNewJob = () => {
    navigation.navigate('TechNewJob');
  };

  const handleOpenJob = useCallback(
    (job: ApiJob) => {
      navigation.navigate('TechJobDetail', { jobId: job.id });
    },
    [navigation],
  );

  const renderJob = useCallback(
    ({ item }: { item: ApiJob }) => (
      <JobCard
        job={item}
        // The Pending segment arrives as store scope `all`; its rows are
        // future (or same-day) work with a real slot, so the card renders
        // the upcoming meta (date · time). The other scopes pass through.
        scope={scope === 'all' ? 'upcoming' : scope}
        // Every scope gets the rail (Today / Upcoming / Overdue / History /
        // Pending): urgency.ts gates inactive rows itself.
        urgencyNow={now}
        customerName={customerNames.get(item.customerId)}
        showFooter={false}
        onPress={handleOpenJob}
      />
    ),
    [customerNames, scope, now, handleOpenJob],
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
          {canCreateJobs ? (
            <Button
              variant="primary"
              size="md"
              shape="pill"
              onPress={handleOpenNewJob}
              leadingIcon={<PlusIcon size={18} color={colors.onPrimary} />}>
              Add job
            </Button>
          ) : null}
        </View>
      </View>

      <View style={styles.filterWrap}>
        <SegmentedControl
          options={SEGMENTS.map(s =>
            s.value === 'overdue' && overdueCount > 0 ? { ...s, badge: overdueCount } : s,
          ) as ReadonlyArray<SegmentOption<JobSegment | 'pending'>>}
          // While the Pending list is open no tab is active — the amber
          // PendingJobsRow below is "you are here".
          value={scope === 'all' ? 'pending' : scope}
          onChange={handleScopeChange}
        />
        {/* Hidden while nothing waits: a row of zeros is noise (the same
            rule the Home strip applies). It stays up while the list is open
            even at zero — it's "you are here" there. */}
        {(scope === 'all' || pendingCount > 0) ? (
          <PendingJobsRow
            active={scope === 'all'}
            onPress={() => handleScopeChange('pending')}
          />
        ) : null}
        {/* Chips only where status is user-selectable (the owner screen's
            rule): the five day-scope chips under Today, and
            All/Done/Cancelled/Rejected under History. Upcoming, Overdue and
            Pending hide the row — the server pre-narrows status there, so
            chips would lie. */}
        {scope === 'today' || scope === 'history' ? (
          <StatusFilterBar
            value={filter}
            onChange={setFilter}
            filters={scope === 'today' ? TODAY_FILTERS : HISTORY_FILTERS}
          />
        ) : null}
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
              <EmptyState
                icon={<EmptyIcon size={36} color={colors.primary} strokeWidth={1.5} />}
                title={emptyTitle}
                description={emptyDescription}
              />
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  // Bell + "Add job" grouped on the trailing edge of the header row.
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
    // No-op on Upcoming/Overdue/Pending, where the chip row is hidden.
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
  separator: {
    height: spacing.s3,
  },
});
