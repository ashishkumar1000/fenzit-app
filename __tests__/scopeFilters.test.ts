/**
 * filterForScope — the shared scope→chip rule behind both the Jobs screen's
 * scope switcher and the `useJobs` store's `setScope`. The server silently
 * intersects a caller status filter with a scope's own forced statuses, so
 * an incompatible chip must never reach the wire. See `scopeFilters.ts`.
 */
import { filterForScope, HISTORY_FILTERS, TODAY_FILTERS } from '../src/features/jobs/scopeFilters';

describe('HISTORY_FILTERS', () => {
  it('is exactly the chips History offers', () => {
    // Epic 22 added Rejected: a rejected job stays in the creator's history
    // for good (CAP-7), so the bar isolates it.
    expect(HISTORY_FILTERS).toEqual(['all', 'completed', 'cancelled', 'rejected']);
  });
});

describe('TODAY_FILTERS', () => {
  it('is exactly the five day-scope chips — never Rejected (the day window excludes it, CAP-4)', () => {
    // The natural mirror of the History edit would add 'rejected' here —
    // where the chip's query is always empty, indistinguishable from a
    // genuinely empty scope. Both chip bars pass this array explicitly.
    expect(TODAY_FILTERS).toEqual([
      'all',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
    ]);
  });
});

describe('filterForScope', () => {
  it('Today keeps whatever chip is active', () => {
    expect(filterForScope('completed', 'today')).toBe('completed');
    expect(filterForScope('all', 'today')).toBe('all');
  });

  it('Today resets chips the day scope cannot show (pending_approval / rejected)', () => {
    expect(filterForScope('pending_approval', 'today')).toBe('all');
    expect(filterForScope('rejected', 'today')).toBe('all');
  });

  it('Upcoming and Overdue always reset to all (no chip row there)', () => {
    expect(filterForScope('completed', 'upcoming')).toBe('all');
    expect(filterForScope('in_progress', 'overdue')).toBe('all');
    expect(filterForScope('all', 'upcoming')).toBe('all');
  });

  it('History keeps a chip it can still show', () => {
    expect(filterForScope('completed', 'history')).toBe('completed');
    expect(filterForScope('cancelled', 'history')).toBe('cancelled');
    expect(filterForScope('all', 'history')).toBe('all');
    expect(filterForScope('rejected', 'history')).toBe('rejected');
  });

  it('History resets a chip its row hides (scheduled / in_progress)', () => {
    expect(filterForScope('scheduled', 'history')).toBe('all');
    expect(filterForScope('in_progress', 'history')).toBe('all');
  });
});
