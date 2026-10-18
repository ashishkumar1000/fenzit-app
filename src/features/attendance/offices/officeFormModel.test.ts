/**
 * Tests for officeFormModel — the pure form layer behind
 * OfficeFormScreen (Story 15-4): validation mirrors the 15-3 server 422
 * ranges, formFromDetail picks the LATEST rule in the ascending history,
 * the diff gates keep an unchanged save from sending anything, and the
 * builders shape the create payload / edit PATCH (rules as a COMPLETE
 * five-field set, never partial).
 */
import {
  buildCreateRequest,
  buildUpdatePatch,
  cleanAddress,
  emptyOfficeForm,
  formFromDetail,
  hasErrors,
  isAddressChanged,
  isFormDirty,
  OFFICE_ADDRESS_MAX,
  isValidTime,
  profileChanged,
  rulesChanged,
  validateOfficeForm,
  type OfficeFormState,
} from './officeFormModel';
import type { OfficeDetail, OfficeRule } from '../../../types/office';

function detail(overrides: Partial<OfficeDetail> = {}): OfficeDetail {
  return {
    id: 'office-1',
    name: 'Andheri branch',
    latitude: 19.1364,
    longitude: 72.8296,
    radiusM: 100,
    archivedAt: null,
    rules: [rule('rule-1')],
    ...overrides,
  };
}

function rule(id: string, overrides: Partial<OfficeRule> = {}): OfficeRule {
  return {
    id,
    startTime: '09:00',
    endTime: '18:00',
    lateCutoffMinutes: 15,
    fullDayHours: 8,
    halfDayHours: 4,
    validFrom: '2026-09-01',
    validTo: null,
    ...overrides,
  };
}

function form(overrides: Partial<OfficeFormState> = {}): OfficeFormState {
  return {
    ...emptyOfficeForm(),
    name: 'Andheri branch',
    latitude: 19.1364,
    longitude: 72.8296,
    startTime: '09:00',
    endTime: '18:00',
    ...overrides,
  };
}

describe('isValidTime', () => {
  it.each([
    ['00:00', true],
    ['09:05', true],
    ['23:59', true],
    ['24:00', false],
    ['9:00', false],
    ['09:60', false],
    ['0900', false],
    ['', false],
  ])('%s → %p', (input, expected) => {
    expect(isValidTime(input)).toBe(expected);
  });
});

