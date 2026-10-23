import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarCheck, CloudOff, RefreshCw } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { JobScope } from '../services';
import HomeHeader from '../components/HomeHeader';
import NotificationBell from '../components/NotificationBell';
import { EmptyState, InlineError, InlineNotice, Skeleton } from '../components/ui';
import { Tile } from '../components/Tile';
import { colors, spacing, typography } from '../theme';
import { greetingForNow } from '../utils';
import { firstName, loadMyProfile, useMyProfile } from '../features/profile';
import {
  QuickActions,
  TodayPulseCard,
  NoJobsCard,
  LeaveReviewBanner,
  TodaysJobsSection,
  hasAnyJobCount,
  useTodayPulse,
} from '../features/home';
import { useNotifications } from '../features/notifications';
import { VIEW_ONLY_REASON, isAdminRole, useCanWrite, useSessionRole } from '../features/auth';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  // Everything on this screen comes from `GET /users/me` — name, company,
  // technician count and job counts — shared with More via the same store, so
  // switching tabs doesn't refetch. Nothing is hardcoded, which is why a
  // failed load gets its own error branch rather than a placeholder.
  const { profile, isLoading, error, refresh, dismissError } = useMyProfile();
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Today's Pulse — its own request, made only while attendance is enabled.
  const pulse = useTodayPulse(profile?.attendance?.attendanceEnabled === true);
  // The Home bell's badge (Story 3.4) — refreshed on focus below, TTL-throttled
  // in the store, and driven live by the 3.3 socket's own refetch.
  const { unreadCount, loadUnreadCount } = useNotifications();

  // Setup gate for the quick actions (and the first-run branch below).
  // Optional-chained because `quickActions` is built before the loading and
  // error early returns — during those renders profile is still null.
  const hasTechnicians = (profile?.technicianCount ?? 0) > 0;
  // A viewer sees the dashboard but never the create/add tiles; the leave
  // review banner is admin-only (a viewer cannot read leave requests).
  const canWrite = useCanWrite();
  const isAdmin = isAdminRole(useSessionRole());

  // Every tab focus asks for fresh counts so the tiles are never a snapshot
  // from login. The store's 15s throttle makes rapid tab switching cheap:
  // at most one request per window, and a focus within the window is a no-op.
  // No background spinner — a refresh over existing tiles must not flicker.
  useFocusEffect(
    useCallback(() => {
      void loadMyProfile();
      void loadUnreadCount();
    }, [loadUnreadCount]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      // Same discipline as Jobs and the Notifications screen: a pull must
      // not leave the bell's badge a snapshot from login. Forced past the
      // 15s focus throttle — a stale badge next to a fresh dashboard would
      // contradict itself.
      await loadUnreadCount({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh, loadUnreadCount]);

  const handleNewJob = useCallback(() => {
    navigation.navigate('NewJob');
  }, [navigation]);

  const handlePressJob = useCallback(
    (jobId: string) => {
      navigation.navigate('JobDetail', { jobId });
    },
    [navigation],
  );

  const handleOpenNotifications = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  // 20-1 leave-review strip → CAP-4 banner: Review lands on the Attendance
  // TAB page with the Leave pane pre-selected — the page consumes the
  // one-shot `tab` param on arrival (the Jobs `scope` convention). MUST
  // live with the other callbacks — hooks can never run after this
  // screen's loading/error early returns.
  const handlePressLeaveBanner = useCallback(() => {
    navigation.navigate('Attendance', { tab: 'leave' });
  }, [navigation]);

  const quickActions = !canWrite ? (
    <InlineNotice tone="neutral" message={VIEW_ONLY_REASON} />
  ) : (
    <QuickActions
      onNewJob={handleNewJob}
      // A job must be assigned to someone — with no technicians yet the New
      // job tile disables and Add technician takes the primary slot.
      canCreateJob={hasTechnicians}
      // returnRouteName 'Home' → plain goBack after save; the list the user
      // returns to reads the shared useCustomers store, so no params needed.
      onAddCustomer={() =>
        navigation.navigate('AddCustomer', { returnRouteName: 'Home' })
      }
      // The param opens the Add sheet on arrival — the tile's promise is
      // "add a technician", not "look at the list".
      onAddTechnician={() => navigation.navigate('Technicians', { autoOpenAdd: true })}
      // Tenant-wide totals for the tiles' count lines — server-issued with
      // the profile, so they survive the 15s focus throttle like every other
      // tile on this screen.
      customerCount={profile?.customerCount ?? 0}
      technicianCount={profile?.technicianCount ?? 0}
    />
  );

  /** A stat tile press lands on the Jobs tab pre-set to that scope. The
   * screen consumes and clears the one-shot param (JobsScreen, AC #10). */
  const handleTilePress = useCallback(
    (scope: JobScope) => {
      navigation.navigate('Jobs', { scope });
    },
    [navigation],
  );

  /**
   * Shown when a *refresh* failed but we still have a profile to render — the
   * screen stays usable, the banner explains why it may be stale. A failure
   * with no profile at all takes the full-screen error branch below instead.
   */
  const errorBanner =
    error && profile ? (
      <InlineError message={error} onDismiss={dismissError} />
    ) : null;

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  // --- Loading: first load, before any profile copy exists ------------------
  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredRoot} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // --- Error: no profile means no name, no company — nothing to show --------
  if (!profile) {
    return (
      <SafeAreaView style={styles.centeredRoot} edges={['top']}>
        <EmptyState
          icon={<CloudOff size={36} color={colors.danger} strokeWidth={1.5} />}
          title="Couldn't load your account"
          description={error ?? 'Something went wrong. Please try again.'}
          ctaLabel="Try again"
          ctaIcon={<RefreshCw size={18} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={refresh}
        />
      </SafeAreaView>
    );
  }

  // `name` can be null (fresh owner account — company setup never collects a
  // name), so the greeting degrades to a nameless form instead of crashing.
  const ownerFirstName = firstName(profile.name);
  const businessName = profile.tenant.companyName;
  const { jobCounts, technicianCount } = profile;

  // 20-1 (AC 12) → CAP-4: the leave-review banner's count rides the same
  // attendance mirror the Attendance tile gates on — no second request.
  // Only an ENROLLED attendance tenant shows it, and count > 0 gates the
  // render (the 15-6 fail-HIDDEN idiom; an older backend answers 0 →
  // absent).
  const pendingLeaveRequests =
    isAdmin && profile.attendance?.attendanceEnabled === true
      ? (profile.attendance.pendingLeaveRequests ?? 0)
      : 0;

  // The Attendance entries (2026-09-30): shown only while the tenant's
  // attendance module is enabled. The flag rides the profile's `attendance`
  // mirror — no second request — and an absent mirror (older backend,
  // pre-onboarding) fails HIDDEN. 2026-10 (CAP-6) the two entries SPLIT
  // targets: the pulse card goes straight to the Today dashboard, and the
  // plain tile opens the Attendance TAB page — an incomplete setup surfaces
  // there as the setup banner; neither lands on the setup-only hub.
  // (Defined after the loading/error early returns, where `profile` is
  // narrowed non-null.)
  const plainAttendanceTile = (
      <Tile
        icon={
          <CalendarCheck
            size={20}
            color={colors.status.progress.solid}
            strokeWidth={1.5}
          />
        }
        iconBg={colors.status.progress.bg}
        title="Attendance"
        subtitle="Today, monthly & leave"
        onPress={() => navigation.navigate('Attendance')}
      />
    );

  // Enabled tenants get the Pulse card (shimmer while its own request is in
  // flight); if that request fails the plain tile keeps the entry point.
  const attendanceTile =
    profile.attendance?.attendanceEnabled !== true ? null : pulse.status === 'ready' ? (
      <TodayPulseCard pulse={pulse} onPress={() => navigation.navigate('AttendanceDashboard')} />
    ) : pulse.status === 'loading' ? (
      <View accessibilityLabel="Loading today's attendance">
        <Skeleton rows={1} height={150} />
      </View>
    ) : (
      plainAttendanceTile
    );

  // First-run: simplified Home until the account has a team and a job. Both
  // facts come from the server, so an account set up on another device shows
  // the right Home here too. `hasAnyJobCount` is the extracted pure helper
  // (any of the five buckets > 0) — the `hasTechnicians` conjunct is
  // load-bearing: no technician, no assignable jobs.
  const isSetupComplete = hasTechnicians && hasAnyJobCount(jobCounts);

  if (!isSetupComplete) {
    return (
      <SafeAreaView style={styles.newUserRoot} edges={['top']}>
        <View style={styles.greetingHeader}>
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <Text style={styles.greeting}>
                {ownerFirstName
                  ? `${greetingForNow()}, ${ownerFirstName}`
                  : greetingForNow()}
              </Text>
              <Text style={styles.business}>{businessName}</Text>
            </View>
            <NotificationBell
              unreadCount={unreadCount}
              onPress={handleOpenNotifications}
              variant="onPage"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.newUserContent}
          refreshControl={refreshControl}>
          {errorBanner}
          {quickActions}
          {attendanceTile}

          <View style={styles.jobsSection}>
            {/* First-run accounts take this branch instead of
                TodaysJobsSection, so the pending-leave banner must be
                reached here too — and it LEADS the section, above the
                title (owner ruling 2026-10-23): a request awaiting
                approval outranks the jobs list. */}
            {pendingLeaveRequests > 0 ? (
              <LeaveReviewBanner
                count={pendingLeaveRequests}
                onPress={handlePressLeaveBanner}
              />
            ) : null}
            <Text style={styles.sectionTitle}>Today's jobs</Text>
            <NoJobsCard hasTechnicians={hasTechnicians} canWrite={canWrite} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Established account: full dashboard.
  return (
    <>
      <HomeHeader
        ownerName={ownerFirstName ?? ''}
        businessName={businessName}
        jobCounts={jobCounts}
        onTilePress={handleTilePress}
        unreadCount={unreadCount}
        onBellPress={handleOpenNotifications}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}>
        {errorBanner}
        {quickActions}
        {attendanceTile}

        <TodaysJobsSection
          jobs={profile.jobs.data}
          overdueCount={jobCounts.overdue}
          technicianCount={technicianCount}
          technicians={profile.technicians ?? []}
          pendingLeaveRequests={pendingLeaveRequests}
          onPressLeaveBanner={handlePressLeaveBanner}
          onPressJob={handlePressJob}
          onPressStrip={() => handleTilePress('overdue')}
          onPressCreate={canWrite ? handleNewJob : undefined}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  // --- Loading / error views ---
  centeredRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- New-user view ---
  newUserRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  greetingHeader: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s4,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  greetingText: {
    flex: 1,
  },
  greeting: {
    ...typography.title,
    fontSize: 26,
    color: colors.textStrong,
  },
  business: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  newUserContent: {
    padding: spacing.s4,
    paddingTop: spacing.s1,
    gap: spacing.s5,
  },
  jobsSection: {
    gap: spacing.s3,
  },

  // --- Established dashboard ---
  screen: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textStrong,
    fontSize: 20,
  },
});
