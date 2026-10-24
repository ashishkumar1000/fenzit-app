/**
 * WelcomeScreen — the pre-login hero, per the approved redesign: brand glyph
 * on top, "All-in-one operations" eyebrow pill, two-line headline with the
 * blue accent word, then the Assign/Track/Done step trio floating in the
 * middle band, and a quick-setup eyebrow + CTA at the bottom. One shared
 * progress value drives the whole entrance top-to-bottom, so no element can
 * get stuck invisible. No background decoration.
 */
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Zap } from 'lucide-react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../../components/ui';
import { colors, palette, spacing, fontSize, weight } from '../../theme';
import { StepTrio } from './components/StepTrio';

type Props = {
  onGetStarted: () => void;
};

const MARK = 96;

export default function WelcomeScreen({ onGetStarted }: Props) {
  // One driver for the whole entrance — deterministic, nothing can stall at 0.
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) });
  }, [t]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0, 0.12], [10, 0], Extrapolation.CLAMP) },
      {
        scale: interpolate(t.value, [0, 0.1, 0.2], [0.85, 1.05, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.08, 0.16], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(t.value, [0.08, 0.18], [0.9, 1], Extrapolation.CLAMP) },
    ],
  }));

  const line1Style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.12, 0.2], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0.12, 0.22], [12, 0], Extrapolation.CLAMP) },
    ],
  }));

  const line2Style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.17, 0.25], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0.17, 0.27], [12, 0], Extrapolation.CLAMP) },
    ],
  }));

  const quickStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.82, 0.9], [0, 1], Extrapolation.CLAMP),
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.86, 0.96], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0.86, 0.96], [14, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.hero} pointerEvents="none">
        <Animated.View style={[styles.markWrap, logoStyle]}>
          {/* The naked brand glyph — no card tile, no ring, on the welcome hero. */}
          <Image
            source={require('../../assets/branding/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Fenzit"
          />
        </Animated.View>

        <Animated.View style={[styles.eyebrow, eyebrowStyle]}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrowText}>{'ALL-IN-ONE OPERATIONS'}</Text>
        </Animated.View>

        <Animated.Text style={[styles.headline, line1Style]}>
          {'Streamline field work,'}
        </Animated.Text>
        <Animated.Text style={[styles.headline, styles.headlineAccent, line2Style]}>
          {'effortlessly.'}
        </Animated.Text>

        <View style={styles.spacerTop} />

        <StepTrio t={t} />

        <View style={styles.spacerBottom} />
      </View>

      <View style={styles.footer}>
        <Animated.View style={[styles.quickRow, quickStyle]}>
          <Zap size={13} color={colors.primary} strokeWidth={2.5} />
          <Text style={styles.quickText}>{'Quick setup'}</Text>
        </Animated.View>

        <Animated.View style={ctaStyle}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={onGetStarted}
            trailingIcon={
              <ArrowRight size={18} color={colors.onPrimary} strokeWidth={2.5} />
            }>
            Get started
          </Button>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.s6,
  },
  markWrap: {
    alignItems: 'center',
    marginTop: spacing.s4,
  },
  logo: {
    width: MARK,
    height: MARK,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.s2,
    backgroundColor: palette.blue50,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.blue600,
  },
  eyebrowText: {
    fontSize: fontSize['2xs'],
    fontWeight: weight.bold,
    letterSpacing: 1.1,
    color: palette.blue700,
  },
  headline: {
    marginTop: spacing.s4,
    fontSize: fontSize['2xl'],
    fontWeight: weight.extra,
    letterSpacing: -0.5,
    lineHeight: 34,
    color: colors.textStrong,
    textAlign: 'center',
  },
  headlineAccent: {
    marginTop: 2,
    color: colors.primary,
  },
  spacerTop: {
    flex: 1.15,
    minHeight: spacing.s10,
  },
  spacerBottom: {
    flex: 1,
    minHeight: spacing.s12,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
    gap: spacing.s3,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  quickText: {
    fontSize: fontSize.xs,
    fontWeight: weight.semibold,
    color: colors.primary,
  },
});
