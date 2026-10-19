/**
 * filterTechnicians — the ONE search definition shared by the New Job
 * picker, the Select-technicians screen and the Edit-job sheet picker.
 * Contract: name substring, phone by digits-only, and (since the
 * human-readable-id rollout) employee-code by digits-only — so "104",
 * "EMP-104" and "emp104" all find the same row, while a digits-free query
 * ("emp") never matches codes (it would match every technician at once).
 */
import { filterTechnicians, sortTechniciansByName } from '../format';
import type { ProfileTechnician } from '../../../services';

const make = (overrides: Partial<ProfileTechnician>): ProfileTechnician => ({
  id: 't-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000001',
  status: 'active',
  skills: [],
  skillIds: [],
  createdAt: '2026-09-01T10:00:00Z',
  ...overrides,
});

const ROSTER: ProfileTechnician[] = [
  make({ id: 't-1', name: 'Ravi Kumar', phoneNumber: '9000000001', employeeCode: 'EMP-104' }),
  make({ id: 't-2', name: 'Anita Sharma', phoneNumber: '8985056986', employeeCode: 'EMP-002' }),
  make({ id: 't-3', name: 'Gopal Menon', phoneNumber: '9000000003' }),
];

describe('filterTechnicians', () => {
  it('returns the roster untouched for an empty/whitespace query', () => {
    expect(filterTechnicians(ROSTER, '')).toBe(ROSTER);
    expect(filterTechnicians(ROSTER, '   ')).toBe(ROSTER);
  });

  it('matches a name substring case-insensitively', () => {
    expect(filterTechnicians(ROSTER, 'ravi').map(t => t.id)).toEqual(['t-1']);
    expect(filterTechnicians(ROSTER, 'SHAR').map(t => t.id)).toEqual(['t-2']);
  });

  it('matches phone digits regardless of spacing or punctuation', () => {
    expect(filterTechnicians(ROSTER, '8985').map(t => t.id)).toEqual(['t-2']);
    expect(filterTechnicians(ROSTER, '8985-056-986').map(t => t.id)).toEqual(['t-2']);
  });

  it('matches an employee code by its digits in every common spelling', () => {
    expect(filterTechnicians(ROSTER, '104').map(t => t.id)).toEqual(['t-1']);
    expect(filterTechnicians(ROSTER, 'EMP-104').map(t => t.id)).toEqual(['t-1']);
    expect(filterTechnicians(ROSTER, 'emp104').map(t => t.id)).toEqual(['t-1']);
  });

  it('does not let a digits-free query match every code', () => {
    expect(filterTechnicians(ROSTER, 'emp')).toEqual([]);
  });

  it('does not cross-match: one technician\'s code digits never hit another\'s phone', () => {
    // 002 is Anita's code; no phone carries 002.
    expect(filterTechnicians(ROSTER, '002').map(t => t.id)).toEqual(['t-2']);
  });

  it('keeps technicians without a code searchable by name/phone', () => {
    expect(filterTechnicians(ROSTER, 'menon').map(t => t.id)).toEqual(['t-3']);
    expect(filterTechnicians(ROSTER, '9000000003').map(t => t.id)).toEqual(['t-3']);
  });
});

describe('null-name tolerance', () => {
  const nameless = make({ id: 't-x', name: null as unknown as string });

  it('sorts a technician with no name last without throwing', () => {
    const out = sortTechniciansByName([
      nameless,
      make({ id: 't-b', name: 'Bala' }),
      make({ id: 't-a', name: 'Asha' }),
    ]);
    expect(out.map(t => t.id)).toEqual(['t-a', 't-b', 't-x']);
  });

  it('filters without throwing and never matches the nameless row by name', () => {
    const roster = [nameless, make({ id: 't-a', name: 'Asha' })];
    expect(filterTechnicians(roster, 'asha').map(t => t.id)).toEqual(['t-a']);
  });
});
