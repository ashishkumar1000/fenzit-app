/**
 * MyJobsSummaryCard — the Profile tab's entry point to the "My jobs"
 * record (2026-11-13, user request): same card the tab always had —
 * identity of patterns, title, chevron — but tapping it now OPENS
 * `MyJobsScreen` instead of expanding in place, so the Profile page stays
 * uncluttered and the details get a real screen. The card itself carries
 * no numbers (those live on the screen, from `MyJobsDetails`), so nothing
 * on this page can go stale.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TechnicianRootStackParamList } from '../../../navigation/types';
import { ChevronRight } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, shadow, spacing, typography } from '../../../theme';

/**
 * CardPattern — the card's background watermarks (unchanged from the
 * expandable card): a dot grid with two accent rings anchored to the
 * top-right corner, and a fan of quarter-arcs at the card's start
 * (top-left) — two different forms, one tone-on-tone family.
 */
function CardPattern() {
  const dots: ReactNode[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      dots.push(
        <Circle
          key={`d-${row}-${col}`}
          cx={16 + col * 18}
          cy={16 + row * 18}
          r={col === 6 ? 2.4 : 3}
          fill={colors.primary}
          opacity={col === 6 || row === 0 ? 0.1 : 0.06}
        />,
      );
    }
  }
  return (
    <>
      {/* Start (top-left): a fan of concentric quarter-arcs. */}
      <Svg
        width={92}
        height={92}
        viewBox="0 0 92 92"
        style={styles.patternStart}
        pointerEvents="none">
        <Circle cx={-14} cy={-14} r={26} fill="none" stroke={colors.primary} strokeWidth={2} opacity={0.14} />
        <Circle cx={-14} cy={-14} r={44} fill="none" stroke={colors.primary} strokeWidth={2} opacity={0.09} />
        <Circle cx={-14} cy={-14} r={62} fill="none" stroke={colors.primary} strokeWidth={2} opacity={0.05} />
      </Svg>
      {/* End (top-right): the dot grid with accent rings. */}
      <Svg
        width={134}
        height={98}
        viewBox="0 0 134 98"
        style={styles.pattern}
        pointerEvents="none">
        <Circle cx={122} cy={10} r={7} fill="none" stroke={colors.primary} strokeWidth={2} opacity={0.12} />
        <Circle cx={96} cy={88} r={11} fill="none" stroke={colors.primary} strokeWidth={2} opacity={0.08} />
        {dots}
      </Svg>
    </>
  );
}

export default function MyJobsSummaryCard() {
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>();
  const open = useCallback(
    () => navigation.navigate('TechMyJobs'),
    [navigation],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="My jobs"
      accessibilityHint="Opens your jobs record for the last 7 or 30 days"
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <CardPattern />
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.title}>My jobs</Text>
          <Text style={styles.subtitle}>Created, approved, pending &amp; rejected</Text>
        </View>
        {/* The chevron is earned: it opens TechMyJobs. */}
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    padding: spacing.s4,
    ...shadow.sm,
    overflow: 'hidden', // the watermark's dots clip at the card's rounded edge
  },
  cardPressed: {
    opacity: 0.85,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  patternStart: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  headText: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
});
