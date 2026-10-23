/**
 * Component tests for LeaveReviewBanner (CAP-4 — requirement superseded
 * 2026-10: the 20-1 AC 12 pointer-row strip became this banner; the
 * assertions below pin the NEW anatomy): the count line, the "action
 * pending" line, and an explicit Review button that is the banner's SOLE
 * press target. A count only, never pending leave rows inline. Tester
 * stance: boundary counts (1 vs many, singular never "1 requests") and the
 * exact routing.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LeaveReviewBanner } from './LeaveReviewBanner';

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

function renderBanner(count: number, onPress: () => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<LeaveReviewBanner count={count} onPress={onPress} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

it('renders the count line and the pending-action line — the superseded strip anatomy is gone', () => {
  const root = renderBanner(2, jest.fn());
  expect(
    root.findAll(n => n.type === Text && n.props.children === '2 leave requests'),
  ).toHaveLength(1);
  expect(
    root.findAll(n => n.type === Text && n.props.children === 'Action pending approval'),
  ).toHaveLength(1);
  // The old pointer row's label renders nowhere.
  expect(
    root.findAll(n => n.type === Text && n.props.children === 'Leave requests to review'),
  ).toHaveLength(0);
});

it('the count line is correct in the many case: "3 leave requests"', () => {
  const root = renderBanner(3, jest.fn());
  expect(
    root.findAll(n => n.type === Text && n.props.children === '3 leave requests'),
  ).toHaveLength(1);
});

it('the count line is correct in the ONE case: singular, never "1 leave requests"', () => {
  const root = renderBanner(1, jest.fn());
  expect(
    root.findAll(n => n.type === Text && n.props.children === '1 leave request'),
  ).toHaveLength(1);
  expect(
    root.findAll(n => n.type === Text && n.props.children === '1 leave requests'),
  ).toHaveLength(0);
});

it('the Review button is the SOLE press target and files exactly one routing call', () => {
  const onPress = jest.fn();
  const root = renderBanner(2, onPress);
  // The card itself is NOT a press target (the superseded strip was one
  // whole-row pressable): walking up from the count line meets no onPress
  // before the banner's own root (which merely receives the callback).
  const title = root.find(
    n => n.type === Text && n.props.children === '2 leave requests',
  );
  let node = title.parent;
  while (node != null && node !== root) {
    expect(typeof node.props.onPress).not.toBe('function');
    node = node.parent;
  }
  // The Review button — the house pressable walk-up from its label Text
  // (the composite Pressable is mirrored by host Views in RTR; only the
  // composite carries onPress).
  const review = root.find(n => n.type === Text && n.props.children === 'Review');
  let pressable = review.parent;
  while (pressable != null && typeof pressable.props.onPress !== 'function') {
    pressable = pressable.parent;
  }
  expect(pressable).not.toBeNull();
  act(() => {
    pressable!.props.onPress();
  });
  expect(onPress).toHaveBeenCalledTimes(1);
});
