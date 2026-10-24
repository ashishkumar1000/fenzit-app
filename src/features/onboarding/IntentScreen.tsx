/**
 * IntentScreen — the role picker, shown straight after the welcome.
 *
 * This is an INTENT, not an identity: the phone number decides the real role
 * at OTP time (see intent.ts). The two expanded cards do the talking; a
 * hand-drawn journey scene (shop → van → pin) sits faded behind them as
 * background scenery.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft, Check } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, palette, radius, shadow, spacing, typography, fontSize, weight, leading } from '../../theme';
import type { OnboardingIntent } from './intent';
import { JourneyArt, OwnerArt, StaffArt } from './components/artwork';

type Props = {
  onContinue: (intent: OnboardingIntent) => void;
  onSkip: () => void;
  onBack: () => void;
};

const SPRING = { damping: 15, stiffness: 200 };

export default function IntentScreen({ onContinue, onSkip, onBack }: Props) {
  const [selected, setSelected] = useState<OnboardingIntent | null>(null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to welcome">
          <ArrowLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Background scenery — the day's journey, faded behind the cards. */}
        <View style={styles.bgArt} pointerEvents="none">
          <JourneyArt />
        </View>

        <Text style={styles.title}>What do you do?</Text>

        <IntentCard
          index={0}
          art={<StaffArt size={52} />}
          tag="STAFF"
          title="I am an Employee"
          body="Get jobs, check in, close work with photo proof."
          selected={selected === 'staff'}
          onPress={() => setSelected('staff')}
        />
        <IntentCard
          index={1}
          art={<OwnerArt size={52} />}
          tag="OWNER"
          title="I run the business"
          body="Assign jobs, watch live status, run attendance."
          selected={selected === 'owner'}
          onPress={() => setSelected('owner')}
        />
      </View>

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={selected === null}
          onPress={() => selected && onContinue(selected)}
          accessibilityState={{ disabled: selected === null }}>
          Continue
        </Button>
        <Pressable onPress={onSkip} hitSlop={12} accessibilityRole="button">
          <Text style={styles.skip}>Decide later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

type CardProps = {
  index: number;
  art: ReactNode;
  tag: string;
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
};

function IntentCard({ index, art, tag, title, body, selected, onPress }: CardProps) {
  const enterY = useSharedValue(28);
  const enterOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    enterY.value = withTiming(0, {
      duration: 420,
      easing: Easing.out(Easing.quad),
    });
    enterOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [index, enterY, enterOpacity]);

  useEffect(() => {
    checkScale.value = withSpring(selected ? 1 : 0, SPRING);
  }, [selected, checkScale]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterY.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  return (
    <Animated.View style={enterStyle}>
      <Animated.View style={pressStyle}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={title}
          onPress={onPress}
          onPressIn={() => {
            pressed.value = withTiming(1, { duration: 90 });
          }}
          onPressOut={() => {
            pressed.value = withTiming(0, { duration: 140 });
          }}
          style={[styles.card, selected ? styles.cardSelected : null]}>
          <View style={styles.iconWrap}>{art}</View>
          <View style={styles.cardText}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardTag}>{tag}</Text>
            </View>
            <Text style={styles.cardBody}>{body}</Text>
          </View>
          <View style={[styles.checkWrap, selected ? styles.checkOn : null]}>
            <Animated.View style={checkStyle}>
              <Check size={14} color={colors.onPrimary} strokeWidth={3.5} />
            </Animated.View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.s5,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s5,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
    color: colors.textStrong,
    marginBottom: spacing.s4,
  },
  bgArt: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.s2,
    opacity: 0.35,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    padding: spacing.s5,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.s4,
    ...shadow.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
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
    marginBottom: 2,
  },
  cardTitle: {
    ...typography.body,
    fontSize: fontSize.lg,
    fontWeight: weight.semibold,
    color: colors.textStrong,
  },
  cardTag: {
    ...typography.label,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    color: colors.primary,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  cardBody: {
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * leading.normal),
    color: colors.textBody,
  },
  checkWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  checkOn: {
    backgroundColor: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
    gap: spacing.s4,
    alignItems: 'center',
  },
  skip: {
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
    color: palette.gray500,
    paddingVertical: spacing.s2,
  },
});
