/**
 * SetupPending — the Attendance tab page's setup invitation (CAP-3, 2026-10
 * redesign): when the owner's attendance setup is still incomplete, the page
 * becomes THIS screen instead of a lone tile above the tabs. An inline-SVG
 * scene (the NoJobsCard art idiom — one vocabulary with the app), the title,
 * a progress card (steps done over the wizard's four steps, with the
 * percent display-floored at 10% so an unstarted setup still reads as
 * "underway"), and one primary Continue. There is no Skip: setup cannot
 * be skipped (owner ruling 2026-10-23) — the page stands until a focus
 * GET sees a completed setup, which is what returns the tabbed page.
 *
 * Progress: steps BEFORE the wizard's resumed step are done — the wizard's
 * own walking order (SETUP_STEPS) is the single source of the count, so the
 * card and the wizard can never disagree.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Settings, Trophy } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import {
  SETUP_STEPS,
  resumeStep,
  stepIndex,
  type SetupStep,
} from '../setup/wizardModel';

/** The setup percent never READS below 10% (owner ruling 2026-10-23): an
 *  unstarted setup shows "10%" — underway, not empty. Done/total is the
 *  real arithmetic; the floor is display-only. */
export const SETUP_PCT_FLOOR = 10;

export function setupProgress(currentStep: SetupStep | null): {
  done: number;
  total: number;
  remaining: number;
  pct: number;
} {
  const total = SETUP_STEPS.length;
  const done = stepIndex(resumeStep(currentStep));
  return {
    done,
    total,
    remaining: total - done,
    pct: Math.max(Math.round((done / total) * 100), SETUP_PCT_FLOOR),
  };
}

/** The invitation art — clipboard with a check, the clock, the plant. Same
 *  line-art idiom as Home's NoJobsCard backdrop: theme blues, one success
 *  accent, decorative only (never carrying meaning). */
function SetupArt() {
  return (
    <Svg width={232} height={148} viewBox="0 0 232 148">
      {/* ground */}
      <Rect x={28} y={132} width={176} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* clock */}
      <Circle cx={182} cy={46} r={24} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.32} strokeWidth={2} />
      <Circle cx={182} cy={46} r={2.6} fill={colors.primary} fillOpacity={0.6} />
      <Path d="M182 46 L182 32" stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M182 46 L193 51" stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2.6} strokeLinecap="round" />
      {/* clipboard: board, clip, check, two list rows */}
      <G x={56} y={12}>
        <Rect width={82} height={112} rx={14} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Rect x={28} y={-7} width={26} height={14} rx={6} fill={colors.primary} fillOpacity={0.5} />
        <Path
          d="M20 36 L34 50 L60 22"
          stroke={colors.primary}
          strokeOpacity={0.85}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {[66, 82].map((y, i) => (
          <G key={y}>
            <Circle cx={20} cy={y} r={4} fill={colors.primary} fillOpacity={0.25} />
            <Rect x={30} y={y - 3} width={i === 0 ? 32 : 26} height={5} rx={2.5} fill={colors.primary} fillOpacity={0.16} />
          </G>
        ))}
      </G>
      {/* plant: pot + two leaves (the one success accent) */}
      <Path d="M160 112 L166 132 L184 132 L190 112 Z" fill={colors.success} fillOpacity={0.18} />
      <Path d="M175 112 C173 100 164 94 156 94 C162 86 174 90 176 102 Z" fill={colors.success} fillOpacity={0.45} />
      <Path d="M176 112 C178 98 188 92 196 94 C192 86 178 88 175 102 Z" fill={colors.success} fillOpacity={0.65} />
      {/* sparkles */}
      <Circle cx={40} cy={40} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={214} cy={92} r={2} fill={colors.primary} fillOpacity={0.2} />
      <Circle cx={30} cy={100} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}

/** The card's accomplishment backdrop — a slow confetti fall drawn as SVG
 *  shapes (dots, strips, four-point sparkles) in the app's own accent
 *  colours, like the rest of this file's art. No binary assets, no GIF
 *  decoder. Decorative only: pointerEvents none, low opacity, clipped by
 *  the card; the fall/rotate runs on the native driver. */
const CONFETTI = Array.from({ length: 9 }, (_, i) => ({
  left: `${5 + ((i * 11) % 88)}%`,
  size: 9 + (i % 3) * 3,
  color: [colors.primary, colors.warning, colors.success][i % 3],
  duration: 3600 + (i % 4) * 700,
  delay: (i % 5) * 600,
  shape: (['dot', 'strip', 'star'] as const)[i % 3],
}));

