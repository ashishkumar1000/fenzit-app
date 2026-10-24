/**
 * IntentScreen — "What do you do?" (login redesign). The picker is an
 * INTENT, never an identity (the phone number decides the real role at OTP
 * time), so the tests pin what the AUDIENCE needs rather than internals:
 * the employee card comes first with plain-English wording, nothing is
 * pre-selected, a pick is a radio (switch, never toggle), and all three
 * exits work — Continue carries the pick, Decide later, back.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import IntentScreen from './IntentScreen';
import { Button } from '../../components/ui';

const baseProps = {
  onContinue: jest.fn(),
  onSkip: jest.fn(),
  onBack: jest.fn(),
};

function render(props: Partial<typeof baseProps> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<IntentScreen {...baseProps} {...props} />);
  });
  return r;
}

/** One node per card — Pressable mirrors its props onto host Views, so keep
 *  only the instances that actually carry the handler. */
const radios = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByProps({ accessibilityRole: 'radio' })
    .filter(n => typeof n.props.onPress === 'function');

function continueBtn(r: ReactTestRenderer.ReactTestRenderer) {
  const btn = r.root.findAllByType(Button).find(b => b.props.children === 'Continue');
  if (!btn) throw new Error('Continue button not found');
  return btn;
}

/** Walks UP from a Text leaf to its nearest pressable ancestor. */
function pressableFor(root: ReactTestInstance, label: string): ReactTestInstance {
  const leaf = root.findAll(n => n.type === Text && String(n.props.children) === label)[0];
  if (!leaf) throw new Error(`no text "${label}" on screen`);
  let node: ReactTestInstance | null = leaf;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error(`no pressable behind "${label}"`);
  return node;
}

beforeEach(() => jest.clearAllMocks());

describe('the two cards', () => {
  it('the employee card comes first, the owner card second', () => {
    const r = render();

    expect(radios(r).map(card => card.props.accessibilityLabel)).toEqual([
      'I am an Employee',
      'I run the business',
    ]);
  });

  it('nothing is pre-selected — Continue waits for a pick', () => {
    const r = render();

    for (const card of radios(r)) {
      expect(card.props.accessibilityState.checked).toBe(false);
    }
    expect(continueBtn(r).props.disabled).toBe(true);
  });
});

describe('picking', () => {
  it('a pick enables Continue and rides along', () => {
    const r = render();

    act(() => {
      radios(r)[0].props.onPress();
    });
    expect(radios(r)[0].props.accessibilityState.checked).toBe(true);
    expect(continueBtn(r).props.disabled).toBe(false);

    act(() => {
      continueBtn(r).props.onPress();
    });
    expect(baseProps.onContinue).toHaveBeenCalledWith('staff');
  });

  it('switching the pick replaces it — a radio, not a toggle', () => {
    const r = render();

    act(() => {
      radios(r)[0].props.onPress(); // employee
    });
    act(() => {
      radios(r)[1].props.onPress(); // owner
    });

    expect(radios(r)[0].props.accessibilityState.checked).toBe(false);
    expect(radios(r)[1].props.accessibilityState.checked).toBe(true);

    act(() => {
      continueBtn(r).props.onPress();
    });
    expect(baseProps.onContinue).toHaveBeenCalledWith('owner');
  });

  it('tapping the same card twice never deselects it', () => {
    const r = render();

    act(() => {
      radios(r)[1].props.onPress();
    });
    act(() => {
      radios(r)[1].props.onPress();
    });

    expect(radios(r)[1].props.accessibilityState.checked).toBe(true);
    expect(continueBtn(r).props.disabled).toBe(false);
  });
});

describe('the exits', () => {
  it('"Decide later" skips without a pick', () => {
    const r = render();

    act(() => {
      pressableFor(r.root, 'Decide later').props.onPress();
    });

    expect(baseProps.onSkip).toHaveBeenCalledTimes(1);
    expect(baseProps.onContinue).not.toHaveBeenCalled();
  });

  it('back returns to the welcome', () => {
    const r = render();

    act(() => {
      r.root.findByProps({ accessibilityLabel: 'Back to welcome' }).props.onPress();
    });

    expect(baseProps.onBack).toHaveBeenCalledTimes(1);
  });
});
