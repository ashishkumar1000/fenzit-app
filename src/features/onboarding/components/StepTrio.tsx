/**
 * StepTrio — the three-step story under the welcome headline: Assign →
 * Track → Done as hand-drawn SVG illustrations floating free (no card
 * tiles behind them), joined by a dashed line, each with a label and a
 * small truth chip (no numeric prefixes). Tiles pop in once, in order,
 * driven by ONE shared progress value. Blue does the decoration; green
 * appears only on the Done seal.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, palette, spacing, weight } from '../../../theme';

const ART = 76;
const BLUE = palette.blue600;
const GREEN = palette.green700;
const CARD = palette.gray0;

type Props = {
  /** 0→1 progress shared value owned by the screen's entrance driver. */
  t: SharedValue<number>;
};

export function StepTrio({ t }: Props) {
  return (
    <View style={styles.row} accessible accessibilityLabel="Assign. Track. Done.">
      <Step t={t} at={0.36} label="Assign" chip="From the office" icon={<AssignArt />} />
      <Connector t={t} at={0.48} />
      <Step t={t} at={0.52} label="Track" chip="Live status" live icon={<TrackArt />} />
      <Connector t={t} at={0.64} />
      <Step t={t} at={0.68} label="Done" chip="Signoff" done icon={<DoneArt />} />
    </View>
  );
}

type StepProps = {
  t: SharedValue<number>;
  /** Entrance point on the shared 0→1 progress value. */
  at: number;
  label: string;
  chip: string;
  /** Renders the live-status dot inside the chip. */
  live?: boolean;
  /** Green chip — reserved for the Done step. */
  done?: boolean;
  icon: ReactNode;
};

function Step({ t, at, label, chip, live, done, icon }: StepProps) {
  const artStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at, at + 0.06], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(t.value, [at, at + 0.1, at + 0.16], [0.5, 1.08, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at + 0.04, at + 0.12], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [at + 0.04, at + 0.12], [6, 0], Extrapolation.CLAMP) },
    ],
  }));

  const chipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at + 0.1, at + 0.18], [0, 1], Extrapolation.CLAMP),
  }));

  const chipFg = done ? palette.green700 : palette.blue700;
  const chipBg = done ? palette.green50 : palette.blue50;

  return (
    <View style={styles.step}>
      <Animated.View style={[styles.artWrap, artStyle]}>{icon}</Animated.View>
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
      <Animated.View style={[styles.chip, { backgroundColor: chipBg }, chipStyle]}>
        {live ? <View style={styles.liveDot} /> : null}
        <Text style={[styles.chipText, { color: chipFg }]}>{chip}</Text>
      </Animated.View>
    </View>
  );
}

function Connector({ t, at }: { t: SharedValue<number>; at: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [at, at + 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scaleX: interpolate(t.value, [at, at + 0.14], [0.3, 1], Extrapolation.CLAMP) },
    ],
  }));
  return <Animated.View style={[styles.connector, style]} />;
}

/*
 * Hand-drawn illustrations, Fenzit palette: blue family decorates, green
 * only on the Done seal.
 */

/** Job card being dispatched — a paper plane lifts off the card. */
function AssignArt() {
  return (
    <Svg width={ART} height={ART} viewBox="0 0 76 76" fill="none">
      <Rect x={12} y={8} width={38} height={50} rx={6} fill={CARD} stroke={BLUE} strokeWidth={2.4} />
      <Rect x={20} y={17} width={22} height={4.5} rx={2.25} fill={palette.blue400} />
      <Rect x={20} y={27} width={15} height={4} rx={2} fill={palette.blue200} />
      <Rect x={20} y={36} width={19} height={4} rx={2} fill={palette.blue200} />
      <Path d="M27 64h10" stroke={palette.blue300} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M35 70h7" stroke={palette.blue300} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M45 46 70 34 52 53 Z" fill={palette.blue500} />
      <Path d="M52 53 70 34 57 61 Z" fill={palette.blue700} />
    </Svg>
  );
}

/** The day, live on the map — folded map, dashed route, destination pin. */
function TrackArt() {
  return (
    <Svg width={ART} height={ART} viewBox="0 0 76 76" fill="none">
      <Path
        d="M8 20 27 12 49 20 68 12 V54 L49 62 27 54 8 62 Z"
        fill={CARD}
        stroke={BLUE}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <Path d="M27 12V54" stroke={palette.blue200} strokeWidth={2} />
      <Path d="M49 20V62" stroke={palette.blue200} strokeWidth={2} />
      <Path
        d="M16 50C22 42 30 46 36 39 42 32 47 33 51.5 32.8"
        stroke={palette.blue400}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeDasharray="6 5"
      />
      <Circle cx={16} cy={50} r={3} fill={palette.blue300} />
      <Path
        d="M52 8C46 8 41.6 12.5 41.6 18.2 41.6 25.4 52 33.6 52 33.6 52 33.6 62.4 25.4 62.4 18.2 62.4 12.5 58 8 52 8Z"
        fill={BLUE}
      />
      <Circle cx={52} cy={18.4} r={3} fill={CARD} />
    </Svg>
  );
}

/** Signed off — an award seal with ribbons, the one green element. */
function DoneArt() {
  return (
    <Svg width={ART} height={ART} viewBox="0 0 76 76" fill="none">
      <Path d="M29 44 24 64 32 59.5 36 65 Z" fill={palette.green600} />
      <Path d="M47 44 52 64 44 59.5 40 65 Z" fill={palette.green600} />
      <Circle cx={38} cy={30} r={19} fill={palette.green50} stroke={GREEN} strokeWidth={2.4} />
      <Circle cx={38} cy={30} r={13.5} stroke={palette.green600} strokeWidth={1.6} opacity={0.5} />
      <Path
        d="m31.5 30.5 4.6 4.6 8.9-9.8"
        stroke={GREEN}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  step: {
    alignItems: 'center',
  },
  artWrap: {
    width: ART,
    height: ART,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: spacing.s2,
    fontSize: 14,
    fontWeight: weight.bold,
    color: colors.textStrong,
  },
  chip: {
    marginTop: spacing.s1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: weight.semibold,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: palette.blue500,
  },
  connector: {
    flex: 1,
    height: 0,
    marginTop: ART / 2,
    marginHorizontal: spacing.s1,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.blue300,
  },
});
