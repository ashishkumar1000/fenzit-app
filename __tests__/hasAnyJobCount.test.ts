/**
 * hasAnyJobCount — the pure helper behind Home's setup-complete gate. The
 * five `/users/me` buckets are mutually exclusive, so any single nonzero
 * bucket must flip the flag (the all-time completed/cancelled totals are the
 * only signal an account with no *active* jobs has been used at all).
 */
import { hasAnyJobCount } from '../src/features/home';
import type { JobCounts } from '../src/services';

const zero: JobCounts = {
  today: 0,
  upcoming: 0,
  overdue: 0,
  completed: 0,
  cancelled: 0,
};

it.each(['today', 'upcoming', 'overdue', 'completed', 'cancelled'] as const)(
  'is true when only the %s bucket is nonzero',
  bucket => {
    expect(hasAnyJobCount({ ...zero, [bucket]: 2 })).toBe(true);
  },
);

it('is true when only the pending bucket is nonzero (Epic 22 — a tenant whose only jobs await approval is not a first-run account)', () => {
  expect(hasAnyJobCount({ ...zero, pending: 1 })).toBe(true);
});

it('is false when every bucket is zero (fresh account)', () => {
  expect(hasAnyJobCount(zero)).toBe(false);
});

it('is false when every bucket is zero and the backend predates the pending field (additive-safe)', () => {
  // An older backend omits `pending` entirely — the helper must not crash
  // or misread an absent key as a nonzero count.
  expect(hasAnyJobCount(zero as JobCounts)).toBe(false);
});
