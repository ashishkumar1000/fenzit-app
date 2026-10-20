/**
 * useWeeklyOffDefaultForm — saving when no weekly-off rule is in effect.
 *
 * Requirement: a company with no rule (never set up, or cleared) has nothing
 * saved yet. The owner must be able to save their choice, including "no day
 * off" (everyone works all 7 days). An untouched form stays disabled, and
 * once a rule is in effect the normal "change it before Save" rule applies.
 *
 * Mocks only the save call and the success banner; the hook runs for real.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type {
  IsoWeekday,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
  WeeklyOffView,
} from '../../../services';
import {
  useWeeklyOffDefaultForm,
  type UseWeeklyOffDefaultFormOptions,
} from './useWeeklyOffDefaultForm';

const TODAY = '2026-10-20';
const view = (days: IsoWeekday[], validFrom = '2026-01-01'): WeeklyOffView => ({
  days,
  validFrom,
  validTo: null,
});
/** The server's answer after saving no rule at all. */
const NO_RULE_SAVED: WeeklyOffDefaultResponse = {
  configured: true,
  default: null,
  next: null,
  history: [],
};

const saveDefault = jest.fn<Promise<WeeklyOffDefaultResponse>, [SetWeeklyOffRequest]>();
const onSaved = jest.fn();

const BASE: UseWeeklyOffDefaultFormOptions = {
  defaultView: null,
  nextView: null,
  history: [],
  configured: false,
  hasLoaded: true,
  isSaving: false,
  today: TODAY,
  saveDefault,
  onSaved,
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
afterEach(() => {
  act(() => renderer?.unmount());
  jest.clearAllMocks();
});

describe('no rule in effect (never configured)', () => {
  it('an untouched form keeps Save disabled', () => {
    mount({ configured: false });
    expect(probe.saveDisabled).toBe(true);
  });

  it('one touch to "no day off" turns Save on, so the owner can save it', () => {
    mount({ configured: false });
    // Sunday is the visual suggestion; switching it off is the owner's choice.
    act(() => probe.onDayToggle([]));
    expect(probe.noWorkingDays).toBe(true);
    expect(probe.saveDisabled).toBe(false);
  });

  it('saving "no day off" sends an empty day set', async () => {
    saveDefault.mockResolvedValue(NO_RULE_SAVED);
    mount({ configured: false });
    act(() => probe.onDayToggle([]));
    await act(async () => {
      await probe.onSave();
    });
    expect(saveDefault).toHaveBeenCalledWith({ days: [], effectiveFrom: undefined });
    expect(onSaved).toHaveBeenCalledWith('Weekly off saved');
  });

  it('after a confirmed save, Save is off again until the owner changes something', async () => {
    saveDefault.mockResolvedValue(NO_RULE_SAVED);
    mount({ configured: false });
    act(() => probe.onDayToggle([]));
    await act(async () => {
      await probe.onSave();
    });
    expect(probe.saveDisabled).toBe(true);
  });
});

describe('no rule in effect (cleared)', () => {
  it('an untouched cleared rule keeps Save disabled', () => {
    mount({ configured: true });
    expect(probe.saveDisabled).toBe(true);
  });

  it('the owner can pick a day and save it after the rule was cleared', () => {
    mount({ configured: true });
    act(() => probe.onDayToggle([7]));
    expect(probe.saveDisabled).toBe(false);
  });
});

describe('a rule is in effect', () => {
  it('toggling back to the saved days leaves Save disabled', () => {
    mount({ configured: true, defaultView: view([6, 7]) });
    act(() => probe.onDayToggle([1, 6, 7]));
    expect(probe.saveDisabled).toBe(false);
    act(() => probe.onDayToggle([6, 7]));
    expect(probe.saveDisabled).toBe(true);
  });

  it('an untouched rule keeps Save disabled', () => {
    mount({ configured: true, defaultView: view([6, 7]) });
    expect(probe.saveDisabled).toBe(true);
  });
});
