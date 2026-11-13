/**
 * SegmentedControl — the Design System's view-switching primitive. Tested at
 * the contract level: one active segment per render, press fires onChange
 * with that segment's value, and the active segment is announced via
 * `accessibilityState.selected` (the same a11y contract as the chip rows).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';

import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { colors, radius, shadow } from '../src/theme';

const OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'history', label: 'History' },
] as const;

type Scope = (typeof OPTIONS)[number]['value'];

/** Mounts wrapped in act (repo convention) — returns the renderer + spy. */
async function render(value: Scope) {
  const onChange = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(SegmentedControl<Scope>, {
        options: OPTIONS,
        value,
        onChange,
      }),
    );
  });
  return { renderer, onChange };
}

/**
 * The rendered segments, one instance per option. Matched by props, not
 * `findAllByType(Pressable)` — react-native's Pressable export doesn't
 * survive test-renderer type matching under the jest preset. Pressable's
 * a11y props propagate to inner host views too, so the same segment matches
 * at several tree layers — keep the outermost per label.
 */
function segmentsOf(renderer: ReactTestRenderer.ReactTestRenderer) {
  const seen = new Set<string>();
  return renderer.root
    .findAll(
      node =>
        typeof node.props?.accessibilityState === 'object' &&
        node.type !== Text, // exclude the label inside each segment
    )
    .filter(s => {
      const label = labelOf(s);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function labelOf(segment: ReactTestRenderer.ReactTestInstance): string {
  return segment.findByType(Text).props.children;
}

/**
 * Resolves a node's style for assertion — Pressable styles are functions of
 * the pressed state, so evaluate them unpressed before flattening.
 */
function flattenStyle(style: unknown): Record<string, unknown> {
  const resolved =
    typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return (StyleSheet.flatten(resolved as Parameters<typeof StyleSheet.flatten>[0]) ??
    {}) as Record<string, unknown>;
}

it('renders one segment per option with the given labels', async () => {
  const { renderer } = await render('today');

  expect(segmentsOf(renderer).map(labelOf)).toEqual([
    'Today',
    'Upcoming',
    'Overdue',
    'History',
  ]);
});

it('marks exactly the active segment as selected', async () => {
  const { renderer } = await render('upcoming');

  const segments = segmentsOf(renderer);
  const selected = segments
    .filter(s => s.props.accessibilityState.selected)
    .map(labelOf);
  expect(segments).toHaveLength(4);
  expect(selected).toEqual(['Upcoming']);
});

it('fires onChange with the pressed segment value', async () => {
  const { renderer, onChange } = await render('today');

  const overdue = segmentsOf(renderer).find(s => labelOf(s) === 'Overdue');
  if (!overdue) throw new Error('Overdue segment not rendered');

  await ReactTestRenderer.act(async () => {
    overdue.props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('overdue');
});

it('does not fire onChange when the already-active segment is pressed', async () => {
  const { renderer, onChange } = await render('today');

  const today = segmentsOf(renderer).find(s => labelOf(s) === 'Today');
  if (!today) throw new Error('Today segment not rendered');

  await ReactTestRenderer.act(async () => {
    today.props.onPress();
  });
  expect(onChange).not.toHaveBeenCalled();
});

/**
 * Pins the view-switching visual contract from DESIGN_SYSTEM.md ("Selection
 * controls — navigation vs filter"): sunken track, and the active segment is
 * a raised card — NOT a solid primary fill. If someone reverts the styling to
 * the banned solid-primary look, this fails before review has to catch it.
 */
it('styles the active segment as a raised card on a sunken track', async () => {
  const { renderer } = await render('upcoming');

  const track = renderer.root.find(
    node =>
      node.type !== Text &&
      flattenStyle(node.props.style)?.backgroundColor === colors.surfaceSunken,
  );
  expect(flattenStyle(track.props.style).borderRadius).toBe(radius.md);

  const active = segmentsOf(renderer).find(s => s.props.accessibilityState.selected);
  if (!active) throw new Error('active segment not rendered');
  const segmentStyle = flattenStyle(active.props.style);
  expect(segmentStyle.backgroundColor).toBe(colors.surfaceCard);
  expect(segmentStyle.elevation).toBe(shadow.sm.elevation); // raised, not filled
});

/**
 * The optional count badge (e.g. the overdue count on the Jobs screen): an
 * option with `badge` renders the number, and an option without one renders
 * no badge — segments stay label-only otherwise.
 */
it('renders a count badge only for options that carry one', async () => {
  type Scope = 'today' | 'overdue';
  const badgeOptions: ReadonlyArray<{ value: Scope; label: string; badge?: number }> = [
    { value: 'today', label: 'Today' },
    { value: 'overdue', label: 'Overdue', badge: 3 },
  ];
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(SegmentedControl<Scope>, {
        options: badgeOptions,
        value: 'today',
        onChange: jest.fn(),
      }),
    );
  });

  const badges = renderer.root.findAll(
    node => node.type === Text && node.props.children === 3,
  );
  expect(badges).toHaveLength(1);
});

// --- Dividers (the "one sentence of words" fix, 2026-11-13) -------------------

/** The divider Views in the tree — identified by their exact style. Divider
 *  nodes mirror at two tree layers (as the segments do), so dedupe by
 *  keeping only those whose parent is the sunken track. */
function dividersOf(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    node =>
      node.type !== Text &&
      flattenStyle(node.props.style)?.backgroundColor === colors.borderDefault &&
      flattenStyle(node.props.style)?.width === 1 &&
      flattenStyle(node.parent?.props.style)?.backgroundColor === colors.surfaceSunken,
  );
}

it('renders a hairline divider between adjacent INACTIVE segments only', async () => {
  // Active = Upcoming (2nd of 4): both boundaries touching the active pill
  // are split by the raised card, so the single remaining boundary
  // (Overdue | History) carries the one divider.
  const { renderer } = await render('upcoming');
  expect(dividersOf(renderer)).toHaveLength(1);
});

it('renders two dividers when the FIRST segment is active (both later boundaries)', async () => {
  const { renderer } = await render('today');
  expect(dividersOf(renderer)).toHaveLength(2);
});

it('renders two dividers when the LAST segment is active (both earlier boundaries)', async () => {
  const { renderer } = await render('history');
  expect(dividersOf(renderer)).toHaveLength(2);
});

it('renders three dividers when nothing is active (value outside the options)', async () => {
  // The employee Jobs tab's Pending scope: the control receives value
  // 'pending', which no option offers — no segment is active, so every
  // boundary gets its divider.
  const { renderer, onChange } = await render('pending' as Scope);
  expect(dividersOf(renderer)).toHaveLength(3);
  expect(segmentsOf(renderer).filter(s => s.props.accessibilityState.selected)).toHaveLength(0);
  // Pressing any segment still switches (a value outside the options is a
  // real state — Pending — not a disabled control).
  const today = segmentsOf(renderer).find(s => labelOf(s) === 'Today');
  await ReactTestRenderer.act(async () => {
    today!.props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith('today');
});

// --- Content sizing mode -------------------------------------------------------

it('content mode wraps the track in a horizontal ScrollView that never stretches', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(SegmentedControl<Scope>, {
        options: OPTIONS,
        value: 'today',
        onChange: jest.fn(),
        sizing: 'content',
      }),
    );
  });
  // The scroll container exists and its content container doesn't stretch
  // to the viewport (otherwise content mode would be equal mode on wide
  // screens).
  const scroll = renderer.root.findAll(
    node => node.props?.contentContainerStyle !== undefined,
  );
  expect(scroll.length).toBeGreaterThan(0);
  const trackStyle = flattenStyle(scroll[0].props.contentContainerStyle);
  expect(trackStyle.alignSelf).toBe('flex-start');

  // Segments are content-sized (a minWidth floor), NOT flex:1.
  const segment = segmentsOf(renderer)[0];
  const segmentStyle = flattenStyle(segment.props.style);
  expect(segmentStyle.flex).toBeUndefined();
  expect(segmentStyle.minWidth).toBe(64);
});

it('equal mode keeps every segment flex:1 and never wraps the track in a ScrollView', async () => {
  const { renderer } = await render('today');
  const scroll = renderer.root.findAll(
    node => node.props?.contentContainerStyle !== undefined,
  );
  expect(scroll).toHaveLength(0);
  const segmentStyle = flattenStyle(segmentsOf(renderer)[0].props.style);
  expect(segmentStyle.flex).toBe(1);
});
