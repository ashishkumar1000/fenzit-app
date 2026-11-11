/**
 * PunchButton — the Today-tab punch control (the approved mockup, drawn
 * verbatim): a circular gradient face inside a dashed ring, a status pill
 * overlapping the top edge, the fingerprint well, the big action label and
 * a sub-label. The gradient is SVG (RadialGradient) — the DS's flat-color
 * rule governs View backgrounds; the mockup's circle is drawn, not filled.
 *
 * 2026-11-10 simplification (owner decision): ONE face colour. Every
 * posture — ready, blocked, rate-limited, permission — renders the same
 * brand face; state is carried by the pill, the sub-label, the message
 * below and the status card, never by repainting the circle. The punch is
 * tappable whenever its action is meaningful (the server gates every
 * press; too_far no longer feeds the rate limit). When a punch is invited
 * (READY / ON SHIFT) the dashed ring rotates slowly.
 */
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Fingerprint } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontSize, typography } from '../../../theme';
import type { TodayButtonState } from './attendanceTodayModel';
import {
  formatCountdown,
  formatCountdownWords,
} from './attendanceTodayModel';

/** Face and ring sizes — one deliberate step above every other control on
 *  the tab (the old 56 CTA's unmissability rule, scaled to the mockup). */
const RING_SIZE = 216;
const FACE_SIZE = 184;
const FP_WELL_SIZE = 60;

/** The one circle inks — same for every posture. */
const FACE = colors.punch.face;
const RING = colors.punch.ring;

interface Scheme {
  pill: { bg: string; label: string } | null;
  sub: string | null;
}

/** Pill + sub-label per posture. The blocked postures share the same face;
 *  the pill drops rather than inventing copy for them. The location
 *  sub-labels are deliberately SHORT and shared (owner feedback
 *  2026-11-10) — the WHY lives on the status card and in the popup, and
 *  the action under the fingerprint carries in/out. */
function schemeFor(state: TodayButtonState): Scheme {
  switch (state.kind) {
    case 'readyIn':
      return {
        pill: { bg: colors.punch.pillReady, label: 'READY' },
        sub: 'Tap to check in',
      };
    case 'readyOut':
      return {
        pill: { bg: colors.punch.pillShiftActive, label: 'ON SHIFT' },
        sub: 'Tap to check out',
      };
    case 'rateLimited':
      return {
        pill: null,
        sub: `Try again in ${formatCountdown(state.remainingS)}`,
      };
    case 'permissionDenied':
    case 'serviceOff':
      // Owner feedback 2026-11-10: keep the circle's sub-label SHORT —
      // the why lives on the warning card and in the popup.
      return { pill: null, sub: 'Turn on location' };
    case 'preciseOff':
      return { pill: null, sub: 'Turn on precise location' };
    case 'offline':
    case 'resolving':
    case 'dialogPending':
    case 'done':
    default:
      return { pill: null, sub: null };
  }
}

/** The action this posture would fire — the label under the fingerprint
 *  and the a11y vocabulary. Every blocked or busy posture reflects the
 *  PENDING action: while checked in, the face says "Check out" whether it
 *  is ready, blocked, rate-limited or mid-request. */
function actionFor(state: TodayButtonState): string {
  switch (state.kind) {
    case 'readyOut':
      return 'Check out';
    case 'offline':
    case 'permissionDenied':
    case 'preciseOff':
    case 'serviceOff':
    case 'rateLimited':
    case 'dialogPending':
    case 'resolving':
      return state.action === 'out' ? 'Check out' : 'Check in';
    default:
      return 'Check in';
  }
}

/** The blocked-location postures DO fire (they open remediation); offline/
 *  rate-limited/resolving/latched never do. */
function isInteractive(state: TodayButtonState): boolean {
  return (
    state.kind === 'readyIn' ||
    state.kind === 'readyOut' ||
    state.kind === 'permissionDenied' ||
    state.kind === 'preciseOff' ||
    state.kind === 'serviceOff'
  );
}

