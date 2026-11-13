/**
 * The scope→chip rule shared by the Jobs screen and the `useJobs` store, so
 * both sides can never drift: the server silently INTERSECTS a caller status
 * filter with a scope's own forced statuses (fenzit-be `jobs.service.ts` —
 * "the FE never sends such combinations"), so an incompatible chip leaking
 * into a scope change must not reach the wire — it would return an empty
 * list, indistinguishable from a genuinely empty scope.
 *
 * Which chip a scope change keeps. Upcoming/Overdue hide the chip row and
 * the server fixes status there, so those scopes always reset to `all`
 * (no status param); History keeps a filter it can still show, otherwise
 * `all`; Today keeps whatever chip is active. Note the round trip: a
 * Today→Upcoming→Today walk loses the chip (Upcoming forces `all`) —
 * accepted, since Upcoming shows no chip row to re-select it.
 */
import type { JobFilter, JobScope } from './types';

/**
 * The chips Today can still show — the five day-scope statuses. Passed
 * explicitly (Epic 22) so the bar's `rejected` chip never appears under a
 * scope that excludes rejected rows: a chip that can only ever return an
 * empty list is indistinguishable from a genuinely empty scope.
 */
export const TODAY_FILTERS: JobFilter[] = [
  'all',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
];

/** The chips History can still show (its server statuses, plus `all`). */
export const HISTORY_FILTERS: JobFilter[] = [
  'all',
  'completed',
  'cancelled',
  // Epic 22 — a rejected job stays in the creator's history for good
  // (CAP-7), so the bar can isolate it.
  'rejected',
];

/** The chip to load when switching to `next`, given the chip on screen. */
export function filterForScope(current: JobFilter, next: JobScope): JobFilter {
  // Epic 22 — `pending_approval` is never a valid chip under a day window
  // (the server excludes pending from every scope but `all`), so a walk
  // through the Pending segment must not carry it into Today. `rejected`
  // is the same: today excludes it (CAP-4).
  if (next === 'today') {
    return current === 'pending_approval' || current === 'rejected'
      ? 'all'
      : current;
  }
  if (next === 'history' && HISTORY_FILTERS.includes(current)) return current;
  return 'all';
}