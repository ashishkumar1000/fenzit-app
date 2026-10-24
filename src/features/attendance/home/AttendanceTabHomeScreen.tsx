/**
 * AttendanceTabHomeScreen — the owner's Attendance tab page (2026-10:
 * Attendance took the Customers footer slot). CAP-1: the three daily reads
 * — Today, Monthly, Leave — are one SegmentedControl switch away, Today
 * active on entry: the leaf screens render IN PLACE as `embedded` panes
 * (their pushed-screen back headers and top SafeArea belong to the push
 * host, not a tab page) and the switch is a conditional render — the pane
 * mounts fresh on entry (its first focus is its initial load), no
 * navigation push. Home's leave banner (CAP-4) lands here with
 * `{ tab: 'leave' }`; the Leave segment carries the pending-requests
 * badge, riding the shared /users/me mirror (`pendingLeaveRequests`,
 * fail-hidden at 0/absent — no second request) and refreshed by the
 * throttled focus load.
 *
 * Above the tabs, when the owner's attendance setup is still incomplete,
 * the CAP-3 setup banner: a prominent tappable tile into the wizard. The
 * page NEVER auto-redirects (the redirect stays the hub's focus gate,
 * reached from the Account row): every focus runs the same one-light GET
 * per focus as the hub, latest-wins, and its answer only decides the
 * banner — a failed or forbidden GET (network, a viewer's 403) is silent,
 * leaving the page exactly as it renders without the banner.
 *
 * A viewer reads who is in (Today, Monthly) but cannot read leave or set
 * anything up — the Leave segment (and with it the badge) and the banner
 * stay hidden, and the gate GET is skipped for them exactly as on the hub.
 * Tab roots have no back header; the title-only header is the technician
 * Attendance tab's pattern. (The basename collision rule: the technician
 * tab screen owns `AttendanceTabScreen.tsx` in features/attendance/me/.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarDays,
  CalendarOff,
  CalendarRange,
} from 'lucide-react-native';
import { colors, fontSize, spacing } from '../../../theme';
import { useCanWrite } from '../../auth';
import { attendanceSetupService } from '../../../services';
import type { SetupState } from '../../../services';
import { loadMyProfile, useMyProfile } from '../../profile';
import { SegmentedControl } from '../../../components/ui';
import type { SegmentOption } from '../../../components/ui';
import type { MainTabParamList } from '../../../navigation/types';
import type { RootStackParamList } from '../../../navigation/types';
import AttendanceDashboardScreen from '../dashboard/AttendanceDashboardScreen';
import AttendanceMonthlyScreen from '../monthly/AttendanceMonthlyScreen';
import OwnerLeaveScreen from '../leave/OwnerLeaveScreen';
import ScreenHeader from '../offices/ScreenHeader';
import { SetupPending } from './SetupPending';


type TabsProps = BottomTabScreenProps<MainTabParamList, 'Attendance'>;
type Props = CompositeScreenProps<
  TabsProps,
  NativeStackScreenProps<RootStackParamList>
>;

type AttendanceTabKey = 'today' | 'monthly' | 'leave';

/** A pane's stack navigation as the leaf's props see it — only the phantom
 *  screen-name brand differs from this page's composite navigation, which
 *  is what the casts at the pane sites name for tsc. */
type PaneNavigation<S extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, S>['navigation'];

// The segments' glyphs (the mockup's calendar family) — the attendance
// tiles' progress blue, one vocabulary.
const SEGMENT_ICONS: Record<AttendanceTabKey, ReactNode> = {
  today: <CalendarDays size={16} color={colors.status.progress.solid} strokeWidth={1.5} />,
  monthly: <CalendarRange size={16} color={colors.status.progress.solid} strokeWidth={1.5} />,
  leave: <CalendarOff size={16} color={colors.status.progress.solid} strokeWidth={1.5} />,
};

