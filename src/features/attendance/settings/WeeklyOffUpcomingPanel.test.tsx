/**
 * Upcoming panel and default section with the queued "no day off" stand-in
 * `{days: [], validFrom}` and the R-11 helper-copy states.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { WeeklyOffUpcomingPanel } from './WeeklyOffUpcomingPanel';
import { WeeklyOffDefaultSection } from './WeeklyOffDefaultSection';
import { formatLongDate } from './weeklyOffModel';
import type { IsoWeekday, WeeklyOffView } from '../../../services';

const row = (days: IsoWeekday[], validFrom: string): WeeklyOffView => ({
  days,
  validFrom,
  validTo: null,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});

function texts(r: ReactTestRenderer.ReactTestRenderer): string[] {
  return r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}
function mount(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  mounted.push(r);
  return r;
}

describe('WeeklyOffUpcomingPanel', () => {
  it('renders "No day off from this date" for a queued empty change, with what applies till then', () => {
    const r = mount(
      <WeeklyOffUpcomingPanel rows={[row([], '2099-01-01')]} currentDays={[6, 7]} />,
    );
    const t = texts(r);
    expect(t).toContain(formatLongDate('2099-01-01'));
    expect(t).toContain('No day off from this date. Till then: Sat & Sun off.');
    expect(t).toContain('1 change coming up');
  });

  it('a change queued AFTER an empty one says "Till then: No day off"', () => {
    const r = mount(
      <WeeklyOffUpcomingPanel
        rows={[row([], '2099-01-01'), row([7], '2099-02-01')]}
        currentDays={[6, 7]}
      />,
    );
    const t = texts(r);
    expect(t).toContain('Sun off from this date. Till then: No day off.');
    expect(t).toContain('2 changes coming up');
  });

  it('a malformed row with no days does not crash', () => {
    const bad = { validFrom: '2099-01-01', validTo: null } as unknown as WeeklyOffView;
    expect(() => mount(<WeeklyOffUpcomingPanel rows={[bad]} currentDays={[]} />)).not.toThrow();
  });

  it('two rows with the same date and days still both render (no dropped duplicate)', () => {
    const r = mount(
      <WeeklyOffUpcomingPanel
        rows={[row([], '2099-01-01'), row([], '2099-01-01')]}
        currentDays={[7]}
      />,
    );
    expect(texts(r).filter((x) => x === 'EVERYONE')).toHaveLength(2);
  });
});

describe('WeeklyOffDefaultSection states', () => {
  const props = {
    neverConfigured: false,
    selectedDays: [] as IsoWeekday[],
    onDayToggle: jest.fn(),
    isSaving: false,
    sevenSelected: false,
    noWorkingDays: true,
    effectiveFrom: '',
    onEffectiveFromChange: jest.fn(),
    today: '2026-10-19',
    saveError: null,
    saveDisabled: true,
    onSave: jest.fn(),
    upcoming: [] as WeeklyOffView[],
    currentDays: [] as IsoWeekday[],
  };

  it('cleared rule (configured, no day off) shows the configured copy and no "Right now" line (owner 2026-10-23)', () => {
    const t = texts(mount(<WeeklyOffDefaultSection {...props} />));
    expect(t).toContain(
      'Pick the days everyone is off. Days not picked count as working days.',
    );
    expect(t.some((x) => x.startsWith('Right now'))).toBe(false);
    expect(t).toContain('0 days off, 7 working days');
  });

  it('never configured shows the first-use helper and hides "Right now"', () => {
    const t = texts(
      mount(<WeeklyOffDefaultSection {...props} neverConfigured selectedDays={[7]} noWorkingDays={false} />),
    );
    expect(t.some((x) => x.startsWith('No weekly off set yet.'))).toBe(true);
    expect(t.some((x) => x.startsWith('Right now'))).toBe(false);
    expect(t).toContain('1 day off, 6 working days');
  });

  it('the queued empty change appears in the panel below the card', () => {
    const t = texts(
      mount(
        <WeeklyOffDefaultSection
          {...props}
          currentDays={[7]}
          upcoming={[row([], '2099-01-01')]}
        />,
      ),
    );
    expect(t).toContain('Upcoming changes');
    expect(t).toContain('No day off from this date. Till then: Sun off.');
  });
});
