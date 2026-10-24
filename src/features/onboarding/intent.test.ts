/**
 * mismatchNotice — the intent-vs-role correction (login redesign). The
 * picker is an INTENT; the phone number decides the real role. The tests
 * pin all four outcomes: the employee-side correction line, and null for
 * a matching or absent intent — and for the owner-side mismatch, which
 * routes silently by product decision (no "runs a company" line).
 */
import { mismatchNotice } from './intent';

describe('mismatchNotice', () => {
  it('owner intent + an employee number → the employee correction', () => {
    expect(mismatchNotice('owner', 'employee')).toBe(
      'This number is registered as a field employee \u2014 here\u2019s the employee app.',
    );
  });

  it('staff intent + an owner number routes silently (no line)', () => {
    expect(mismatchNotice('staff', 'company_admin')).toBeNull();
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