function ConfettiPiece({ c, v }: { c: (typeof CONFETTI)[number]; v: Animated.Value }) {
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: c.left,
        opacity: v.interpolate({
          inputRange: [0, 0.15, 0.85, 1],
          outputRange: [0, 0.55, 0.45, 0],
        }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 210] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '300deg'] }) },
        ],
      }}>
      <Svg width={c.size} height={c.size} viewBox="0 0 12 12">
        {c.shape === 'dot' ? (
          <Circle cx={6} cy={6} r={4.5} fill={c.color} fillOpacity={0.75} />
        ) : c.shape === 'strip' ? (
          <Rect x={4} y={0.5} width={4} height={11} rx={2} fill={c.color} fillOpacity={0.7} />
        ) : (
          <Path
            d="M6 0 L7.5 4.5 L12 6 L7.5 7.5 L6 12 L4.5 7.5 L0 6 L4.5 4.5 Z"
            fill={c.color}
            fillOpacity={0.8}
          />
        )}
      </Svg>
    </Animated.View>
  );
}

function ConfettiBackdrop() {
  const values = useRef(CONFETTI.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    // One looping 0→1 fall per particle — the fade keyframes make both
    // ends invisible, so the loop's snap back to 0 is never seen. (A
    // sequence with a 0-duration reset leg completes the native loop
    // instantly and the confetti never shows — found on device.)
    const anims = values.map((v, i) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: CONFETTI[i].duration,
          delay: CONFETTI[i].delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [values]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CONFETTI.map((c, i) => (
        <ConfettiPiece key={i} c={c} v={values[i]} />
      ))}
    </View>
  );
}

type Props = {
  currentStep: SetupStep | null;
  onContinue: () => void;
};

export function SetupPending({ currentStep, onContinue }: Props) {
  const { done, total, remaining, pct } = setupProgress(currentStep);
  const subtitle =
    done === 0
      ? 'Set up attendance to start tracking your team\u2019s day.'
      : done * 2 === total
        ? "You're halfway there! Complete the remaining steps to start tracking your team."
        : `Complete the remaining ${remaining} step${remaining === 1 ? '' : 's'} to start tracking your team.`;
  return (
    <View style={styles.root}>
      {/* Everything but the action centers on the page (owner ruling
          2026-10-23); the Continue Setup button alone sits at the bottom. */}
      <View style={styles.centerBlock}>
        <SetupArt />
        <Text style={styles.title}>Finish setting up attendance</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.progressCard}>
          <ConfettiBackdrop />
        <View style={styles.progressTop}>
          <View style={styles.pill}>
            <Settings size={12} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.pillText}>
              {done === 0 ? "LET'S GET STARTED!" : 'GREAT PROGRESS!'}
            </Text>
          </View>
          <View style={styles.pctChip}>
            <Trophy size={11} color={colors.warning} strokeWidth={2.5} fill={colors.warning} />
            <Text style={styles.pctText}>{`${pct}%`}</Text>
          </View>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.stepsDone}>{`${done} of ${total} steps done`}</Text>
          <Text style={styles.remaining}>{`${remaining} remaining`}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
      </View>

      </View>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onPress={onContinue}
        style={styles.continueBtn}>
        Continue Setup
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Everything but the action: centered in the remaining height.
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s5,
    gap: spacing.s3,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
    color: colors.textStrong,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  progressCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceCard,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    gap: spacing.s3,
    marginTop: spacing.s2,
    // Clips the confetti to the card's rounded corners.
    overflow: 'hidden',
  },
  // Pinned to the bottom of the page regardless of the content height
  // (owner ruling 2026-10-23).
  continueBtn: {
    // The pinned action sits above the tab bar with a little breathing
    // room, inside the page's own horizontal inset.
    marginTop: spacing.s4,
    marginBottom: spacing.s3,
    paddingHorizontal: spacing.s5,
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
  },
  pillText: {
    ...typography.labelStrong,
    fontSize: 11,
    color: colors.primary,
  },
  pctChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfacePage,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
  },
  pctText: {
    ...typography.labelStrong,
    fontSize: 12,
    color: colors.textStrong,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepsDone: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  remaining: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfacePage,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
