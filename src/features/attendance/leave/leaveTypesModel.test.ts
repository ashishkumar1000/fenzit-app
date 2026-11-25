/**
 * Model tests for `leaveTypesModel` (the two-tab Leave redesign, 2026-11):
 * the catalog display order (fixed four by CODE_ORDER, legacy remnants
 * last), the configurable-only configured count, the chip/mode labels,
 * the draft seeding, the rate validity + ±0.5 stepper clamp, the
 * numeric-equality dirty check, and the changed-fields-only PATCH body —
 * including the asleep hold (only `enabled` ships while off) and the
 * non-monthly carry/over exclusion the BE 422s.
 */
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveTypeView } from '../../../services/resources/attendanceLeave';
import {
  annualConversion,
  chipSubLabel,
  classifyTypeSaveFailure,
  configuredCount,
  draftFromType,
  daysOk,
  hasRate,
  modeChipLabel,
  orderLeaveTypes,
  patchBody,
  stepDays,
  TYPE_SAVE_GENERIC_MESSAGE,
  TYPE_SAVE_OFFLINE_MESSAGE,
  typeDirty,
} from './leaveTypesModel';

function type(overrides: Partial<LeaveTypeView> = {}): LeaveTypeView {
  return {
    id: 't1',
    code: 'earned',
    name: 'Earned Leave',
    accrualMode: 'monthly',
    accrualDays: 1,
    carryForward: true,
    allowOverBalance: false,
    paid: true,
    enabled: true,
    configurable: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function err(overrides: Partial<ApiError> = {}): ApiError {
  return {
    status: 422,
    code: 'SERVER_ERROR',
    message: 'Nope',
    ...overrides,
  } as ApiError;
}

describe('orderLeaveTypes (the chips order)', () => {
  it('orders the fixed four by CODE_ORDER and appends legacy rows after', () => {
    const legacy = type({ id: 'l1', code: null, name: 'Casual Leave' });
    const ordered = orderLeaveTypes([
      type({ id: 'c', code: 'comp_off', name: 'Comp Off' }),
      legacy,
      type({ id: 'b', code: 'bereavement', name: 'Bereavement' }),
      type({ id: 's', code: 'sick', name: 'Sick Leave' }),
      type({ id: 'e', code: 'earned', name: 'Earned Leave' }),
    ]);
    expect(ordered.map(row => row.id)).toEqual(['e', 's', 'b', 'c', 'l1']);
  });

  it('does not mutate the input', () => {
    const rows = [type({ id: 's', code: 'sick' }), type({ id: 'e', code: 'earned' })];
    orderLeaveTypes(rows);
    expect(rows.map(row => row.id)).toEqual(['s', 'e']);
  });
});

describe('configuredCount', () => {
  it('counts editable rows only — a legacy remnant is not configured', () => {
    expect(
      configuredCount([
        type(),
        type({ id: 't2', configurable: false, code: null, accrualMode: null }),
      ]),
    ).toBe(1);
  });
});

describe("chipSubLabel (the chip's secondary line)", () => {
  it('annualizes a monthly rate and marks the active state', () => {
    expect(chipSubLabel(type({ accrualDays: 1 }))).toBe('12 d / yr · Active');
    expect(chipSubLabel(type({ accrualDays: 1.5 }))).toBe('18 d / yr · Active');
  });

  it('shows the annual grant for annual types and the bare state for a remnant', () => {
    expect(chipSubLabel(type({ accrualMode: 'annual', accrualDays: 10 }))).toBe(
      '10 d / yr · Active',
    );
    expect(
      chipSubLabel(type({ accrualMode: null, code: null, enabled: false })),
    ).toBe('Off');
  });

  it('reads comp-off as As earned and flips the state word when off', () => {
    expect(chipSubLabel(type({ accrualMode: 'none', code: 'comp_off' }))).toBe(
      'As earned · Active',
    );
    expect(chipSubLabel(type({ accrualDays: 2, enabled: false }))).toBe('24 d / yr · Off');
  });
});

describe('modeChipLabel', () => {
  it('maps the three modes and falls back to Legacy for a remnant', () => {
    expect(modeChipLabel(type())).toBe('Monthly accrual');
    expect(modeChipLabel(type({ accrualMode: 'annual' }))).toBe('Annual grant');
    expect(modeChipLabel(type({ accrualMode: 'none', code: 'comp_off' }))).toBe(
      'Event basis',
    );
    expect(modeChipLabel(type({ accrualMode: null, code: null }))).toBe('Legacy');
  });
});

describe('draft seeding and the rate helpers', () => {
  it('draftFromType seeds every field from the wire row', () => {
    const source = type({ accrualDays: 1.5, carryForward: false, enabled: false });
    expect(draftFromType(source)).toEqual({
      days: '1.5',
      carryForward: false,
      allowOverBalance: false,
      paid: true,
      enabled: false,
    });
  });

  it('hasRate is true for monthly AND annual, false for comp-off and remnants', () => {
    expect(hasRate(type())).toBe(true);
    expect(hasRate(type({ accrualMode: 'annual' }))).toBe(true);
    expect(hasRate(type({ accrualMode: 'none', code: 'comp_off' }))).toBe(false);
    expect(hasRate(type({ accrualMode: null, code: null }))).toBe(false);
  });
});

describe('daysOk (the rate input contract)', () => {
  it('accepts 0–366 with at most 2 decimals and rejects the rest', () => {
    expect(daysOk('0')).toBe(true);
    expect(daysOk('12.5')).toBe(true);
    expect(daysOk('366')).toBe(true);
    expect(daysOk('')).toBe(false);
    expect(daysOk('367')).toBe(false);
    expect(daysOk('12.345')).toBe(false);
    expect(daysOk('-1')).toBe(false);
    expect(daysOk('abc')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(daysOk(' 12.5 ')).toBe(true);
  });
});

describe('stepDays (the ±0.5 stepper, clamped 0–366)', () => {
  it('steps by half, clamps both ends, and recovers junk as 0', () => {
    expect(stepDays('12', 0.5)).toBe('12.5');
    expect(stepDays('0', -0.5)).toBe('0');
    expect(stepDays('365.75', 0.5)).toBe('366');
    expect(stepDays('abc', 0.5)).toBe('0.5');
    expect(stepDays('12.', 0.5)).toBe('12.5');
  });
});

describe('annualConversion', () => {
  it('annualizes a valid rate and hides (null) an invalid one', () => {
    expect(annualConversion('1')).toBe('1 day/mo = 12 days/yr');
    expect(annualConversion('1.5')).toBe('1.5 day/mo = 18 days/yr');
    expect(annualConversion('999')).toBeNull();
    expect(annualConversion('')).toBeNull();
  });
});

describe('typeDirty (numeric-equality dirty check)', () => {
  it('"1.0" equals 1 — reformatting alone is not dirty', () => {
    const draft = draftFromType(type({ accrualDays: 1 }));
    expect(typeDirty(type({ accrualDays: 1 }), { ...draft, days: '1.0' })).toBe(false);
    expect(typeDirty(type({ accrualDays: 1 }), { ...draft, days: '1.5' })).toBe(true);
  });

  it('any boolean flip is dirty', () => {
    const draft = draftFromType(type());
    expect(typeDirty(type(), { ...draft, paid: false })).toBe(true);
    expect(typeDirty(type(), { ...draft, enabled: false })).toBe(true);
    expect(typeDirty(type(), { ...draft, carryForward: false })).toBe(true);
    expect(typeDirty(type(), { ...draft, allowOverBalance: true })).toBe(true);
  });

  it('a validity-failing days draft is never dirty on its own', () => {
    const draft = draftFromType(type({ accrualDays: 1 }));
    expect(typeDirty(type(), { ...draft, days: '999' })).toBe(false);
  });
});

describe('patchBody (changed-fields-only; the asleep hold)', () => {
  it('ships only changed fields on an awake save', () => {
    const draft = draftFromType(type({ accrualDays: 1, carryForward: true }));
    draft.days = '2';
    draft.allowOverBalance = true;
    expect(patchBody(type(), draft)).toEqual({
      accrualDays: 2,
      allowOverBalance: true,
    });
  });

  it('the asleep hold: an off draft ships ONLY the enabled change', () => {
    const draft = draftFromType(type({ accrualDays: 1, paid: true }));
    draft.enabled = false;
    draft.days = '5'; // held — never ships while asleep
    draft.paid = false; // held
    expect(patchBody(type(), draft)).toEqual({ enabled: false });
  });

  it('the carry/over fields never ship for a non-monthly type (BE 422s them)', () => {
    const annual = type({ accrualMode: 'annual', accrualDays: 10, carryForward: true });
    const draft = draftFromType(annual);
    draft.carryForward = false;
    draft.allowOverBalance = true;
    expect(patchBody(annual, draft)).toEqual({});
    const compOff = type({ accrualMode: 'none', code: 'comp_off' });
    const compDraft = draftFromType(compOff);
    compDraft.allowOverBalance = true;
    expect(patchBody(compOff, compDraft)).toEqual({});
  });

  it('an invalid rate never blocks a disable-only save and never ships', () => {
    const draft = draftFromType(type({ accrualDays: 1 }));
    draft.days = '999';
    expect(patchBody(type(), draft)).toEqual({});
  });

  it('an empty diff yields an empty body (the Save gate keeps it inert)', () => {
    expect(patchBody(type(), draftFromType(type()))).toEqual({});
  });
});

describe('classifyTypeSaveFailure (the save-failure posture)', () => {
  it('the unmount cancel is silent; transport loss is the offline line', () => {
    expect(classifyTypeSaveFailure(err({ code: 'CANCELLED', status: 0 }))).toEqual({
      kind: 'cancelled',
    });
    expect(classifyTypeSaveFailure(err({ code: 'NETWORK_ERROR', status: 0 }))).toEqual({
      kind: 'offline',
      message: TYPE_SAVE_OFFLINE_MESSAGE,
    });
    expect(classifyTypeSaveFailure(err({ code: 'TIMEOUT', status: 0 }))).toEqual({
      kind: 'offline',
      message: TYPE_SAVE_OFFLINE_MESSAGE,
    });
  });

  it('403/404 is gone (verbatim server message) and others are failed', () => {
    expect(classifyTypeSaveFailure(err({ status: 403, message: 'No longer here' }))).toEqual({
      kind: 'gone',
      message: 'No longer here',
    });
    expect(classifyTypeSaveFailure(err({ status: 404, message: '' }))).toEqual({
      kind: 'gone',
      message: TYPE_SAVE_GENERIC_MESSAGE,
    });
    expect(classifyTypeSaveFailure(err({ status: 422, message: 'Bad rate' }))).toEqual({
      kind: 'failed',
      message: 'Bad rate',
    });
    expect(classifyTypeSaveFailure(err({ status: 500, message: '' }))).toEqual({
      kind: 'failed',
      message: TYPE_SAVE_GENERIC_MESSAGE,
    });
  });
});