export default function AttendanceTabHomeScreen({ navigation, route }: Props) {
  const canWrite = useCanWrite();
  // The badge's count rides the shared /users/me mirror (Home and More read
  // the same store — no second request); the throttled focus load below is
  // what lets a decided request clear the badge on the next focus.
  const { profile } = useMyProfile();
  // The setup screen's only truth: a successful focus GET. Off (null) until
  // the GET answers — and a failed or forbidden GET never shows anything
  // (the hub-gate posture: silent, never a redirect).
  const [setupState, setSetupState] = useState<SetupState | null>(null);

  // The setup GET — the hub's focus gate minus the redirect: one
  // light GET per focus, consistent with the attendance screens' focus
  // refetch contract. Latest-wins: a slow stale response must never flip
  // the banner after a newer focus decided otherwise.
  const gateSeqRef = useRef(0);
  const runGate = useCallback(() => {
    if (!canWrite) return;
    const seq = ++gateSeqRef.current;
    void (async () => {
      try {
        const state = await attendanceSetupService.getSetup();
        if (seq !== gateSeqRef.current) return;
        // Only decide while THIS screen is still focused: a late answer
        // landing after the owner switched away must not flip the banner
        // on an unfocused screen — refocus re-runs the GET anyway.
        if (navigation.isFocused()) {
          setSetupState(state);
        }
      } catch {
        // Gate GET failed or was forbidden — never surface, never
        // redirect; the setup screen is owner-only by affirmative 200.
      }
    })();
  }, [navigation, canWrite]);

  // Subscribed imperatively rather than via `useFocusEffect` so the screen
  // keeps rendering outside a navigator (the optional calls are real
  // no-ops there; the navigator always provides both methods).
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      runGate();
      void loadMyProfile();
    });
    return () => unsubscribe?.();
  }, [navigation, runGate]);

  // The active pane. A valid `{ tab }` param on arrival (Home's Review
  // landing) seeds it — no Today flash before the switch.
  const [activeTab, setActiveTab] = useState<AttendanceTabKey>(() => {
    const tab = route.params?.tab;
    return tab === 'monthly' || tab === 'leave' ? tab : 'today';
  });

  // Tab params persist across navigations: consume and clear (the Jobs
  // `scope` convention) or the stale param would re-select the pane on
  // every later focus and fight manual segment taps — and the next Review
  // could never re-fire. Invalid/absent params are ignored.
  const paramTab = route.params?.tab;
  useEffect(() => {
    if (paramTab !== 'today' && paramTab !== 'monthly' && paramTab !== 'leave') {
      return;
    }
    setActiveTab(paramTab);
    // Optional call — this screen keeps rendering outside a navigator (the
    // addListener idiom above); there it is a real no-op.
    navigation.setParams?.({ tab: undefined });
  }, [paramTab, navigation]);

  // The badge gate mirrors Home's banner shape: admin + enabled tenant +
  // fail-hidden count (an older backend answers absent → no badge).
  const pendingLeave =
    canWrite && profile?.attendance?.attendanceEnabled === true
      ? (profile.attendance.pendingLeaveRequests ?? 0)
      : 0;

  // A live role change (sessionSync rewrites the session on foreground)
  // must not strand a blank pane: the demoted viewer renders the viewer
  // tab set with Today selected — a Leave choice dies with the write role,
  // exactly like the Leave segment itself.
  const visibleTab: AttendanceTabKey =
    canWrite || activeTab !== 'leave' ? activeTab : 'today';

  // Back that works from anywhere (the AttendanceHome goBackSafely idiom).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // CAP-3, 2026-10 redesign: a pending setup renders the invitation screen
  // instead of the tabs — and it cannot be skipped (owner ruling
  // 2026-10-23): only a focus GET that sees a completed setup returns the
  // tabbed page. A viewer and a failed GET render the tabbed page.
  const setupIncomplete =
    setupState !== null && setupState.setupCompletedAt === null;
  const showSetupPending = canWrite && setupIncomplete;

  if (showSetupPending) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Attendance" onBack={goBackSafely} />
        <SetupPending
          currentStep={setupState.currentStep}
          onContinue={() => navigation.navigate('AttendanceSetupWizard')}
        />
      </SafeAreaView>
    );
  }

  const segments: Array<SegmentOption<AttendanceTabKey>> = [
    { value: 'today', label: 'Today', icon: SEGMENT_ICONS.today },
    { value: 'monthly', label: 'Monthly', icon: SEGMENT_ICONS.monthly },
    // Leave exists only for a writer — a viewer cannot read leave requests.
    ...(canWrite
      ? [
          {
            value: 'leave' as const,
            label: 'Leave',
            icon: SEGMENT_ICONS.leave,
            badge: pendingLeave > 0 ? pendingLeave : undefined,
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Attendance" onBack={goBackSafely} />

      <View style={styles.controls}>
        <SegmentedControl
          options={segments}
          value={visibleTab}
          onChange={setActiveTab}
        />
      </View>

      {/* Conditional render IS the pane switch (CAP-1): one pane mounted at
          a time — it mounts fresh on entry (the embedded leaf's first focus
          is its initial load) and unmounts on leaving, never a push. Each
          pane gets this page's composite navigation: it already carries
          every stack method the leaf uses, the cast only names the
          screen-name brand tsc can't see through (leaf screens stay
          cast-free). */}
      {visibleTab === 'today' ? (
        <AttendanceDashboardScreen
          navigation={navigation as unknown as PaneNavigation<'AttendanceDashboard'>}
          embedded
        />
      ) : null}
      {visibleTab === 'monthly' ? (
        <AttendanceMonthlyScreen
          navigation={navigation as unknown as PaneNavigation<'AttendanceMonthly'>}
          embedded
        />
      ) : null}
      {visibleTab === 'leave' ? (
        <OwnerLeaveScreen
          navigation={navigation as unknown as PaneNavigation<'OwnerLeave'>}
          embedded
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  // The banner + segmented control sit above the panes; the panes (flex: 1
  // SafeAreaViews) own their own scrolling and inner padding.
  controls: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s3,
  },
});
