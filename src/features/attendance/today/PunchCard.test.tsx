/**
 * PunchCard (2026-11-10 redesign): two edge-aligned punch tiles, each
 * reading eyebrow label → big time → VERDICT (green "On time" / amber
 * "Late by …" / red "Early by …" past the shift midpoint / the grey
 * Pending pill), and the lone WORKED chip under the divider toned by the
 * day's verdict — a full shift keeps the green ✓ celebration, a short
 * day drops the ✓ and captions the gap ("Short by …"), no schedule stays
 * neutral. The old LATE BY / EARLY BY chips are gone: punctuality lives
 * in the tiles.
 *
 * RTR house idioms; renderers unmounted at teardown.
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { PunchCard } from './PunchCard';
import type { TodayTilesModel } from './attendanceTodayModel';

function tiles(overrides: Partial<TodayTilesModel> = {}): TodayTilesModel {
  return {
    checkinText: '9:04 AM',
    checkoutText: '6:02 PM',
    checkinVerdict: { kind: 'onTime' },
    checkoutVerdict: { kind: 'onTime' },
    checkoutHintMeridiem: 'PM',
    worked: { value: '8h 58m', caption: 'Shift duration', full: false, shortfallMinutes: null },
    ...overrides,
  };
}

let lastRenderer: ReactTestRenderer | null = null;

function renderCard(model: TodayTilesModel) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<PunchCard tiles={model} />);
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

function hasText(root: ReactTestInstance, part: string): boolean {
  return strings(root).some((t) => t.includes(part));
}

describe('the tiles — eyebrow labels, big times, verdict lines', () => {
  it('both tiles render their label, time and the green On time verdicts', () => {
    const root = renderCard(tiles());
    const s = strings(root);
    expect(s).toContain('CHECK IN');
    expect(s).toContain('CHECK OUT');
    // The meridiem is a nested Text span (the JSX-array-children gotcha):
    // the parent time node's children join as "9:04[object Object]".
    expect(s.some((t) => t.includes('9:04'))).toBe(true);
    expect(s.some((t) => t.includes('6:02'))).toBe(true);
    expect(s).toContain(' AM');
    expect(s).toContain(' PM');
    expect(s.filter((t) => t === 'On time')).toHaveLength(2);
  });

  it('a pending checkout renders the dashed placeholder with the shift-end meridiem hint and the Pending pill', () => {
    const root = renderCard(
      tiles({ checkoutText: null, checkoutVerdict: { kind: 'pending' } }),
    );
    expect(hasText(root, '- - : - -')).toBe(true);
    expect(hasText(root, 'PM')).toBe(true);
    expect(hasText(root, 'Pending')).toBe(true);
    // Exactly ONE verdict line remains — the check-in's; the out tile's
    // verdict became the pill.
    expect(strings(root).filter((t) => t === 'On time')).toHaveLength(1);
  });

  it('late and early verdicts carry the server minutes in the tiles', () => {
    const root = renderCard(
      tiles({
        checkinVerdict: { kind: 'late', minutes: 52 },
        checkoutVerdict: { kind: 'early', minutes: 390 },
      }),
    );
    expect(hasText(root, 'Late by 52 min')).toBe(true);
    expect(hasText(root, 'Early by 6h 30m')).toBe(true);
  });
});

describe('the lone WORKED chip — toned by the day\'s verdict', () => {
  it('a short day drops the ✓, renders the value and captions the quantified gap', () => {
    const root = renderCard(
      tiles({
        worked: { value: '2h 29m', caption: 'Short by 6h 31m', full: false, shortfallMinutes: 391 },
      }),
    );
    expect(hasText(root, 'WORKED')).toBe(true);
    expect(hasText(root, '2h 29m')).toBe(true);
    expect(hasText(root, 'Short by 6h 31m')).toBe(true);
    expect(hasText(root, 'Full shift completed')).toBe(false);
    // No ✓ badge on a day that fell short.
    expect(root.findAllByType(Check)).toHaveLength(0);
  });

  it('a FULL shift keeps the green ✓ celebration with the schedule caption', () => {
    const root = renderCard(
      tiles({
        worked: {
          value: '9h 00m',
          caption: 'Full shift completed • Sched 9:30 AM - 6:30 PM',
          full: true,
          shortfallMinutes: null,
        },
      }),
    );
    expect(hasText(root, '9h 00m')).toBe(true);
    expect(hasText(root, 'Full shift completed • Sched 9:30 AM - 6:30 PM')).toBe(true);
    expect(root.findAllByType(Check)).toHaveLength(1);
  });

  it('no schedule on the wire → the neutral chip: plain Shift duration, never a ✓', () => {
    const root = renderCard(tiles());
    expect(hasText(root, 'WORKED')).toBe(true);
    expect(hasText(root, 'Shift duration')).toBe(true);
    expect(hasText(root, 'Short by')).toBe(false);
    expect(root.findAllByType(Check)).toHaveLength(0);
  });

  it('before check-out lands (minutes unknown) there is no chip at all', () => {
    const root = renderCard(tiles({ worked: null }));
    expect(hasText(root, 'WORKED')).toBe(false);
    expect(hasText(root, 'Shift duration')).toBe(false);
  });
});

describe('the retired chips stay retired', () => {
  it('late/early NEVER render as chips — the tiles are the only punctuality surface', () => {
    const root = renderCard(
      tiles({
        checkinVerdict: { kind: 'late', minutes: 61 },
        checkoutVerdict: { kind: 'early', minutes: 30 },
      }),
    );
    const s = strings(root);
    expect(s.some((t) => t.includes('LATE BY'))).toBe(false);
    expect(s.some((t) => t.includes('EARLY BY'))).toBe(false);
  });
});
