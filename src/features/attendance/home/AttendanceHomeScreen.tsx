/**
 * AttendanceHomeScreen — the owner entry into attendance (Story 15-6,
 * gated by the 15-8 setup wizard).
 *
 * For 15-6 this was a minimal shim: two tiles (Offices + Settings). Finding 9
 * of the office-setup UX report split the hub into "Every day" (Today,
 * Monthly, Leave) and "Set up" (Offices, Team attendance, Weekly off,
 * Holidays) — the old Settings tile hid Team attendance two taps deep; the
 * `AttendanceSettings` route stays registered as a deep-link shim. 15-8
 * adds the ENTRY GATE: on every focus, an affirmative 200 from
 * `GET /attendance/setup` whose `setupCompletedAt` is still null
 * `replace`s this screen with the wizard (FR-3: the tile opens the wizard,
 * not an empty dashboard — `replace` so the back stack stays honest and
 * the two routes can never sit on the stack together, which is what makes
 * the loop guard trivial: the wizard never redirects into itself, it only
 * ever replaces BACK to this screen, whose gate then sees a completed
 * setup and renders the shim). Any gate failure — network error, or a
 * technician's 403 — means NO redirect: the shim renders exactly as
 * today, so a failure can never start a redirect loop and the full
 * nav-guard stays with the 15-6 D1 deferral story.
 *
 * The tiles below are the post-setup surface (Epic 16 replaces them with a
 * real dashboard without breaking 15-6's nav).
 */
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Building2, Calendar, CalendarDays, CalendarOff, LayoutDashboard, Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing } from '../../../theme';
import { VIEW_ONLY_REASON, useCanWrite } from '../../auth';
import { attendanceSetupService } from '../../../services';
import { Tile } from '../../../components/Tile';
import { Eyebrow, InlineNotice } from '../../../components/ui';
import { useFlashMessage } from '../../../hooks/useFlashMessage';
import ScreenHeader from '../offices/ScreenHeader';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceHome'>;

/** How long the "Attendance is on" confirmation stays — longer than a save flash, it is a milestone. */
const ENABLED_NOTICE_MS = 5000;

export default function AttendanceHomeScreen({ navigation, route }: Props) {
  // A viewer reads who is in (Today, Monthly) but sets nothing up and cannot
  // read leave — those tiles are hidden and the setup wizard never opens for
  // them (the notice at the top says why).
  const canWrite = useCanWrite();
  // One-time confirmation after the wizard's "Enable attendance". The param is
  // cleared straight away so coming back to this screen never repeats it.
  const enabledNotice = useFlashMessage(ENABLED_NOTICE_MS);
  const justEnabled = route?.params?.justEnabled === true;
  useEffect(() => {
    if (!justEnabled) return;
    enabledNotice.flash('Attendance is on. Employees you turned on can now check in.');
    navigation.setParams?.({ justEnabled: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justEnabled]);

  // Back that works from anywhere: when this screen is the only route on
  // the stack (a deep link — 15-8's wizard may land here), `goBack` would
  // strand the user — reset to the tabs (the HolidaysScreen pattern).
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // The setup gate — one light GET per focus, consistent with the
  // attendance screens' focus-refetch contract. Latest-wins: a slow stale
  // response must never redirect after a newer focus decided otherwise.
  const gateSeqRef = useRef(0);
  const runGate = useCallback(() => {
    if (!canWrite) return;
    const seq = ++gateSeqRef.current;
    void (async () => {
      try {
        const state = await attendanceSetupService.getSetup();
        if (seq !== gateSeqRef.current) return;
        // Only redirect while THIS screen is still focused: a late answer
        // landing after the owner pushed a tile would REPLACE THE FOCUSED
        // ROUTE (a screen-dispatched replace without target acts on the
        // current index), stacking the wizard on top of the pushed screen —
        // and device-back would pop to AttendanceHome whose gate replaces
        // again. The focused check breaks that loop at the source.
        if (state.setupCompletedAt === null && navigation.isFocused()) {
          // A never-started setup counts as not completed: the owner lands
          // in the wizard, whose mount POSTs the start (matrix row 1). Only
          // a COMPLETED setup keeps the shim.
          navigation.replace('AttendanceSetupWizard');
        }
      } catch {
        // Gate GET failed or was forbidden — never surface, never
        // redirect; the wizard is owner-only by affirmative 200.
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
      <ScreenHeader title="Attendance" onBack={goBackSafely} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {enabledNotice.message ? (
          <InlineNotice
            tone="success"
            message={enabledNotice.message}
            onDismiss={enabledNotice.dismiss}
          />
        ) : null}
        {!canWrite ? <InlineNotice tone="neutral" message={VIEW_ONLY_REASON} /> : null}
        <Eyebrow>Every day</Eyebrow>
        {/* 19-4 D1 — the FR-24 dashboard tile, FIRST (the today snapshot is
            the owner's entry answer, ahead of the setup surfaces below). */}
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
          <>
            {/* 17-6 — the Leave tile (Leave is "planned time";
                the subtitle is FE copy, not mockup text). */}
            <Tile
              icon={<CalendarOff size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
              iconBg={colors.status.progress.bg}
              title="Leave"
              subtitle="Pending requests & history"
              onPress={() => navigation.navigate('OwnerLeave')}
            />
          </>
        ) : null}
        {canWrite ? (
          <>
            <Eyebrow style={styles.sectionGap}>Set up</Eyebrow>
            <Tile
              icon={<Building2 size={20} color={colors.status.scheduled.solid} strokeWidth={1.5} />}
              iconBg={colors.status.scheduled.bg}
              title="Offices"
              subtitle="Add offices, set location and timings"
              onPress={() => navigation.navigate('AttendanceOffices')}
            />
            <Tile
              icon={<Users size={20} color={colors.primary} strokeWidth={1.5} />}
              iconBg={colors.surfacePage}
              title="Team attendance"
              subtitle="Choose each person's office and start date"
              onPress={() => navigation.navigate('AttendanceEnrolments')}
            />
            <Tile
              icon={<CalendarDays size={20} color={colors.status.scheduled.solid} strokeWidth={1.5} />}
              iconBg={colors.status.scheduled.bg}
              title="Weekly off"
              subtitle="Same for everyone, or set per employee"
              onPress={() => navigation.navigate('AttendanceWeeklyOff')}
            />
            <Tile
              icon={<Calendar size={20} color={colors.status.progress.solid} strokeWidth={1.5} />}
              iconBg={colors.status.progress.bg}
              title="Holidays"
              subtitle="Company holiday list"
              onPress={() => navigation.navigate('AttendanceHolidays')}
            />
          </>
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
  content: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  sectionGap: {
    marginTop: spacing.s3,
  },
});
