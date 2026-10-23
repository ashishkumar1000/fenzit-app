/**
 * Tests for LiveTeamPulse — the Today pane's per-employee day list (the
 * 2026-10 owner request). Pins:
 *
 *  - the header counts what it shows: "Showing all N" with NO cap — the
 *    owner asked for the full list (anomalies-first is the BE's order and
 *    renders verbatim).
 *  - the late chip FOLDS ITS MINUTES IN ("Late · 20m") — the anomaly and
 *    its size read in one tag.
 *  - the detail line is a TAG and carries the fact each status can back:
 *    a checked-in row reads "9h 8m · out 6:20 pm" (worked time + checkout
 *    from the BE feed), a short day "Worked 2h 50m", a leave row its part
 *    ("Full day" / "First half"), a late row its checkout.
 *  - the phone renders as a tag beside the office — two people can share
 *    a name.
 *  - a row press hands the ROW to onOpenEmployee (the drill-down).
 */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LiveTeamPulse } from './LiveTeamPulse';
import type { DashboardEmployeeStat } from '../../../services';

function stat(overrides: Partial<DashboardEmployeeStat> = {}): DashboardEmployeeStat {
  return {
    employeeId: 'e1',
    employeeName: 'Rahul Verma',
    phone: '+91 9810000001',
    officeName: 'Main Office',
    status: 'checked_in',
    checkInAt: '2026-10-24T09:30:00+05:30',
    checkoutAt: null,
    lateMinutes: null,
    workedMinutes: null,
    leavePart: null,
    ...overrides,
  };
}

type Props = Parameters<typeof LiveTeamPulse>[0];

function render(employees: DashboardEmployeeStat[]) {
  const onOpenEmployee = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <LiveTeamPulse employees={employees} onOpenEmployee={onOpenEmployee} />,
    );
  });
  return { renderer, onOpenEmployee };
}

function texts(renderer: ReturnType<typeof create>): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

describe('LiveTeamPulse — the per-employee day list', () => {
  it('shows EVERY member — "Showing all N", no cap', () => {
    const roster = Array.from({ length: 10 }, (_, i) =>
      stat({ employeeId: `e${i}`, employeeName: `Member ${i}` }),
    );
    const { renderer } = render(roster);
    const t = texts(renderer);
    expect(t).toContain('Live Team Pulse');
    expect(t).toContain('Showing all 10');
    for (let i = 0; i < 10; i++) expect(t).toContain(`Member ${i}`);
  });

  it('the late chip folds its minutes in — "Late · 20m"', () => {
    const { renderer } = render([
      stat({ status: 'late', lateMinutes: 20, checkoutAt: '2026-10-24T19:10:00+05:30' }),
    ]);
    const t = texts(renderer);
    expect(t).toContain('Late · 20m');
    // The late row's detail is its checkout, tagged amber (the tag text).
    expect(t.some(x => /^out 7:10/.test(x))).toBe(true);
  });

  it('a checked-in row reads its worked time and checkout; a running one reads "Since"', () => {
    const { renderer } = render([
      stat({
        workedMinutes: 548,
        checkoutAt: '2026-10-24T18:20:00+05:30',
      }),
    ]);
    const t = texts(renderer);
    // The worked time and the checkout read in ONE tag.
    expect(t.some(x => x.includes('9h 8m · out 6:20'))).toBe(true);

    const { renderer: running } = render([
      stat({ workedMinutes: null, checkoutAt: null }),
    ]);
    expect(texts(running).some(x => /^Since /.test(x))).toBe(true);
  });

  it('a short day reads "Worked …"; a leave row reads its part', () => {
    const { renderer } = render([
      stat({ status: 'short_day', workedMinutes: 170 }),
      stat({
        employeeId: 'e2',
        employeeName: 'Priya Sharma',
        status: 'on_leave',
        checkInAt: null,
        leavePart: 'full_day',
      }),
      stat({
        employeeId: 'e3',
        employeeName: 'Suresh Kumar',
        status: 'on_leave',
        checkInAt: null,
        leavePart: 'first_half',
      }),
    ]);
    const t = texts(renderer);
    expect(t).toContain('Worked 2h 50m');
    expect(t).toContain('Full day');
    expect(t).toContain('First half');
  });

  it('the phone renders as a tag beside the office (two people can share a name)', () => {
    const { renderer } = render([stat()]);
    const t = texts(renderer);
    expect(t).toContain('Main Office');
    expect(t).toContain('+91 9810000001');
  });

  it('a row press hands the ROW to the drill-down', () => {
    const row = stat({ employeeId: 'e7', employeeName: 'Amit Patel' });
    const { renderer, onOpenEmployee } = render([stat(), row]);
    // The composite Card mirrors its a11y props on a host View — both
    // carry the label AND the handler; either surface IS the row press.
    const cards = renderer.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        typeof node.props.onPress === 'function' &&
        String(node.props.accessibilityLabel).startsWith('Amit Patel ('),
    );
    expect(cards.length).toBeGreaterThanOrEqual(1);
    act(() => {
      cards[0].props.onPress();
    });
    expect(onOpenEmployee).toHaveBeenCalledTimes(1);
    expect(onOpenEmployee).toHaveBeenCalledWith(row);
  });
});
