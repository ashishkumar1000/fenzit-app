/**
 * useWeeklyOffDefaultForm — re-seed rules (R-15/R-22), the R-11
 * "never configured" vs "cleared" distinction, and the queued "no day off"
 * stand-in `{days: [], validFrom}`.
 *
 * Requirements pinned (behaviour, not implementation):
 *  - the form follows the server rule when the owner has not edited;
 *  - it never overwrites unsaved edits mid-typing, and applies the new
 *    server rule once the owner undoes back to what they were shown;
 *  - `configured: false` suggests Sunday (visual only); `configured: true`
 *    with no rule (cleared) shows NO day off and no suggestion;
 *  - a queued "no day off" change seeds an empty form + its date, and is
 *    listed as upcoming without crashing.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { IsoWeekday, WeeklyOffView } from '../../../services';
import {
  useWeeklyOffDefaultForm,
  type UseWeeklyOffDefaultFormOptions,
} from './useWeeklyOffDefaultForm';

const TODAY = '2026-10-19';
const view = (days: IsoWeekday[], validFrom = '2026-01-01'): WeeklyOffView => ({
  days,
  validFrom,
  validTo: null,
});

const BASE: UseWeeklyOffDefaultFormOptions = {
  defaultView: view([6, 7]),
  nextView: null,
  history: [],
  configured: true,
  hasLoaded: true,
  isSaving: false,
  today: TODAY,
  saveDefault: jest.fn(),
  onSaved: jest.fn(),
};

let probe: ReturnType<typeof useWeeklyOffDefaultForm>;
function Probe(props: UseWeeklyOffDefaultFormOptions) {
  probe = useWeeklyOffDefaultForm(props);
  return null;
}
let renderer: ReactTestRenderer.ReactTestRenderer;
function mount(over: Partial<UseWeeklyOffDefaultFormOptions> = {}) {
  act(() => {
    renderer = create(<Probe {...BASE} {...over} />);
  });
}
function update(over: Partial<UseWeeklyOffDefaultFormOptions>) {
  act(() => {
    renderer.update(<Probe {...BASE} {...over} />);
  });
}
afterEach(() => {
  act(() => renderer?.unmount());
});

// Defects R-15 / R-22.
describe('form follows the server rule unless the owner is mid-edit', () => {
  it('seeds from the server rule once loaded; nothing before the load', () => {
    mount({ hasLoaded: false, defaultView: null, configured: undefined });
    expect(probe.selectedDays).toEqual([]);
    expect(probe.upcoming).toEqual([]);
    update({ hasLoaded: true });
    expect(probe.selectedDays).toEqual([6, 7]);
    expect(probe.saveDisabled).toBe(true);
  });

  it('an untouched form follows the server when the rule changes underneath it', () => {
    mount();
    expect(probe.selectedDays).toEqual([6, 7]);
    update({ defaultView: view([5]) });
    expect(probe.selectedDays).toEqual([5]);
    expect(probe.saveDisabled).toBe(true);
  });

  it('a queued change from another device shows its days and date', () => {
    mount();
    update({ nextView: view([1], '2026-12-01') });
    expect(probe.selectedDays).toEqual([1]);
    expect(probe.effectiveFrom).toBe('2026-12-01');
    expect(probe.saveDisabled).toBe(true);
  });

  it('does NOT clobber unsaved edits when the server rule changes mid-typing', () => {
    mount();
    act(() => probe.onDayToggle([1, 6, 7]));
    expect(probe.saveDisabled).toBe(false);
    update({ defaultView: view([5]) });
    expect(probe.selectedDays).toEqual([1, 6, 7]);
    expect(probe.saveDisabled).toBe(false);
  });

  it('once the owner undoes back to what they were shown, the newer server rule is applied', () => {
    mount();
    act(() => probe.onDayToggle([1, 6, 7]));
    update({ defaultView: view([5]) });
    act(() => probe.onDayToggle([6, 7]));
    expect(probe.selectedDays).toEqual([5]);
  });

  it('an unchanged refetch (new object, same days) does not reset the form', () => {
    mount();
    act(() => probe.onDayToggle([1, 6, 7]));
    update({ defaultView: view([6, 7]) });
    expect(probe.selectedDays).toEqual([1, 6, 7]);
  });

  it('an edited effective date alone also blocks the re-seed', () => {
    mount({ nextView: view([1], '2026-12-01') });
    act(() => probe.onEffectiveFromChange('2026-12-15'));
    update({ nextView: view([1], '2026-12-01'), defaultView: view([5]) });
    expect(probe.effectiveFrom).toBe('2026-12-15');
  });
});

// Defect R-11.
describe('never configured vs rule cleared', () => {
  it('configured:false suggests Sunday (visual only) and keeps Save disabled', () => {
    mount({ defaultView: null, configured: false });
    expect(probe.neverConfigured).toBe(true);
    expect(probe.selectedDays).toEqual([7]);
    expect(probe.saveDisabled).toBe(true);
  });

  it('configured:true with no rule (cleared) shows NO day off, no Sunday', () => {
    mount({ defaultView: null, configured: true });
    expect(probe.neverConfigured).toBe(false);
    expect(probe.selectedDays).toEqual([]);
    expect(probe.noWorkingDays).toBe(true);
    expect(probe.saveDisabled).toBe(true);
  });

  it('an older server without the flag infers never-configured from empty data only', () => {
    mount({ defaultView: null, configured: undefined });
    expect(probe.neverConfigured).toBe(true);
    update({ defaultView: null, configured: undefined, history: [view([5])] });
    expect(probe.neverConfigured).toBe(false);
  });

  it('configured:false but a rule exists still shows the rule, not Sunday', () => {
    mount({ defaultView: view([3]), configured: false });
    expect(probe.selectedDays).toEqual([3]);
  });

  it('before the load neverConfigured is false (no flash of the helper copy)', () => {
    mount({ hasLoaded: false, defaultView: null, configured: false });
    expect(probe.neverConfigured).toBe(false);
  });
});

describe('queued "no day off" stand-in', () => {
  const STAND_IN = { days: [] as IsoWeekday[], validFrom: '2099-01-01', validTo: null };

  it('seeds an empty form and the queued date; Save stays disabled until edited', () => {
    mount({ nextView: STAND_IN, history: [view([6, 7]), STAND_IN] });
    expect(probe.selectedDays).toEqual([]);
    expect(probe.effectiveFrom).toBe('2099-01-01');
    expect(probe.noWorkingDays).toBe(true);
    expect(probe.saveDisabled).toBe(true);
  });

  it('is listed as upcoming; past rows are not', () => {
    mount({ nextView: STAND_IN, history: [view([6, 7]), STAND_IN] });
    expect(probe.upcoming).toEqual([STAND_IN]);
  });

  it('a row dated exactly today is not upcoming (strictly future only)', () => {
    mount({ history: [view([5], TODAY)] });
    expect(probe.upcoming).toEqual([]);
  });

  it('never-configured company (configured:false) with a queued empty change does not suggest Sunday', () => {
    mount({ defaultView: null, configured: false, nextView: STAND_IN, history: [STAND_IN] });
    expect(probe.selectedDays).toEqual([]);
  });

  it('cleared company (configured:true) with a queued empty change does not suggest Sunday', () => {
    mount({ defaultView: null, configured: true, nextView: STAND_IN, history: [STAND_IN] });
    expect(probe.selectedDays).toEqual([]);
  });
});
