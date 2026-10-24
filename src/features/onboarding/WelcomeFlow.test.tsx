/**
 * WelcomeFlow — the pre-login chain's glue (review finding): welcome hero →
 * intent picker → onDone. Both endpoints are tested in isolation (the
 * screens' own suites); nothing verified the wiring — a swapped onContinue/
 * onSkip or a Get-started that never advances would strand new users with a
 * green suite. The step screens are mocked and driven through their props.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('./WelcomeScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('./IntentScreen', () => ({ __esModule: true, default: () => null }));

import WelcomeFlow from './WelcomeFlow';
import WelcomeScreen from './WelcomeScreen';
import IntentScreen from './IntentScreen';

function render() {
  const onDone = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<WelcomeFlow onDone={onDone} />);
  });
  return { r, onDone };
}

beforeEach(() => jest.clearAllMocks());

it('starts on the welcome hero; Get started advances to the picker', () => {
  const { r } = render();

  expect(r.root.findAllByType(WelcomeScreen)).toHaveLength(1);
  expect(r.root.findAllByType(IntentScreen)).toHaveLength(0);

  act(() => {
    r.root.findByType(WelcomeScreen).props.onGetStarted();
  });

  expect(r.root.findAllByType(IntentScreen)).toHaveLength(1);
});

it('a pick rides to onDone with the chosen intent', () => {
  const { r, onDone } = render();
  act(() => {
    r.root.findByType(WelcomeScreen).props.onGetStarted();
  });

  act(() => {
    r.root.findByType(IntentScreen).props.onContinue('staff');
  });

  expect(onDone).toHaveBeenCalledWith('staff');
});

it('"Decide later" ends the flow with a null intent', () => {
  const { r, onDone } = render();
  act(() => {
    r.root.findByType(WelcomeScreen).props.onGetStarted();
  });

  act(() => {
    r.root.findByType(IntentScreen).props.onSkip();
  });

  expect(onDone).toHaveBeenCalledWith(null);
});

it('back from the picker returns to the welcome hero', () => {
  const { r } = render();
  act(() => {
    r.root.findByType(WelcomeScreen).props.onGetStarted();
  });

  act(() => {
    r.root.findByType(IntentScreen).props.onBack();
  });

  expect(r.root.findAllByType(WelcomeScreen)).toHaveLength(1);
  expect(r.root.findAllByType(IntentScreen)).toHaveLength(0);
});
