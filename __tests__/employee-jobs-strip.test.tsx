/**
 * EmployeeJobsStrip — the owner Home's "Jobs By Employees" strip (Epic 22
 * step 7, the user's mock).
 *
 * Pinned behaviour:
 *  - invisible on a silent tenant (nothing created AND nothing waiting) —
 *    a row of zeros is noise on a tenant that hasn't started;
 *  - four tiles with their counts and captions, zeros muted not green;
 *  - the amber "waiting" row is the COUNT-GATED actionable part: it appears
 *    only when pending > 0 (the bug that hid "1 waiting" lived in the
 *    mapper, but this row's gate is the last line of defence) and its tap
 *    opens the Jobs tab's Pending segment;
 *  - tiles are NOT tappable — only the waiting row is (honest affordances).
 *
 * The component is pure on its props, so the suite needs no stores.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';

jest.mock('react-native-svg', () => {
  const passthrough = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    props.children ?? null;
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (prop === 'default') return passthrough;
        return passthrough;
      },
    },
  );
});

import { EmployeeJobsStrip } from '../src/features/home/components/EmployeeJobsStrip';
import type { OwnerReportSummary } from '../src/services';

const makeSummary = (overrides: Partial<OwnerReportSummary> = {}): OwnerReportSummary => ({
  range: { from: '2026-10-15', to: '2026-11-13' },
  headline: {
    employeeCreated: 11,
    employeeApproved: 5,
    employeeAutoApproved: 3,
    ownerCreated: 10,
  },
  pending: 1,
  ...overrides,
});

let renderer: ReactTestRenderer | null = null;
const onPressPending = jest.fn();

async function mount(
  summary: OwnerReportSummary | null,
  extra: { isLoading?: boolean; error?: string | null; onRetry?: () => void } = {},
): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(
      <EmployeeJobsStrip
        summary={summary}
        isLoading={extra.isLoading}
        error={extra.error}
        onRetry={extra.onRetry}
        onPressPending={onPressPending}
      />,
    );
  });
  renderer = r;
  return r;
}

afterEach(() => {
  if (renderer) {
    act(() => {
      renderer?.unmount();
      renderer = null;
    });
  }
  jest.clearAllMocks();
});

function allText(r: ReactTestRenderer): string {
  return r.root
    .findAllByType(Text)
    .map(t => {
      const c = t.props.children;
      if (typeof c === 'string' || typeof c === 'number') return String(c);
      if (Array.isArray(c)) {
        return c
          .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
          .join('');
      }
      return '';
    })
    .join(' ');
}

describe('EmployeeJobsStrip — visibility', () => {
  it('renders nothing on a silent tenant (nothing created, nothing waiting)', async () => {
    const r = await mount(
      makeSummary({
        headline: {
          employeeCreated: 0,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pending: 0,
      }),
    );
    // Null render: no Text nodes at all.
    expect(r.root.findAllByType(Text)).toHaveLength(0);
  });

  it('stays hidden when only the owner created jobs — the strip is about EMPLOYEE work', async () => {
    // The visibility rule (the header doc): no employee-created jobs AND
    // nothing waiting → silent. The owner's own jobs alone don't summon it.
    const r = await mount(
      makeSummary({
        headline: {
          employeeCreated: 0,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 4,
        },
        pending: 0,
      }),
    );
    expect(r.root.findAllByType(Text)).toHaveLength(0);
  });

  it('renders when only the pending count is nonzero (nothing approved yet)', async () => {
    const r = await mount(
      makeSummary({
        headline: {
          employeeCreated: 2,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pending: 2,
      }),
    );
    expect(allText(r)).toContain('2 waiting');
  });
});

describe('EmployeeJobsStrip — the tiles', () => {
  it('shows the header, the window pill and the four count tiles', async () => {
    const r = await mount(makeSummary());
    const text = allText(r);
    expect(text).toContain('Jobs By Employees');
    expect(text).toContain('Last 30 days');
    expect(text).toContain('Created');
    expect(text).toContain('Approved');
    expect(text).toContain('Auto');
    expect(text).toContain('By you');
    // The counts themselves.
    expect(text).toContain('11');
    expect(text).toContain('5');
    expect(text).toContain('3');
    expect(text).toContain('10');
  });

  it('shows a zero tile muted in VALUE but present in content', async () => {
    const r = await mount(
      makeSummary({
        headline: {
          employeeCreated: 4,
          employeeApproved: 0,
          employeeAutoApproved: 0,
          ownerCreated: 0,
        },
        pending: 0,
      }),
    );
    const text = allText(r);
    expect(text).toContain('0');
    // The captions still name the tiles.
    expect(text).toContain('Total');
    expect(text).toContain('Managed');
  });

  it('tiles are not tappable — the only exit is the waiting row', async () => {
    // RN's Pressable wraps its content in a View that repeats the
    // accessibility props, so the button-role node count is unstable — the
    // STABLE contract is the label: every button-role node is the waiting
    // row, and no tile carries one.
    const r = await mount(makeSummary({ pending: 2 }));
    const buttons = r.root.findAllByProps({ accessibilityRole: 'button' });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.props.accessibilityLabel).toBe('2 jobs waiting for your approval');
    }
  });
});

describe('EmployeeJobsStrip — the waiting row (count-gated)', () => {
  it('shows the row when pending > 0, with the count and the destination hint', async () => {
    const r = await mount(makeSummary({ pending: 2 }));
    const text = allText(r);
    expect(text).toContain('2 waiting');
    expect(text).toContain('Review now');
  });

  it('hides the row when pending is 0 — even with work created', async () => {
    // The user's requirement: the amber row only when something actually
    // awaits a decision.
    const r = await mount(makeSummary({ pending: 0 }));
    expect(allText(r)).not.toContain('waiting');
    expect(allText(r)).not.toContain('Review now');
  });

  it('the row press opens the Jobs tab Pending segment', async () => {
    const r = await mount(makeSummary({ pending: 1 }));
    const row = r.root.findByProps({
      accessibilityRole: 'button',
    });
    await act(async () => {
      row.props.onPress();
    });
    expect(onPressPending).toHaveBeenCalledTimes(1);
  });

  it('the accessibility label carries the exact waiting count — singular included', async () => {
    const r = await mount(makeSummary({ pending: 7 }));
    const row = r.root.findByProps({ accessibilityRole: 'button' });
    expect(row.props.accessibilityLabel).toBe('7 jobs waiting for your approval');
    // "1 jobs" read as a grammar bug on the non-visual path.
    const one = await mount(makeSummary({ pending: 1 }));
    const rowOne = one.root.findByProps({ accessibilityRole: 'button' });
    expect(rowOne.props.accessibilityLabel).toBe('1 job waiting for your approval');
  });

  it('each tile reads as one composed sentence, not four loose fragments', async () => {
    const r = await mount(makeSummary({ pending: 0 }));
    const tiles = r.root.findAll(
      n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Created:'),
    );
    // The label mirrors onto a host child (the usual two-layer tree) — the
    // composition is what matters, not the node count.
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles[0].props.accessibilityLabel).toBe('Created: 11, Total');
  });
});

describe('EmployeeJobsStrip — the load states (never a silent absence)', () => {
  it('a first load in flight shows a skeleton, not nothing', async () => {
    const r = await mount(null, { isLoading: true });
    expect(allText(r)).not.toContain('Jobs By Employees');
    // The skeleton renders (the Card's body is non-empty).
    expect(r.root.findByType(require('react-native').View)).toBeTruthy();
  });

  it('a failed load shows a retry row that calls the retry handler', async () => {
    const onRetry = jest.fn();
    const r = await mount(null, { error: 'Network request failed', onRetry });
    expect(allText(r)).toContain("Couldn't load the jobs summary.");
    expect(allText(r)).toContain('Retry');
    const retry = r.root.findByProps({ accessibilityLabel: 'Retry loading the jobs summary' });
    await act(async () => {
      retry.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a failed load with no retry handler renders nothing (defensive; Home always passes one)', async () => {
    const r = await mount(null, { error: 'Network request failed' });
    expect(allText(r)).not.toContain('Retry');
  });

  it('a loaded summary with zero employee work still renders nothing (the silent rule stands)', async () => {
    const r = await mount(
      makeSummary({
        headline: { employeeCreated: 0, employeeApproved: 0, employeeAutoApproved: 0, ownerCreated: 0 },
        pending: 0,
      }),
    );
    expect(allText(r)).not.toContain('Jobs By Employees');
  });
});
