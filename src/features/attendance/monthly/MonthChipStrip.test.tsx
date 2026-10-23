/**
 * Tests for MonthChipStrip — the Monthly pane's month navigator (the
 * 2026-10 owner redesign from the fare-calendar strip idea). Pins:
 *
 *  - the chips print the MONTH NAME ONLY; the sticky tag carries the
 *    SELECTED month's year (the owner's "OCT … replace from year 2026 and
 *    it is sticky").
 *  - the selected chip is highlighted AND enabled; the real past is open;
 *    the real future is disabled (the day-statuses read never grades a
 *    future month).
 *  - the selected chip is in the FIRST frame's render window (the strip
 *    renders through it — the auto-scroll only moves, never populates).
 *  - a tap reports the tapped month verbatim.
 *  - scrolling past the end extends a year at a time (after Dec 2027,
 *    2028 comes — and so on).
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';
import { shiftYearMonth } from './monthlyModel';
import { MonthChipStrip } from './MonthChipStrip';

/** The device's real current month — the future-clamp line the component
 *  itself uses; the tests derive the SAME line from the clock. */
function deviceThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const NOW = deviceThisMonth();
const PREV = shiftYearMonth(NOW, -1);
const NEXT = shiftYearMonth(NOW, 1);

function renderStrip(value: string = NOW) {
  const onSelect = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<MonthChipStrip value={value} onSelect={onSelect} />);
  });
  return { renderer, onSelect };
}

/** The chip Pressables — mirrored by a host View carrying the same label;
 *  the Pressable owns the onPress. */
function chips(renderer: ReturnType<typeof create>['root']): ReactTestInstance[] {
  return renderer.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      /^\w{3} \d{4}$/.test(node.props.accessibilityLabel) &&
      typeof node.props.onPress === 'function',
  );
}

function chip(renderer: ReturnType<typeof create>['root'], ym: string) {
  const label = `${/^(\w{3})/.exec(monthName(ym))![1]} ${ym.slice(0, 4)}`;
  const matches = chips(renderer).filter(
    node => node.props.accessibilityLabel === label,
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
function monthName(ym: string): string {
  return MONTH_ABBR[Number(ym.slice(5, 7)) - 1];
}

describe('MonthChipStrip — the fare-strip redesign', () => {
  it('chips print the month name ONLY — the year lives in the sticky tag, never on a chip', () => {
    const { renderer } = renderStrip();
    const texts = renderer.root
      .findAllByType(Text)
      .map(t =>
        Array.isArray(t.props.children)
          ? t.props.children.join('')
          : String(t.props.children ?? ''),
      );
    // Month-only chip texts render…
    expect(texts.filter(t => MONTH_ABBR.includes(t)).length).toBeGreaterThanOrEqual(
      10,
    );
    // …and no chip TEXT repeats the year (only the sticky tag does).
    expect(texts.filter(t => /^\w{3} \d{4}$/.test(t))).toHaveLength(0);
    expect(texts).toContain(NOW.slice(0, 4));
  });

  it('the sticky tag carries the SELECTED year and flips with the selection', () => {
    const { renderer } = renderStrip(NOW);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(t => t.props.children === NOW.slice(0, 4)),
    ).toBe(true);

    const earlier = '2025-03';
    act(() => {
      renderer.update(<MonthChipStrip value={earlier} onSelect={jest.fn()} />);
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .some(t => t.props.children === '2025'),
    ).toBe(true);
  });

  it('the selected chip is highlighted-and-enabled; the past is open; the real future is disabled', () => {
    const { renderer } = renderStrip(NOW);
    expect(chip(renderer.root, NOW).props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(chip(renderer.root, PREV).props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    expect(chip(renderer.root, NEXT).props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
  });

  it('a SELECTED month past the device clock still reads enabled (the echo-correction may land there)', () => {
    // A server clock a month ahead of the device corrects the view onto a
    // device-future month — a selected chip that reads disabled would
    // strand the owner on an untappable month.
    const ahead = NEXT;
    const { renderer } = renderStrip(ahead);
    expect(chip(renderer.root, ahead).props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    // The rest of the real future stays locked.
    expect(chip(renderer.root, shiftYearMonth(ahead, 1)).props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
  });

  it('the selected chip exists in the FIRST frame (rendered through, not scrolled to)', () => {
    // initialNumToRender covers the selection: the strip renders the
    // selected month without waiting on the auto-scroll's virtualization.
    const { renderer } = renderStrip(NOW);
    expect(() => chip(renderer.root, NOW)).not.toThrow();
  });

  it('a tap reports the tapped month verbatim', () => {
    const { renderer, onSelect } = renderStrip(NOW);
    act(() => {
      chip(renderer.root, PREV).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PREV);
  });

  it('reaching the end extends a year at a time — after Dec 2027, 2028 comes', () => {
    const { renderer } = renderStrip(NOW);
    const list = renderer.root.findByType(FlatList);
    expect(list.props.data[0]).toBe('2025-01');
    expect(list.props.data.at(-1)).toBe('2027-12');
    expect(list.props.data).toHaveLength(36);

    act(() => {
      list.props.onEndReached();
    });
    expect(list.props.data).toHaveLength(48);
    expect(list.props.data.at(-1)).toBe('2028-12');

    // …and so on: each reach appends one more year.
    act(() => {
      list.props.onEndReached();
    });
    expect(list.props.data).toHaveLength(60);
    expect(list.props.data.at(-1)).toBe('2029-12');
  });
});
