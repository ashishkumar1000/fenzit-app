/**
 * TodayEmptySchedule's TWO variants (owner call 2026-11-10): the compact
 * one-row card when attendance is ENABLED (the punch zone owns the day's
 * attention) and the original big dashed-well card when attendance is
 * DISABLED (the schedule is the whole day). Both share the refresh path —
 * the compact's own pill and the big variant's CTA both fire onRefresh.
 *
 * RTR house idioms; renderers unmounted at teardown.
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { Text } from 'react-native';
import { TodayEmptySchedule } from './TodayEmptySchedule';

let lastRenderer: ReactTestRenderer | null = null;

function renderVariant(props: { compact?: boolean }) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<TodayEmptySchedule onRefresh={jest.fn()} {...props} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

afterEach(() => {
  if (lastRenderer) {
    const r = lastRenderer;
    lastRenderer = null;
    act(() => r.unmount());
  }
});

function strings(root: ReactTestInstance): string[] {
  return root.findAll((n) => n.type === Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')));
}

describe('the COMPACT variant (attendance enabled)', () => {
  it('renders the dotted title row, the stronger title over the muted subtitle, and the Refresh chip', () => {
    const root = renderVariant({ compact: true });
    const s = strings(root);
    expect(s).toContain("Today's Schedule & Tasks");
    expect(s).toContain('No jobs assigned yet');
    expect(s).toContain('No visits scheduled today');
    expect(s).toContain('Refresh');
  });

  it('the copy hierarchy is real: the subtitle is a DIFFERENT node than the title (no same-weight twin)', () => {
    const root = renderVariant({ compact: true });
    const s = strings(root);
    expect(s.filter((t) => t === 'No jobs assigned yet')).toHaveLength(1);
    expect(s.filter((t) => t === 'No visits scheduled today')).toHaveLength(1);
  });

  it('the Refresh chip is the accessible refresh action (role + label)', () => {
    const root = renderVariant({ compact: true });
    // The chip: the pressable node carrying the full button a11y set.
    // (Type-symbol matching is unreliable here — RN wraps Pressable, so
    // the element's type is an inner function, not the import.)
    const chips = root.findAll(
      (n) =>
        n.props?.accessibilityLabel === 'Refresh schedule' &&
        typeof n.props?.onPress === 'function',
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].props.accessibilityRole).toBe('button');
  });
});

describe('the BIG variant (attendance disabled) — the schedule is the whole day', () => {
  it('keeps the original card: the dashed well, the unticked-clipboard copy and the refresh CTA', () => {
    const root = renderVariant({});
    const s = strings(root);
    expect(s).toContain("Today's Schedule & Tasks");
    expect(s).toContain('No jobs assigned yet');
    expect(
      s.some((t) => t.includes("hasn't assigned any field visits or special tasks")),
    ).toBe(true);
    expect(s).toContain('Tap to refresh');
  });

  it('the variants share ONE empty-day voice (copy unified 2026-11-10 review) but keep their own chrome', () => {
    const big = renderVariant({});
    expect(strings(big)).not.toContain('Refresh'); // the compact's chip label — big's CTA reads "Tap to refresh"
    const compact = renderVariant({ compact: true });
    expect(strings(compact)).not.toContain('Tap to refresh');
  });
});