describe('validateOfficeForm', () => {
  it('returns an all-undefined errors object for the happy path', () => {
    expect(validateOfficeForm(form())).toEqual({});
    expect(hasErrors(validateOfficeForm(form()))).toBe(false);
  });

  it('requires a name within 80 characters', () => {
    expect(validateOfficeForm(form({ name: '   ' })).name).toBe('Enter an office name');
    expect(validateOfficeForm(form({ name: 'x'.repeat(81) })).name).toContain('80 characters');
    // Exactly 80 is within the limit.
    expect(validateOfficeForm(form({ name: 'x'.repeat(80) })).name).toBeUndefined();
    expect(validateOfficeForm(form({ name: '  Padded  ' })).name).toBeUndefined();
  });

  it('requires a placed pin', () => {
    expect(validateOfficeForm(form({ latitude: null })).location).toBe(
      'Place the office pin on the map',
    );
    expect(validateOfficeForm(form({ longitude: null })).location).toBeDefined();
  });

  it('validates the radius against the 50–1000 DB range', () => {
    expect(validateOfficeForm(form({ radiusM: 49 })).radiusM).toBe(
      'Check-in distance must be 50–1000 m',
    );
    expect(validateOfficeForm(form({ radiusM: 1001 })).radiusM).toBeDefined();
    expect(validateOfficeForm(form({ radiusM: 50 })).radiusM).toBeUndefined();
    expect(validateOfficeForm(form({ radiusM: 1000 })).radiusM).toBeUndefined();
  });

  it('validates the time range and end-after-start', () => {
    expect(validateOfficeForm(form({ startTime: '9:00' })).startTime).toBeDefined();
    expect(validateOfficeForm(form({ endTime: '18:60' })).endTime).toBeDefined();
    expect(validateOfficeForm(form({ endTime: '09:00' })).endTime).toBe(
      'End time must be after the start time',
    );
    // The end check only runs when the start itself is valid.
    expect(validateOfficeForm(form({ startTime: 'bad', endTime: '09:00' })).endTime).toBeUndefined();
  });

  it.each([
    ['', 'Enter the late cut-off'],
    ['   ', 'Enter the late cut-off'],
    ['-1', 'Late cut-off'],
    ['121', 'Late cut-off'],
    ['1.5', 'Late cut-off'],
    ['abc', 'Late cut-off'],
    ['0', undefined],
    ['120', undefined],
  ])('late cut-off %s → %p', (value, expectedPrefix) => {
    const error = validateOfficeForm(form({ lateCutoffMinutes: value })).lateCutoffMinutes;
    if (expectedPrefix === undefined) {
      expect(error).toBeUndefined();
    } else {
      expect(error).toContain(expectedPrefix);
    }
  });

  it('requires full-day hours > 0', () => {
    expect(validateOfficeForm(form({ fullDayHours: '0' })).fullDayHours).toBeDefined();
    expect(validateOfficeForm(form({ fullDayHours: '-2' })).fullDayHours).toBeDefined();
    expect(validateOfficeForm(form({ fullDayHours: '' })).fullDayHours).toBeDefined();
    // Non-numeric strings must not slip through as 0.
    expect(validateOfficeForm(form({ fullDayHours: 'abc' })).fullDayHours).toBeDefined();
  });

  it('requires half-day hours > 0 and < full-day', () => {
    expect(validateOfficeForm(form({ halfDayHours: '0' })).halfDayHours).toBeDefined();
    expect(validateOfficeForm(form({ halfDayHours: '8' })).halfDayHours).toBe(
      'Half-day hours must be less than full-day hours',
    );
    expect(validateOfficeForm(form({ halfDayHours: '9' })).halfDayHours).toBeDefined();
    expect(validateOfficeForm(form({ halfDayHours: '4' })).halfDayHours).toBeUndefined();
    expect(validateOfficeForm(form({ halfDayHours: 'abc' })).halfDayHours).toBeDefined();
  });

  it('hasErrors is true when any field failed', () => {
    expect(hasErrors(validateOfficeForm(form({ name: '' })))).toBe(true);
    expect(hasErrors(validateOfficeForm(form({ endTime: '09:00' })))).toBe(true);
  });
});

describe('formFromDetail', () => {
  it('pre-fills from the LATEST rule in the ascending history', () => {
    const loaded = detail({
      rules: [
        rule('rule-old', { startTime: '08:00', endTime: '17:00', validTo: '2026-09-26' }),
        rule('rule-new', { startTime: '10:00', endTime: '19:00', validFrom: '2026-09-27' }),
      ],
    });
    const state = formFromDetail(loaded);

    expect(state).toMatchObject({
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
      startTime: '10:00',
      endTime: '19:00',
    });
  });

  it('falls back to the create defaults when the office has no rule yet', () => {
    const state = formFromDetail(detail({ rules: [] }));

    expect(state.startTime).toBe('09:30');
    expect(state.endTime).toBe('18:30');
    expect(state.lateCutoffMinutes).toBe('15');
    expect(state.fullDayHours).toBe('8');
    expect(state.halfDayHours).toBe('4');
  });

  it('seeds the 18-5 default times on a NEW office form (times are mandatory — never blank)', () => {
    const fresh = emptyOfficeForm();

    expect(fresh.startTime).toBe('09:30');
    expect(fresh.endTime).toBe('18:30');
    expect(fresh.lateCutoffMinutes).toBe('15');
    expect(fresh.fullDayHours).toBe('8');
    expect(fresh.halfDayHours).toBe('4');
    // The seed is itself a valid rule — an owner tapping through Add-office
    // cannot silently ship a blank-time form.
    expect(hasErrors(validateOfficeForm({ ...fresh, name: 'X', latitude: 1, longitude: 2 }))).toBe(
      false,
    );
  });

  it('pins the LAST array entry as the latest rule (the server guarantees ascending validFrom)', () => {
    // Deliberately NOT ascending — the model trusts the server's ordering
    // and takes the tail of the history either way; this test documents it.
    const loaded = detail({
      rules: [
        rule('rule-future', { startTime: '10:00', endTime: '19:00', validFrom: '2027-01-01' }),
        rule('rule-current', { startTime: '08:00', endTime: '17:00' }),
      ],
    });

    expect(formFromDetail(loaded)).toMatchObject({
      startTime: '08:00',
      endTime: '17:00',
    });
  });
});