/** The rotating dashed ring — the one attention motion (owner pick
 *  2026-11-10, after the soft glow and the comet both read badly): the
 *  mockup's own ring spins slowly, nothing new is added. Motion is an
 *  invitation — the ring spins only while a punch is invited (READY /
 *  ON SHIFT) and freezes in blocked and busy postures. Reduce-motion
 *  parks it. */
function RotatingRing({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const lap = useSharedValue(0);

  useEffect(() => {
    if (active && !reduced) {
      lap.value = withRepeat(
        withTiming(1, { duration: 40000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(lap);
    }
    // An unmount mid-spin must stop the repeat or it keeps driving the
    // shared value past the component's life.
    return () => cancelAnimation(lap);
  }, [active, reduced, lap]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${360 * lap.value}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, spin]}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_SIZE / 2 - 2}
          fill="none"
          stroke={RING}
          strokeWidth={2}
          strokeDasharray="4 7"
        />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  state: TodayButtonState;
  /** Whether the primary action may fire at all (facts known). */
  enabled: boolean;
  onPress: () => void;
}

export function PunchButton({ state, enabled, onPress }: Props) {
  const scheme = schemeFor(state);
  const action = actionFor(state);
  const interactive = enabled && isInteractive(state);
  const blocked = !interactive;
  const spinning = state.kind === 'resolving' || state.kind === 'dialogPending';
  const glowing = state.kind === 'readyIn' || state.kind === 'readyOut';
  const a11yLabel =
    state.kind === 'rateLimited'
      ? `${action}, ${formatCountdownWords(state.remainingS)}`
      : [action, scheme.sub].filter(Boolean).join(' — ');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: blocked }}
        onPress={interactive ? onPress : undefined}
        disabled={blocked}
        style={({ pressed }) => [styles.hit, pressed && interactive && styles.pressed]}>
        <View style={styles.stage}>
          <RotatingRing active={glowing} />
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="punchFace" cx="50%" cy="30%" r="80%">
                <Stop offset="0" stopColor={FACE.top} />
                <Stop offset="1" stopColor={FACE.bottom} />
              </RadialGradient>
              {/* The redesign's halo, in the face's own ink. */}
              <RadialGradient id="punchGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.55" stopColor={FACE.bottom} stopOpacity={0.28} />
                <Stop offset="1" stopColor={FACE.bottom} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_SIZE / 2 - 2}
              fill="url(#punchGlow)"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={FACE_SIZE / 2}
              fill="url(#punchFace)"
            />
          </Svg>

          {scheme.pill ? (
            <View style={[styles.pill, { backgroundColor: scheme.pill.bg }]}>
              <Text style={styles.pillLabel}>{scheme.pill.label}</Text>
            </View>
          ) : null}

          <View style={styles.faceContent}>
            <View style={styles.fpWell}>
              <Fingerprint size={30} color={colors.surfaceCard} strokeWidth={1.8} />
            </View>
            <Text style={styles.actionLabel}>{action}</Text>
            {spinning ? (
              <ActivityIndicator size="small" color={colors.surfaceCard} />
            ) : scheme.sub ? (
              <Text style={styles.subLabel} maxFontSizeMultiplier={1.4}>
                {scheme.sub}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  hit: {
    borderRadius: RING_SIZE / 2,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  stage: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 12,
    zIndex: 2,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.surfaceCard,
  },
  faceContent: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    borderRadius: FACE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fpWell: {
    width: FP_WELL_SIZE,
    height: FP_WELL_SIZE,
    // The mockup's squircle well, not a circle.
    borderRadius: 20,
    backgroundColor: colors.punch.fingerWell,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  actionLabel: {
    ...typography.title,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.surfaceCard,
  },
  subLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.surfaceCard,
    textAlign: 'center',
  },
});
