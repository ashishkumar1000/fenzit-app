/**
 * The one search rule for the Team screen and the New Job picker. Same person,
 * same answer, whichever list the owner is using.
 */
import { filterTechnicians, matchesTechnicianQuery } from './format';

const PERSON = { name: 'Ravi Kumar', phoneNumber: '9876543210', employeeCode: 'EMP-104' };
const other = { name: 'Asha', phoneNumber: '9000000001', employeeCode: 'EMP-007' };

describe('matchesTechnicianQuery', () => {
  it('an empty or spaces-only query matches everyone', () => {
    expect(matchesTechnicianQuery(PERSON, '')).toBe(true);
    expect(matchesTechnicianQuery(PERSON, '   ')).toBe(true);
  });

  it('matches the name, ignoring case', () => {
    expect(matchesTechnicianQuery(PERSON, 'ravi')).toBe(true);
    expect(matchesTechnicianQuery(PERSON, 'RAVI KU')).toBe(true);
  });

  it('matches a phone typed with spaces or a dash, against the stored digits', () => {
    expect(matchesTechnicianQuery(PERSON, '98765 43210')).toBe(true);
    expect(matchesTechnicianQuery(PERSON, '9876-543')).toBe(true);
  });

  it('matches every spelling of the employee code', () => {
    expect(matchesTechnicianQuery(PERSON, '104')).toBe(true);
    expect(matchesTechnicianQuery(PERSON, 'EMP-104')).toBe(true);
    expect(matchesTechnicianQuery(PERSON, 'emp104')).toBe(true);
  });

  it('a query with no digits never matches on the code or phone (so "emp" does not match everyone)', () => {
    expect(matchesTechnicianQuery(PERSON, 'emp')).toBe(false);
  });

  it('a missing name or code does not throw', () => {
    expect(matchesTechnicianQuery({ name: null, phoneNumber: '9876543210', employeeCode: null }, '9876')).toBe(true);
    expect(matchesTechnicianQuery({ name: null, phoneNumber: '9876543210', employeeCode: null }, 'ravi')).toBe(false);
  });
});

describe('filterTechnicians uses the same rule', () => {
  it('returns the same people as matchesTechnicianQuery for the same query', () => {
    const roster = [
      { ...PERSON, id: '1', countryCode: '+91', status: 'active', skillIds: [] },
      { ...other, id: '2', countryCode: '+91', status: 'active', skillIds: [] },
    ] as never[];
    for (const q of ['98765 43210', 'asha', 'EMP-007', 'emp']) {
      const viaFilter = filterTechnicians(roster, q).map(t => t.id);
      const viaRule = roster
        .filter(t => matchesTechnicianQuery(t as never, q))
        .map(t => (t as { id: string }).id);
      expect(viaFilter).toEqual(viaRule);
    }
  });
});
