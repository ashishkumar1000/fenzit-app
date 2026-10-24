/**
 * OtpScreen's WAIT surfaces (Story 20-1 loading sweep): the resend action's
 * three postures and the verify CTA's loading —
 *
 *  - counting → "New code in {mm:ss}", the action files nothing.
 *  - expired  → the action enables and fires onResend WITH the done
 *    callback; the window restarts only when done fires (a slow POST can't
 *    eat the 90s).
 *  - resending → "Resending…" and the link files NOTHING even at zero —
 *    the countdown neither runs nor restarts while the POST is in flight.
 *  - verifying/complete gate the verify CTA, not the resending posture.
 *  - a rate-limited resend (rateLimitSeconds) restarts the countdown at the
 *    server's Retry-After instead of the normal 90s.
 *
 * Fake timers drive the countdown; renderers unmount at teardown.
 */
jest.mock('../components/OtpInput', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    OtpInput: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'otp-input', ...props }),
  };
});
jest.mock('../components/AuthScaffold', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    AuthScaffold: ({ children }: { children: unknown }) =>
      ReactLib.createElement(View, { testID: 'auth-scaffold' }, children),
  };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '../../../components/ui';
import { Text } from 'react-native';
import { OtpScreen } from './OtpScreen';

type Props = Parameters<typeof OtpScreen>[0];

let lastRenderer: ReactTestRenderer | null = null;

function baseProps(): Props {
  return {
    phone: '9000000000',
    code: '',
    onChangeCode: () => {},
    onVerify: () => {},
    onResend: () => {},
    onChangeNumber: () => {},
    verifying: false,
    resending: false,
    error: undefined,
    rateLimitSeconds: 0,
  };
}

function renderScreen(props: Partial<Props> = {}) {
  const merged: Props = { ...baseProps(), ...props };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<OtpScreen {...merged} />);
  });
  lastRenderer = renderer;
  return {
    root: renderer.root,
    renderer,
    props: merged,
  };
}

function flatText(node: ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestInstance): string[] {
  return root.findAll((n) => n.type === Text).map(flatText);
}

/** The resend Pressable — the composite is mirrored by host Views, so find
 *  it by walking UP from the action label to the nearest press ancestor.
 *  Exact match: the countdown text ("New code in …") also
 *  contains "Resend", but only the action label is pressable; while the
 *  POST is in flight the label reads "Resending…". */
function resendLink(root: ReactTestInstance): ReactTestInstance {
  const label = root.findAll(
    (n: ReactTestInstance) =>
      n.type === Text && ['Resend SMS', 'Resending…'].includes(flatText(n)),
  )[0];
  if (!label) throw new Error('Resend link not found');
  let node: ReactTestInstance | null = label;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error('Resend pressable not found');
  return node;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  if (lastRenderer) {
    const r = lastRenderer;
    lastRenderer = null;
    act(() => r.unmount());
  }
  jest.useRealTimers();
});

describe('the resend link postures', () => {
  it('fresh mount: the window is fresh (01:30) and COUNTING — the link files nothing while it runs', () => {
    const onResend = jest.fn();
    const root = renderScreen({ onResend }).root;
    expect(texts(root)).toContain('New code in 01:30');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(texts(root)).toContain('New code in 01:29');
    expect(onResend).not.toHaveBeenCalled();
  });

  it('expired: the action enables and fires onResend with the done callback; the window does NOT restart until done', () => {
    const onResend = jest.fn();
    let done!: () => void;
    onResend.mockImplementation((cb?: () => void) => {
      done = cb as () => void;
    });
    const root = renderScreen({ onResend }).root;
    act(() => {
      jest.advanceTimersByTime(90_000);
    });
    expect(texts(root)).toContain('New code in 00:00');
    expect(resendLink(root).props.disabled).toBe(false); // active
    act(() => {
      resendLink(root).props.onPress();
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    // Not done yet — the window neither restarts nor runs ahead.
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(texts(root)).toContain('New code in 00:00'); // frozen
    act(() => {
      done();
    });
    // Done fires → the window restarts fresh.
    expect(texts(root)).toContain('New code in 01:30');
  });

  it('resending: the action reads "Resending…" and files NOTHING even at zero', () => {
    const onResend = jest.fn();
    const root = renderScreen({ onResend, resending: true }).root;
    act(() => {
      jest.advanceTimersByTime(90_000);
    });
    expect(texts(root)).toContain('Resending…');
    act(() => {
      resendLink(root).props.onPress();
    });
    expect(onResend).not.toHaveBeenCalled();
  });

  it('while resending the countdown neither RUNS (no ticking) nor restarts from a stale done', () => {
    const root = renderScreen({ resending: true }).root;
    const before = texts(root).find((t) => t.startsWith('New code in'));
    act(() => {
      jest.advanceTimersByTime(90_000 + 10_000);
    });
    const after = texts(root).find((t) => t.startsWith('New code in'));
    expect(after).toBe(before); // frozen for the POST's whole flight
  });
});

describe('the verify CTA gate', () => {
  it('an incomplete code keeps the CTA DISABLED (pinned — the native press is what a disabled gate denies)', () => {
    const onVerify = jest.fn();
    const root = renderScreen({ code: '12', onVerify, verifying: false }).root;
    const cta = root.findAllByType(Button).find((b) =>
      flatText(b).includes('Verify & Continue'),
    );
    if (!cta) throw new Error('Verify CTA not found');
    expect(cta.props.disabled).toBe(true);
  });

  it('a complete code enables the CTA; verifying pins it back disabled as Verifying…', () => {
    const onVerify = jest.fn();
    const root = renderScreen({ code: '1234', onVerify, verifying: true }).root;
    const cta = root.findAllByType(Button).find((b) =>
      flatText(b).includes('Verifying…'),
    );
    if (!cta) throw new Error('Verifying CTA not found');
    expect(cta.props.disabled).toBe(true);
  });
});

describe('the rate-limited resend countdown and error line', () => {
  it('rateLimitSeconds restarts the countdown at the server\'s Retry-After (mm:ss)', () => {
    const root = renderScreen({ rateLimitSeconds: 150 }).root;
    expect(texts(root)).toContain('New code in 02:30');
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(texts(root)).toContain('New code in 02:29');
  });

  it('rateLimitSeconds 0 leaves the normal 90s window alone', () => {
    const root = renderScreen({ rateLimitSeconds: 0 }).root;
    expect(texts(root)).toContain('New code in 01:30');
  });

  it('an error shows verbatim and flags the OtpInput once', () => {
    const root = renderScreen({ error: 'Wrong code, try again' }).root;
    expect(texts(root)).toContain('Wrong code, try again');
    const otpInput = root.findAllByProps({ testID: 'otp-input' })[0];
    expect(otpInput.props.error).toBe(true);
  });
});
describe('nothing pre-selected (the user ask)', () => {
  it('the OTP boxes get autoFocus OFF — the keypad opens only when a box is tapped', () => {
    const root = renderScreen().root;

    expect(root.findByProps({ testID: 'otp-input' }).props.autoFocus).toBe(false);
  });
});
