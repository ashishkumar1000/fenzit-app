/**
 * Tests for `LeaveBalancesCard` (the two-tab Leave redesign, 2026-11):
 * the title override (the owner's detail sheet names the employee —
 * "Your" misattributed someone else's numbers, found in the Sally/device
 * review round), the disabled-type row dropping its remaining figure ("Not
 * available" beside "9 days left" cancelled itself out), the overdrawn
 * treatment, and the shells carrying the same title.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { InlineNotice, Skeleton } from '../../../components/ui';
import type { LeaveBalanceView } from '../../../services/resources/attendanceLeave';
import { LeaveBalancesCard } from './LeaveBalancesCard';

function balance(overrides: Partial<LeaveBalanceView> = {}): LeaveBalanceView {
  return {
    typeId: 't1',
    code: 'earned',
    name: 'Earned Leave',
    accrualMode: 'monthly',
    accrualDays: 1,
    paid: true,
    enabled: true,
    credits: 0,
    accrued: 12,
    carryForward: 0,
    consumed: 6,
    remaining: 6,
    ...overrides,
  };
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children) ? children.map(String).join('') : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderCard(props: {
  balances: LeaveBalanceView[];
  loading?: boolean;
  error?: string | null;
  title?: string;
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <LeaveBalancesCard
        balances={props.balances}
        loading={props.loading ?? false}
        error={props.error ?? null}
        title={props.title}
      />,
    );
  });
  lastRenderer = renderer;
  return renderer.root;
}

describe('LeaveBalancesCard', () => {
  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  it('titles itself "Your leave balances" by default and renders the rows', async () => {
    const root = await renderCard({ balances: [balance()] });
    expect(texts(root)).toContain('Your leave balances');
    expect(texts(root)).toContain('Earned Leave');
    expect(texts(root)).toContain('6 days left');
    expect(texts(root)).toContain('12 accrued · 6 used');
  });

  it("the title override names the balances owner (the sheet's admin context)", async () => {
    const root = await renderCard({
      balances: [balance()],
      title: "Priya's leave balances",
    });
    expect(texts(root)).toContain("Priya's leave balances");
    expect(texts(root)).not.toContain('Your leave balances');
  });

  it('a DISABLED type shows "Not available" and drops its remaining figure', async () => {
    const root = await renderCard({
      balances: [
        balance({ typeId: 't2', code: 'sick', name: 'Sick Leave', enabled: false, remaining: 9 }),
        balance(),
      ],
    });
    expect(texts(root)).toContain('Not available');
    expect(texts(root)).toContain('6 days left'); // the enabled row keeps its figure
    // The muted row's stale-looking "9 days left" never prints.
    expect(texts(root).filter(t => t.includes('days left'))).toHaveLength(1);
  });

  it('an overdrawn enabled row prints the overdrawn line', async () => {
    const root = await renderCard({ balances: [balance({ remaining: -0.5 })] });
    expect(texts(root)).toContain('Overdrawn by 0.5 days');
  });

  it('the loading and error shells carry the same title', async () => {
    const loading = await renderCard({
      balances: [],
      loading: true,
      title: "Ajay's leave balances",
    });
    expect(loading.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(texts(loading)).toContain("Ajay's leave balances");

    const failed = await renderCard({
      balances: [],
      error: "Couldn't load balances.",
      title: "Ajay's leave balances",
    });
    expect(failed.findAllByType(InlineNotice).length).toBe(1);
    expect(texts(failed)).toContain("Ajay's leave balances");
  });

  it('an empty list omits the card entirely (nothing accrual-bearing)', async () => {
    const root = await renderCard({ balances: [] });
    expect(texts(root)).toHaveLength(0);
  });
});
