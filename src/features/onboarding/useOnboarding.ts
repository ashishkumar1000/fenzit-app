/**
 * First-run state for the redesigned onboarding, in gate order:
 *
 *   welcome  — the pre-login stage (Welcome hero → intent picker). One flag
 *              plus the chosen intent; both persist together.
 *   firstRun — the post-login stage (role tour → permissions primer), shown
 *              once per install after the session exists.
 *
 * Backed by MMKV — synchronous reads, no loading state, no first-frame flash.
 * (The old pre-login 3-slide tour flag `fenzit.onboardingComplete` is no
 * longer read; pre-launch, everyone sees the new flow.)
 */
import { useCallback, useState } from 'react';
import { storage } from '../../services/storage';
import type { OnboardingIntent } from './intent';

const WELCOME_KEY = 'fenzit.onboarding.welcomeDone';
const INTENT_KEY = 'fenzit.onboarding.intent';
// Versioned key: bump it when the post-login flow changes materially, so
// internal test devices that already completed the older flow see the new
// one exactly once. (Pre-launch — no public devices exist yet.)
const FIRST_RUN_KEY = 'fenzit.onboarding.firstRun.v2';

function readIntent(): OnboardingIntent | null {
  const raw = storage.getString(INTENT_KEY);
  return raw === 'owner' || raw === 'staff' ? raw : null;
}

export function useOnboarding() {
  const [welcomeDone, setWelcomeDone] = useState(() =>
    storage.getBoolean(WELCOME_KEY) ?? false,
  );
  const [intent, setIntent] = useState<OnboardingIntent | null>(readIntent);
  const [firstRunDone, setFirstRunDone] = useState(() =>
    storage.getBoolean(FIRST_RUN_KEY) ?? false,
  );

  const completeWelcome = useCallback((chosen: OnboardingIntent | null) => {
    storage.set(WELCOME_KEY, true);
    if (chosen) {
      storage.set(INTENT_KEY, chosen);
    }
    setIntent(chosen);
    setWelcomeDone(true);
  }, []);

  const completeFirstRun = useCallback(() => {
    storage.set(FIRST_RUN_KEY, true);
    setFirstRunDone(true);
  }, []);

  return { welcomeDone, intent, firstRunDone, completeWelcome, completeFirstRun };
}
