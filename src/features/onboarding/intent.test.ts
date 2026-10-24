/**
 * mismatchNotice — the intent-vs-role correction (login redesign). The
 * picker is an INTENT; the phone number decides the real role. The tests
 * pin all four outcomes: two correction lines, and null for a matching or
 * absent intent — a wrong line here would address the wrong person.
 */
import { mismatchNotice } from './intent';

describe('mismatchNotice', () => {
  it('owner intent + an employee number → the employee correction', () => {
    expect(mismatchNotice('owner', 'employee')).toBe(
      'This number is registered as a field employee \u2014 here\u2019s the employee app.',
    );
  });

  it('staff intent + an owner number → the owner correction', () => {
    expect(mismatchNotice('staff', 'company_admin')).toBe(
      'This number runs a company on Fenzit \u2014 here\u2019s the owner app.',
    );
  });

  it('a matching intent says nothing', () => {
    expect(mismatchNotice('staff', 'employee')).toBeNull();
    expect(mismatchNotice('owner', 'company_admin')).toBeNull();
  });

  it('no intent (skipped picker) says nothing', () => {
    expect(mismatchNotice(null, 'employee')).toBeNull();
    expect(mismatchNotice(null, 'company_admin')).toBeNull();
  });
});
