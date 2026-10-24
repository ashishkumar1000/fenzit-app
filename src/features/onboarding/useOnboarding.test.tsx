/**
 * useOnboarding — the persistence IS the feature (review finding): the app
 * gate reads these flags on every launch to decide whether the welcome flow
 * and the post-login first run ever show again. The tests drive the REAL
 * storage mock (same pattern as useAuth.test) and re-mount a fresh probe —
 * if a `storage.set` regressed, every launch would re-show the tour and
 * these tests would catch it.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';

import { useOnboarding } from './useOnboarding';
import { storage } from '../../services/storage';

const KEYS = [
  'fenzit.onboarding.welcomeDone',
  'fenzit.onboarding.intent',
  'fenzit.onboarding.firstRun.v2',
];

let probe: ReturnType<typeof useOnboarding>;
function Probe() {
  probe = useOnboarding();
  return null;
}

function mount() {
  act(() => {
    create(<Probe />);
  });
}

beforeEach(() => {
  for (const key of KEYS) storage.remove(key);
  mount();
});

it('a fresh install has nothing done', () => {
  expect(probe.welcomeDone).toBe(false);
  expect(probe.intent).toBeNull();
  expect(probe.firstRunDone).toBe(false);
});

it('completing the welcome persists the flag AND the picked intent', () => {
  act(() => {
    probe.completeWelcome('staff');
  });
  expect(probe.welcomeDone).toBe(true);
  expect(probe.intent).toBe('staff');

  // A fresh mount reads it all back from storage — this is the whole gate.
  mount();
  expect(probe.welcomeDone).toBe(true);
  expect(probe.intent).toBe('staff');
});

it('"decide later" persists welcomeDone with no intent', () => {
  act(() => {
    probe.completeWelcome(null);
  });

  mount();
  expect(probe.welcomeDone).toBe(true);
  expect(probe.intent).toBeNull();
});

it('a stored intent survives as-is; a malformed one reads as null', () => {
  storage.set('fenzit.onboarding.intent', 'owner');
  mount();
  expect(probe.intent).toBe('owner');

  storage.set('fenzit.onboarding.intent', 'hacker');
  mount();
  expect(probe.intent).toBeNull();
});

it('completing the first run persists once-per-install', () => {
  act(() => {
    probe.completeFirstRun();
  });

  mount();
  expect(probe.firstRunDone).toBe(true);
});
