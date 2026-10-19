/**
 * TodayPulseCard at large system font (R-17): four chips share one row, so
 * labels cap at 1.3x and may wrap to 2 lines, values cap at 1.5x. Also the
 * data edges: zero counts, large counts, and an unparseable date.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { TodayPulseCard, formatPulseDate } from './TodayPulseCard';

type Pulse = Parameters<typeof TodayPulseCard>[0]['pulse'];

const pulse = (counts: Partial<Pulse['counts']> = {}, date = '2026-10-24'): Pulse =>
  ({
    status: 'ready',
    date,
    counts: { tracked: 11, checkedIn: 3, notCheckedIn: 5, onLeave: 1, late: 2, ...counts },
  }) as Pulse;

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});
function mount(p: Pulse) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(<TodayPulseCard pulse={p} onPress={jest.fn()} />);
  });
  mounted.push(r);
  return r.root;
}
const textOf = (n: ReactTestRenderer.ReactTestInstance) => [n.props.children].flat().join('');
const find = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAllByType(Text).find((t) => textOf(t) === label)!;

describe('TodayPulseCard font caps', () => {
  const LABELS = ['Present', 'Not in yet', 'On leave', 'Late'];

  it.each(LABELS)('label "%s" caps at 1.3x and allows 2 lines (no 1-line truncation)', (label) => {
    const node = find(mount(pulse()), label);
    expect(node.props.maxFontSizeMultiplier).toBe(1.3);
    expect(node.props.numberOfLines).toBe(2);
  });

  it('every count value caps at 1.5x', () => {
    const root = mount(pulse({ checkedIn: 3, notCheckedIn: 5, onLeave: 1, late: 2 }));
    for (const v of ['3', '5', '1', '2']) {
      expect(find(root, v).props.maxFontSizeMultiplier).toBe(1.5);
    }
  });

  it('the value cap is looser than the label cap (numbers stay readable)', () => {
    const root = mount(pulse());
    expect(find(root, '3').props.maxFontSizeMultiplier).toBeGreaterThan(
      find(root, 'Present').props.maxFontSizeMultiplier,
    );
  });
});

describe('TodayPulseCard data edges', () => {
  it('all-zero counts render 0s and 0% without crashing', () => {
    const root = mount(pulse({ tracked: 0, checkedIn: 0, notCheckedIn: 0, onLeave: 0, late: 0 }));
    expect(find(root, '0%')).toBeTruthy();
    expect(root.findAllByType(Text).filter((t) => textOf(t) === '0')).toHaveLength(4);
  });

  it('shows the checked-in share of tracked staff', () => {
    expect(find(mount(pulse({ tracked: 4, checkedIn: 1 })), '25%')).toBeTruthy();
  });

  it('large counts still carry the value cap', () => {
    const root = mount(pulse({ checkedIn: 12345 }));
    expect(find(root, '12345').props.maxFontSizeMultiplier).toBe(1.5);
  });

  it('formats the date by parts and tolerates garbage', () => {
    expect(formatPulseDate('2026-10-24')).toBe('Saturday, Oct 24');
    expect(formatPulseDate('garbage')).toBe('');
    expect(() => mount(pulse({}, 'garbage'))).not.toThrow();
  });
});