describe('rulesChanged / profileChanged', () => {
  it('is false for an untouched edit', () => {
    const loaded = detail();
    expect(rulesChanged(formFromDetail(loaded), loaded)).toBe(false);
    expect(profileChanged(formFromDetail(loaded), loaded)).toBe(false);
  });

  it('is true for a rules field change and for a profile field change', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    expect(rulesChanged(form({ ...base, startTime: '10:00' }), loaded)).toBe(true);
    expect(profileChanged(form({ ...base, radiusM: 250 }), loaded)).toBe(true);
  });

  it('ignores trailing whitespace in the name when diffing the profile', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    expect(profileChanged(form({ ...base, name: ' Andheri branch ' }), loaded)).toBe(false);
  });
});

describe('buildCreateRequest', () => {
  it('trims the name and casts the rule fields to numbers', () => {
    const payload = buildCreateRequest(form({ name: '  Andheri branch  ' }));

    expect(payload).toEqual({
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
    });
  });
});

describe('buildUpdatePatch', () => {
  it('sends nothing for an unchanged save', () => {
    const loaded = detail();
    const patch = buildUpdatePatch(formFromDetail(loaded), loaded);

    expect(patch).toEqual({});
  });

  it('sends the four profile fields only when the profile changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, name: 'Renamed' }), loaded);

    expect(patch).toEqual({
      name: 'Renamed',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
    });
  });

  it('sends the TRIMMED name when the rename only added whitespace', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, name: '  Renamed  ' }), loaded);

    expect(patch.name).toBe('Renamed');
  });

  it('sends the COMPLETE five-field rules set when one rule field changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, endTime: '19:00' }), loaded);

    expect(patch).toEqual({
      startTime: '09:00',
      endTime: '19:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
    });
  });

  it('sends both groups when both changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, radiusM: 300, endTime: '19:00' }), loaded);

    expect(Object.keys(patch).sort()).toEqual([
      'endTime',
      'fullDayHours',
      'halfDayHours',
      'lateCutoffMinutes',
      'latitude',
      'longitude',
      'name',
      'radiusM',
      'startTime',
    ]);
  });
});

describe('validateOfficeForm — late cut-off and half/full day (UX findings 6, 23)', () => {
  it.each(['1.5', '-1', '121', 'abc'])('late cut-off "%s" says whole number', (value) => {
    const errors = validateOfficeForm(form({ lateCutoffMinutes: value }));
    expect(errors.lateCutoffMinutes).toMatch(/whole number/);
  });

  it.each(['0', '15', '120'])('late cut-off "%s" is accepted', (value) => {
    expect(validateOfficeForm(form({ lateCutoffMinutes: value })).lateCutoffMinutes).toBeUndefined();
  });

  it('shows BOTH errors when full-day is 0 and half-day is larger', () => {
    const errors = validateOfficeForm(form({ fullDayHours: '0', halfDayHours: '10' }));
    expect(errors.fullDayHours).toBeDefined();
    expect(errors.halfDayHours).toMatch(/less than full-day/);
  });

  it('does not compare half-day against a blank full-day', () => {
    const errors = validateOfficeForm(form({ fullDayHours: '', halfDayHours: '10' }));
    expect(errors.fullDayHours).toBeDefined();
    expect(errors.halfDayHours).toBeUndefined();
  });

  it('half-day equal to full-day is rejected', () => {
    const errors = validateOfficeForm(form({ fullDayHours: '8', halfDayHours: '8' }));
    expect(errors.halfDayHours).toMatch(/less than full-day/);
  });

  it('half-day just under full-day passes', () => {
    const errors = validateOfficeForm(form({ fullDayHours: '8', halfDayHours: '7.5' }));
    expect(errors.halfDayHours).toBeUndefined();
  });
});

