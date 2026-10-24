/**
 * RewardCheck — the "you're in" moment: a success disc springs in, the check
 * pops, a ring washes outward and eight confetti dots scatter and fade.
 * Pure Reanimated (no Lottie dependency); runs once on mount.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { palette } from '../../../theme';

const SIZE = 96;
const PARTICLES = 8;
const BURST = 74;
const PARTICLE_COLORS = [palette.green500, palette.blue600, palette.green400, palette.blue400];

export function RewardCheck() {
  const disc = useSharedValue(0);
  const tick = useSharedValue(0);
  const ring = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    disc.value = withSpring(1, { damping: 10, stiffness: 170 });
    tick.value = withDelay(130, withSpring(1, { damping: 9, stiffness: 230 }));
    ring.value = withDelay(160, withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }));
    burst.value = withDelay(180, withTiming(1, { duration: 720, easing: Easing.out(Easing.quad) }));
  }, [disc, tick, ring, burst]);

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disc.value }],
  }));
  const tickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tick.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 0.8 + ring.value * 0.9 }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, ringStyle]} />
      {Array.from({ length: PARTICLES }).map((_, i) => (
        <Particle
          key={i}
          angle={(Math.PI * 2 * i) / PARTICLES}
          color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]}
          progress={burst}
        />
      ))}
      <Animated.View style={[styles.disc, discStyle]}>
        <Animated.View style={tickStyle}>
          <Check size={44} color={palette.gray0} strokeWidth={3.5} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Particle({
  angle,
  color,
  progress,
}: {
  angle: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const d = progress.value * BURST;
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(angle) * d },
        { translateY: Math.sin(angle) * d },
        { scale: 1 - progress.value * 0.4 },
      ],
    };
  });
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.green500,
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: palette.green300,
  },
  particle: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
  },
});
