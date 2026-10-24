/**
 * NotOnTeamScreen (login redesign). A staff-intent login whose number
 * belongs to no company lands here — the screen's whole job is three
 * actions and one guard:
 *
 *   - hand the number to the admin (share sheet, formatted with +91)
 *   - the owner escape ("Set up new company")
 *   - the way back ("Use another number")
 *   - the guard: the employee is told NOT to set up a company
 *
 * Tester stance: the share message is the payload an admin reads to invite
 * the person — a malformed number there breaks the invite, so the exact
 * formatted number is pinned, not just "some message".
 */
import React from 'react';
import { Share, Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { NotOnTeamScreen } from './NotOnTeamScreen';

const baseProps = {
  phone: '9876543210',
  onSetUpInstead: jest.fn(),
  onUseAnotherNumber: jest.fn(),
};

function render(props: Partial<typeof baseProps> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<NotOnTeamScreen {...baseProps} {...props} />);
  });
  return r;
}

function flatText(node: ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map((c: unknown) => (c == null ? '' : String(c))).join('')
    : String(children ?? '');
}

function texts(root: ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** Walks UP from a Text leaf to its nearest pressable ancestor (the
 *  composite screens mirror Pressables with host Views). */
function pressableFor(root: ReactTestInstance, label: string): ReactTestInstance {
  const leaf = root.findAll(n => n.type === Text && flatText(n) === label)[0];
  if (!leaf) throw new Error(`no text "${label}" on screen`);
  let node: ReactTestInstance | null = leaf;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  if (node == null) throw new Error(`no pressable behind "${label}"`);
  return node;
}

beforeEach(() => jest.clearAllMocks());

it('shows the number the admin must invite, dial code and 5+5 split and all', () => {
  const r = render();

  expect(texts(r.root)).toContain('+91 98765 43210');
});

it('warns the employee away from company setup', () => {
  const r = render();

  expect(texts(r.root).some(t => t.includes('do NOT set up a company'))).toBe(true);
  // The invite instruction stays concrete: what to do while waiting.
  expect(
    texts(r.root).some(t => t.includes('Show this number to your company owner or manager')),
  ).toBe(true);
});

it('Share hands the FORMATTED number to the share sheet', async () => {
  const shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const r = render();

  await act(async () => {
    pressableFor(r.root, 'Share').props.onPress();
  });

  expect(shareSpy).toHaveBeenCalledTimes(1);
  const message = shareSpy.mock.calls[0][0].message as string;
  expect(message).toContain('+91 98765 43210');

  shareSpy.mockRestore();
});

it('"Set up new company" is the owner escape and calls back', () => {
  const r = render();

  const btn = r.root.findByProps({ accessibilityLabel: 'Set up new company' });
  act(() => {
    btn.props.onPress();
  });

  expect(baseProps.onSetUpInstead).toHaveBeenCalledTimes(1);
});

it('"Use another number" goes back to re-enter the number', () => {
  const r = render();

  act(() => {
    pressableFor(r.root, 'Use another number').props.onPress();
  });

  expect(baseProps.onUseAnotherNumber).toHaveBeenCalledTimes(1);
});
