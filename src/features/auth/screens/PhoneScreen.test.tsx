/**
 * PhoneScreen. The screen is purely presentational, so the tests drive it
 * through props only, in three groups: the session-expired banner (story
 * 5.3), the returning-device greeting (redesign — "Welcome back" vs the
 * neutral "Login/Signup"), and the number form's own behaviour — digit
 * filtering, the short-number block, and server errors surfacing as-is.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { PhoneScreen } from './PhoneScreen';
import { Button } from '../../../components/ui';

const baseProps = {
  value: '9876543210',
  onChangePhone: jest.fn(),
  onContinue: jest.fn(),
};

async function render(props: Partial<typeof PhoneScreen> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<PhoneScreen {...baseProps} {...(props as object)} />);
  });
  return renderer;
}

function flatText(node: ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer['root']): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** The submit CTA — one Button in the tree, labelled "Get OTP". */
function getOtp(root: ReactTestRenderer['root']) {
  const btn = root.findAllByType(Button).find(b => b.props.children === 'Get OTP');
  if (!btn) throw new Error('Get OTP button not found');
  return btn;
}

it('shows the session-expired banner with the story copy', async () => {
  const renderer = await render({ sessionExpired: true, onDismissSessionExpired: jest.fn() });

  const banner = renderer.root.findByProps({ accessibilityRole: 'alert' });
  expect(
    banner.findByProps({ children: 'Session expired — please log in again.' }),
  ).toBeTruthy();
  // Dismissible: the affordance must exist alongside the message.
  expect(banner.findByProps({ accessibilityLabel: 'Dismiss' })).toBeTruthy();

  await act(async () => {
    renderer.unmount();
  });
});

it('renders no banner by default', async () => {
  const renderer = await render();

  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);

  await act(async () => {
    renderer.unmount();
  });
});

it('the banner dismiss calls back', async () => {
  const onDismissSessionExpired = jest.fn();
  const renderer = await render({ sessionExpired: true, onDismissSessionExpired });

  const banner = renderer.root.findByProps({ accessibilityRole: 'alert' });
  await act(async () => {
    banner.findByProps({ accessibilityLabel: 'Dismiss' }).props.onPress();
  });
  expect(onDismissSessionExpired).toHaveBeenCalledTimes(1);

  await act(async () => {
    renderer.unmount();
  });
});

describe('the login greeting (redesign)', () => {
  it('a fresh device greets with the neutral heading', async () => {
    const renderer = await render();

    expect(renderer.root.findByProps({ children: 'Login/Signup' })).toBeTruthy();
    expect(
      renderer.root.findByProps({ children: 'Enter your mobile number to get started.' }),
    ).toBeTruthy();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('a device that logged in before greets with Welcome back — never both', async () => {
    const renderer = await render({ returningUser: true });

    expect(renderer.root.findByProps({ children: 'Welcome back' })).toBeTruthy();
    expect(
      renderer.root.findByProps({ children: 'Enter your mobile number to login.' }),
    ).toBeTruthy();
    expect(renderer.root.findAllByProps({ children: 'Login/Signup' })).toHaveLength(0);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('the number form', () => {
  it('keeps digits only and caps at 10 as the person types', async () => {
    const onChangePhone = jest.fn();
    const renderer = await render({ onChangePhone });

    const input = renderer.root.findByProps({ accessibilityLabel: 'Mobile number' });
    await act(async () => {
      input.props.onChangeText('98-765a43210999');
    });

    expect(onChangePhone).toHaveBeenCalledWith('9876543210');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('a short number gets a plain-English error and never reaches the backend', async () => {
    const onContinue = jest.fn();
    const renderer = await render({ value: '98765', onContinue });

    await act(async () => {
      getOtp(renderer.root).props.onPress();
    });

    expect(onContinue).not.toHaveBeenCalled();
    expect(texts(renderer.root)).toContain('Enter your 10-digit mobile number.');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('a full number continues to the OTP step', async () => {
    const onContinue = jest.fn();
    const renderer = await render({ onContinue });

    await act(async () => {
      getOtp(renderer.root).props.onPress();
    });

    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('a server error (rate limit, SMS failure) shows as-is', async () => {
    const message = 'Too many attempts. Please wait a few minutes and try again.';
    const renderer = await render({ serverError: message });

    expect(texts(renderer.root)).toContain(message);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('the terms line stays on the page', async () => {
    const renderer = await render();

    expect(renderer.root.findByProps({ children: 'Terms of Service' })).toBeTruthy();

    await act(async () => {
      renderer.unmount();
    });
  });
});