describe('isFormDirty — drives the discard-changes prompt (UX finding 16)', () => {
  it('is false for an untouched edit form', () => {
    const d = detail();
    expect(isFormDirty(formFromDetail(d), d)).toBe(false);
  });

  it('is false for an untouched blank Add form', () => {
    expect(isFormDirty(emptyOfficeForm(), null)).toBe(false);
  });

  it('is false for a rule-less office opened and left alone', () => {
    const d = detail({ rules: [] });
    expect(isFormDirty(formFromDetail(d), d)).toBe(false);
  });

  it('ignores leading and trailing spaces in text fields', () => {
    const d = detail();
    const f = { ...formFromDetail(d), name: `  ${d.name}  ` };
    expect(isFormDirty(f, d)).toBe(false);
  });

  it('is true once a name is typed on Add', () => {
    expect(isFormDirty({ ...emptyOfficeForm(), name: 'HQ' }, null)).toBe(true);
  });

  it('is true when only whitespace differs in meaning (name emptied on Edit)', () => {
    const d = detail();
    expect(isFormDirty({ ...formFromDetail(d), name: '   ' }, d)).toBe(true);
  });

  it.each([
    ['radiusM', 250],
    ['latitude', 12.9],
    ['longitude', 77.7],
    ['startTime', '10:00'],
    ['endTime', '19:00'],
    ['lateCutoffMinutes', '20'],
    ['fullDayHours', '9'],
    ['halfDayHours', '3'],
  ] as const)('is true when %s changes', (key, value) => {
    const d = detail();
    expect(isFormDirty({ ...formFromDetail(d), [key]: value }, d)).toBe(true);
  });

  it('is false again after a change is reverted', () => {
    const d = detail();
    const changed = { ...formFromDetail(d), lateCutoffMinutes: '99' };
    expect(isFormDirty(changed, d)).toBe(true);
    expect(isFormDirty({ ...changed, lateCutoffMinutes: String(d.rules[0].lateCutoffMinutes) }, d)).toBe(false);
  });

  it('is true when a pin is placed on Add', () => {
    expect(isFormDirty({ ...emptyOfficeForm(), latitude: 1, longitude: 2 }, null)).toBe(true);
  });
});

