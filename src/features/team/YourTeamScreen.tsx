/**
 * YourTeamScreen — the manager's one team surface (Epic 24, story 24-5 /
 * CAP-5). One pushed screen with three segments:
 *
 *   Leave  — the subtree's pending leave, decided inline or from the detail
 *            sheet (balances + who else is off).
 *   Jobs   — pending employee-created jobs strictly below the caller.
 *   People — the actionable subtree directory, plus "Apply for leave" for an
 *            employee manager (a viewer manager lacks the right and sees no
 *            action at all).
 *
 * The gate is the server's `team.headcount > 0`. An admin's block is empty,
 * so owners keep their console; a person with no reports never sees this
 * route's entry points, and a demoted manager is bounced out on the next
 * profile read.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, InlineError, SegmentedControl } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import ScreenHeader from '../attendance/offices/ScreenHeader';
import { useMyProfile } from '../profile';
import { isEmployeeRole } from '../auth/roles';
import type {
  RootStackParamList,
  TechnicianRootStackParamList,
} from '../../navigation/types';
import type { TeamMember } from '../../services';
import { hasTeam, teamHeaderLine } from './teamModel';
import { TeamLeavePane } from './components/TeamLeavePane';
import { TeamJobsPane } from './components/TeamJobsPane';
import { TeamPeoplePane } from './components/TeamPeoplePane';

type Segment = 'leave' | 'jobs' | 'people';

type Props = NativeStackScreenProps<
  RootStackParamList & TechnicianRootStackParamList,
  'YourTeam'
>;

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'leave', label: 'Leave' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'people', label: 'People' },
];

export default function YourTeamScreen({ navigation, route }: Props) {
  const { profile, error, isLoading } = useMyProfile();
  const [segment, setSegment] = useState<Segment>('leave');
  // The actionable counts the segment labels announce (never painted) —
  // EXPERIENCE Surface 1. Null until a queue has loaded its first page.
  const [counts, setCounts] = useState<{ leave: number | null; jobs: number | null }>({
    leave: null,
    jobs: null,
  });
  const setLeaveCount = useCallback((count: number | null) => {
    setCounts(prev => (prev.leave === count ? prev : { ...prev, leave: count }));
  }, []);
  const setJobsCount = useCallback((count: number | null) => {
    setCounts(prev => (prev.jobs === count ? prev : { ...prev, jobs: count }));
  }, []);

  // The landing segment rides a merged param (notification taps). Read it
  // once, then clear it so a stale value cannot re-fire on a later focus.
  const requested = route.params?.segment;
  useEffect(() => {
    if (requested == null) return;
    setSegment(requested);
    navigation.setParams({ segment: undefined });
  }, [requested, navigation]);

  // A demoted manager (or a notification that arrived after the tree moved)
  // must not sit on a stale team surface: no reports means no team UI.
  useEffect(() => {
    if (profile != null && !hasTeam(profile)) navigation.goBack();
  }, [profile, navigation]);

  if (profile == null) {
    // A failed `/users/me` is not "still loading": without this branch the
    // screen sits on a spinner forever with no way back.
    if (error != null && !isLoading) {
      return (
        <SafeAreaView style={styles.root} edges={['top']}>
          <ScreenHeader title="Your team" onBack={() => navigation.goBack()} />
          <View style={styles.pad}>
            <InlineError message={error} />
            <Button variant="secondary" size="md" fullWidth onPress={() => navigation.goBack()}>
              Back
            </Button>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!hasTeam(profile)) return null;

  const employee = isEmployeeRole(profile.role);
  const team = profile.team;

  // The announced count rides the accessibility label only (the segment is
  // a section name, not a counter).
  const segments = SEGMENTS.map(option => {
    const count =
      option.value === 'leave' ? counts.leave : option.value === 'jobs' ? counts.jobs : null;
    return count == null
      ? option
      : { ...option, accessibilityLabel: `${option.label}, ${count}` };
  });

  const applyFor = (member: TeamMember | null) => {
    if (member == null) {
      navigation.navigate('ApplyOnBehalf');
      return;
    }
    navigation.navigate('ApplyOnBehalf', {
      employeeId: member.userId,
      employeeName: member.name?.trim() || 'Team member',
      officeName: null,
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Your team" onBack={() => navigation.goBack()} />
      <View style={styles.header}>
        <Text style={styles.subtitle} numberOfLines={1}>
          {teamHeaderLine(team)}
        </Text>
        <SegmentedControl options={segments} value={segment} onChange={setSegment} />
      </View>

      <View style={styles.body}>
        {segment === 'leave' ? (
          <TeamLeavePane myId={profile.id} enabled onCountChange={setLeaveCount} />
        ) : segment === 'jobs' ? (
          <TeamJobsPane
            team={team}
            enabled
            onCountChange={setJobsCount}
            onOpenJob={jobId =>
              employee
                ? navigation.navigate('TechJobDetail', { jobId })
                : navigation.navigate('JobDetail', { jobId })
            }
          />
        ) : (
          <TeamPeoplePane team={team} canApply={employee} onApplyFor={applyFor} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s3,
  },
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s2,
    gap: spacing.s2,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  body: {
    flex: 1,
  },
});
