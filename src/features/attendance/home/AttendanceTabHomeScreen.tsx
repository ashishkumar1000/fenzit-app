/**
 * AttendanceTabHomeScreen — the owner's Attendance tab page (2026-10:
 * Attendance took the Customers footer slot). The hub's old "Every day"
 * tiles moved here — Today, Monthly, Leave — above them, when the owner's
 * attendance setup is still incomplete, the CAP-3 setup banner: a prominent
 * tappable tile into the wizard. The page NEVER auto-redirects (the redirect
 * stays the hub's focus gate, reached from the Account row): every focus
 * runs the same one-light GET per focus as the hub, latest-wins, and its
 * answer only decides the banner — a failed or forbidden GET (network, a
 * viewer's 403) is silent, leaving the page exactly as it renders without
 * the banner.
 *
 * A viewer reads who is in (Today, Monthly) but cannot read leave or set
 * anything up — the Leave tile and the banner stay hidden, and the gate GET
 * is skipped for them exactly as on the hub. Tab roots have no back header;
 * the title-only header is the technician Attendance tab's pattern. (The
 * basename collision rule: the technician tab screen owns
 * `AttendanceTabScreen.tsx` in features/attendance/me/.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  LayoutDashboard,
} from 'lucide-react-native';
import { colors, fontSize, spacing } from '../../../theme';
import { useCanWrite } from '../../auth';
import { attendanceSetupService } from '../../../services';
import { Tile } from '../../../components/Tile';
import { Eyebrow } from '../../../components/ui';
import type { MainTabParamList } from '../../../navigation/types';
import type { RootStackParamList } from '../../../navigation/types';

type TabsProps = BottomTabScreenProps<MainTabParamList, 'Attendance'>;
type Props = CompositeScreenProps<
  TabsProps,
  NativeStackScreenProps<RootStackParamList>
>;

export default function AttendanceTabHomeScreen({ navigation }: Props) {
  const canWrite = useCanWrite();
  // The banner's only truth: a successful focus GET whose `setupCompletedAt`
  // is still null. Off until the GET answers — and a failed or forbidden GET
  // never turns it on (the hub-gate posture: silent, never a redirect).
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  // The setup banner's GET — the hub's focus gate minus the redirect: one
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
        // landing after the owner pushed a tile must not flip the banner
        // on an unfocused screen — refocus re-runs the GET anyway.
        if (navigation.isFocused()) {
          // A never-started setup counts as not completed (the hub gate's
          // reading) — the banner is the tab page's whole invitation in.
          setSetupIncomplete(state.setupCompletedAt === null);
        }
      } catch {
        // Gate GET failed or was forbidden — never surface, never
        // redirect; the banner is owner-only by affirmative 200.
      }
    })();
  }, [navigation, canWrite]);

  // Subscribed imperatively rather than via `useFocusEffect` so the screen
  // keeps rendering outside a navigator (the optional calls are real
  // no-ops there; the navigator always provides both methods).
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', runGate);
    return () => unsubscribe?.();
  }, [navigation, runGate]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Attendance
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {canWrite && setupIncomplete ? (
          /* CAP-3 — the banner, not a redirect: the wizard stays one tap
             away, and the next focus GET that sees a completed setup
             removes the banner. */
          <Tile
            icon={<CalendarCheck size={20} color={colors.primary} strokeWidth={1.5} />}
            iconBg={colors.surfacePage}
            title="Finish setting up attendance"
            subtitle="Offices, team & weekly off first"
            onPress={() => navigation.navigate('AttendanceSetupWizard')}
          />
        ) : null}
        <Eyebrow>Every day</Eyebrow>
        {/* 19-4 D1 — the FR-24 dashboard tile, FIRST (the today snapshot is
            the owner's entry answer). */}
        <Tile
          icon={<LayoutDashboard size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
          iconBg={colors.status.progress.bg}
          title="Today"
          subtitle="Who's in and who's not"
          onPress={() => navigation.navigate('AttendanceDashboard')}
        />
        {/* 19-5 D1 — the FR-25 monthly review tile, between Today and
            Leave (the production AttendanceHome family reads blue =
            "review people" — the Sally Q1 ruling). */}
        <Tile
          icon={<CalendarDays size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
          iconBg={colors.status.progress.bg}
          title="Monthly"
          subtitle="Everyone's month at a glance"
          onPress={() => navigation.navigate('AttendanceMonthly')}
        />
        {canWrite ? (
          /* 17-6 — the Leave tile (Leave is "planned time";
              the subtitle is FE copy, not mockup text). */
          <Tile
            icon={<CalendarOff size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
            iconBg={colors.status.progress.bg}
            title="Leave"
            subtitle="Pending requests & history"
            onPress={() => navigation.navigate('OwnerLeave')}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textStrong,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
});
