/**
 * FirstRunFlow — the post-login stage of the redesigned onboarding:
 * owners get "How a job runs" → permissions primer → reward; employees skip
 * the tour (it sells the owner's workflow — their ask) and get the
 * permissions primer → reward, then into the app. The screen set follows
 * the session's REAL role (never the picked intent — see intent.ts), so a
 * corrected mismatch still gets the right content.
 * (The old slide-pager tour is gone — these screens carry its content.)
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontSize, weight } from '../../theme';
import type { UserRole } from '../../services';
import HowItWorksScreen from './HowItWorksScreen';
import PermissionsPrimerScreen from './PermissionsPrimerScreen';
import { RewardCheck } from './components/RewardCheck';

type Props = {
  role: UserRole | null;
  notice?: string | null;
  onDone: () => void;
};

type Step = 'how' | 'primer' | 'reward';

const REWARD_MS = 1600;

export default function FirstRunFlow({ role, notice, onDone }: Props) {
  // The "How a job runs" tour is exclusive to business owners — an employee
  // (or a viewer, who is neither) starts straight at the permissions primer.
  const [step, setStep] = useState<Step>(role === 'company_admin' ? 'how' : 'primer');

  useEffect(() => {
    if (step !== 'reward') return;
    const timer = setTimeout(onDone, REWARD_MS);
    return () => clearTimeout(timer);
  }, [step, onDone]);

  if (step === 'how') {
    return <HowItWorksScreen notice={notice} onContinue={() => setStep('primer')} />;
  }

  if (step === 'primer') {
    // `notice` rides along: a corrected mismatch (picked owner, the number is
    // an employee) lands here, not on the owner tour.
    return (
      <PermissionsPrimerScreen role={role} notice={notice} onContinue={() => setStep('reward')} />
    );
  }

  return <RewardScreen />;
}

function RewardScreen() {
  const labelY = useSharedValue(14);
  const labelOpacity = useSharedValue(0);

  useEffect(() => {
    labelY.value = withDelay(420, withSpring(0, { damping: 15, stiffness: 130 }));
    labelOpacity.value = withDelay(420, withTiming(1, { duration: 300 }));
  }, [labelY, labelOpacity]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelY.value }],
  }));

  return (
    <View style={styles.root}>
      <RewardCheck />
      <Animated.Text style={[styles.label, labelStyle]}>You're all set</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfacePage,
    gap: 20,
  },
  label: {
    fontSize: fontSize.xl,
    fontWeight: weight.bold,
    color: colors.textStrong,
  },
});
