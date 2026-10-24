/**
 * HowItWorksScreen — the "aha" beat from the Stitch redesign, rebuilt with
 * verified claims and hand-built SVG artwork: how a job actually runs in
 * Fenzit (check-in → steps → proof), one card per beat, staggered in.
 * Owner-only (FirstRunFlow routes everyone else straight to the primer),
 * so the content speaks with one voice.
 */
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../../components/ui';
import { colors, radius, shadow, spacing, typography, fontSize, weight, leading } from '../../theme';
import { Info } from 'lucide-react-native';
import { CheckInArt, NavigateArt, ProofArt } from './components/artwork';

type Props = {
  /** One-line correction when the picked intent differs from the phone's real role. */
  notice?: string | null;
  onContinue: () => void;
};

type Step = {
  key: string;
  art: ReactNode;
  title: string;
  body: string;
  chip: string;
  chipBg: object;
  chipFg: string;
};

export default function HowItWorksScreen({ notice, onContinue }: Props) {
  const steps: Step[] = [
    {
      key: 'checkin',
      art: <CheckInArt />,
      title: 'Check in on site',
      body: 'One-tap attendance at the office or job site \u2014 verified by location.',
      chip: 'LOCATION VERIFIED',
      chipBg: styles.chipGreen,
      chipFg: colors.status.done.fg,
    },
    {
      key: 'steps',
      art: <NavigateArt />,
      title: 'Work the steps in order',
      body: 'Exact address and the customer\u2019s phone one tap away \u2014 then do the steps one by one.',
      chip: 'STEP-BY-STEP',
      chipBg: styles.chipBlue,
      chipFg: colors.primary,
    },
    {
      key: 'proof',
      art: <ProofArt />,
      title: 'Close with proof',
      body: 'Photos and the customer\u2019s signature confirm the work is done.',
      chip: 'SIGNED OFF',
      chipBg: styles.chipGreen,
      chipFg: colors.status.done.fg,
    },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Scrollable: three cards + notice must survive small screens. */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {notice ? (
          <View style={styles.notice}>
            <Info size={16} color={colors.primary} strokeWidth={2} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>How every job runs</Text>
        <Text style={styles.subtitle}>
          {'From check-in to sign-off, every step is tracked for you.'}
        </Text>

        {steps.map((step, i) => (
          <StepCard key={step.key} step={step} index={i} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={onContinue}>
          Continue
        </Button>
      </View>
    </SafeAreaView>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  const y = useSharedValue(26);
  const opacity = useSharedValue(0);
  const chip = useSharedValue(0);

  useEffect(() => {
    const base = 160 + index * 150;
    y.value = withDelay(base, withSpring(0, { damping: 16, stiffness: 130 }));
    opacity.value = withDelay(base, withTiming(1, { duration: 300 }));
    chip.value = withDelay(base + 220, withSpring(1, { damping: 11, stiffness: 200 }));
  }, [index, y, opacity, chip]);

  const enter = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chip.value }],
  }));

  return (
    <Animated.View style={[styles.card, enter]}>
      <View style={styles.artWrap}>{step.art}</View>
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {step.title}
          </Text>
          <Animated.View style={[styles.chip, step.chipBg, chipStyle]}>
            <Text style={[styles.chipText, { color: step.chipFg }]}>{step.chip}</Text>
          </Animated.View>
        </View>
        <Text style={styles.cardBody}>{step.body}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s4,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: {
    flex: 1,
    color: colors.textBody,
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * leading.normal),
    color: colors.textMuted,
    marginBottom: spacing.s6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    marginBottom: spacing.s3,
    ...shadow.xs,
  },
  artWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  cardText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: 3,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: weight.semibold,
    color: colors.textStrong,
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: 10,
    fontWeight: weight.bold,
    letterSpacing: 0.5,
  },
  chipGreen: {
    backgroundColor: colors.status.done.bg,
  },
  chipBlue: {
    backgroundColor: colors.primarySoft,
  },
  cardBody: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * leading.normal),
    color: colors.textMuted,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
  },
});
