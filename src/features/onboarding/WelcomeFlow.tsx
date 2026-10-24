/**
 * WelcomeFlow — the pre-login stage: welcome hero → intent picker.
 * Hands the picked intent (or null for "decide later") to the app gate;
 * the phone number still decides the real role at login.
 */
import { useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import IntentScreen from './IntentScreen';
import type { OnboardingIntent } from './intent';

type Props = {
  onDone: (intent: OnboardingIntent | null) => void;
};

export default function WelcomeFlow({ onDone }: Props) {
  const [step, setStep] = useState<'welcome' | 'intent'>('welcome');

  if (step === 'welcome') {
    return <WelcomeScreen onGetStarted={() => setStep('intent')} />;
  }

  return (
    <IntentScreen
      onContinue={onDone}
      onSkip={() => onDone(null)}
      onBack={() => setStep('welcome')}
    />
  );
}