describe('pin address in the requests', () => {
  const ADDRESS = 'Koramangala, Bengaluru';
  const saved = detail({ formattedAddress: ADDRESS });
  const savedForm = formFromDetail(saved);

  it('create sends the address when there is one', () => {
    expect(buildCreateRequest(form(), ADDRESS).formattedAddress).toBe(ADDRESS);
  });

  it.each([undefined, null, ''])('create leaves the field out for %p (no key at all)', (address) => {
    expect('formattedAddress' in buildCreateRequest(form(), address)).toBe(false);
  });

  it('create without an address argument is the same payload as before', () => {
    expect(buildCreateRequest(form())).toEqual(buildCreateRequest(form(), null));
  });

  it('edit with nothing changed sends nothing — even though an address is shown', () => {
    expect(buildUpdatePatch(savedForm, saved, ADDRESS)).toEqual({});
  });

  it('renaming resends the pin AND the address (the server clears an address sent without one)', () => {
    const patch = buildUpdatePatch({ ...savedForm, name: 'HQ' }, saved, ADDRESS);
    expect(patch).toMatchObject({
      name: 'HQ',
      latitude: saved.latitude,
      longitude: saved.longitude,
      formattedAddress: ADDRESS,
    });
  });

  it('a radius-only change also carries the address', () => {
    const patch = buildUpdatePatch({ ...savedForm, radiusM: 300 }, saved, ADDRESS);
    expect(patch.radiusM).toBe(300);
    expect(patch.formattedAddress).toBe(ADDRESS);
  });

  it('a moved pin with a new address sends both', () => {
    const patch = buildUpdatePatch(
      { ...savedForm, latitude: 12.9, longitude: 77.6 },
      saved,
      'HSR Layout, Bengaluru',
    );
    expect(patch).toMatchObject({ latitude: 12.9, longitude: 77.6, formattedAddress: 'HSR Layout, Bengaluru' });
  });

  it('a moved pin with NO address omits the field, so the server clears the old one', () => {
    const patch = buildUpdatePatch({ ...savedForm, latitude: 12.9, longitude: 77.6 }, saved, null);
    expect(patch.latitude).toBe(12.9);
    expect('formattedAddress' in patch).toBe(false);
  });

  it('an office saved before addresses existed gains one when its pin is re-picked in place', () => {
    const legacy = detail();
    const patch = buildUpdatePatch(formFromDetail(legacy), legacy, ADDRESS);
    expect(patch).toMatchObject({
      latitude: legacy.latitude,
      longitude: legacy.longitude,
      formattedAddress: ADDRESS,
    });
  });

  it('a legacy office left alone (no address anywhere) still sends nothing', () => {
    const legacy = detail();
    expect(buildUpdatePatch(formFromDetail(legacy), legacy, null)).toEqual({});
    expect(buildUpdatePatch(formFromDetail(legacy), legacy)).toEqual({});
  });

  it('a rule-only change does not touch the pin or the address', () => {
    const patch = buildUpdatePatch({ ...savedForm, lateCutoffMinutes: '30' }, saved, ADDRESS);
    expect('latitude' in patch).toBe(false);
    expect('formattedAddress' in patch).toBe(false);
    expect(patch.lateCutoffMinutes).toBe(30);
  });
});


describe('address clean-up and change detection', () => {
  it.each([undefined, null, '', '   '])('cleanAddress turns %p into null', (v) => {
    expect(cleanAddress(v)).toBeNull();
  });

  it('trims, and caps at the server limit so a long lookup result cannot fail the save', () => {
    expect(cleanAddress('  Whitefield  ')).toBe('Whitefield');
    const long = 'a'.repeat(OFFICE_ADDRESS_MAX + 40);
    expect(cleanAddress(long)).toHaveLength(OFFICE_ADDRESS_MAX);
    expect(buildCreateRequest(form(), long).formattedAddress).toHaveLength(OFFICE_ADDRESS_MAX);
  });

  it('a whitespace-only address is never sent on create or edit', () => {
    expect('formattedAddress' in buildCreateRequest(form(), '   ')).toBe(false);
    const d = detail({ formattedAddress: null });
    expect(buildUpdatePatch(formFromDetail(d), d, '   ')).toEqual({});
  });

  it('isAddressChanged: false on Add, false when equal (ignoring spaces), true when gained, changed or lost', () => {
    const d = detail({ formattedAddress: 'Koramangala, Bengaluru' });
    expect(isAddressChanged(null, 'Anywhere')).toBe(false);
    expect(isAddressChanged(d, ' Koramangala, Bengaluru ')).toBe(false);
    expect(isAddressChanged(d, 'Indiranagar, Bengaluru')).toBe(true);
    expect(isAddressChanged(d, null)).toBe(true);
    expect(isAddressChanged(detail({ formattedAddress: null }), 'Koramangala')).toBe(true);
    expect(isAddressChanged(detail({ formattedAddress: null }), null)).toBe(false);
  });
});
