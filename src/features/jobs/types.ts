/**
 * Jobs feature types. The display shape is gone — cards render `ApiJob`
 * directly through the formatter layer in `format.ts`.
 */
export type { ApiJob } from '../../services';

/**
 * Filter chip values, using the API's status enum directly so the store can
 * put them straight on the wire. `all` sends no status param.
 */
export type JobFilter =
  | 'all'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  /**
   * Epic 22 — the employee Jobs tab's Pending segment (scope `all` + this
   * status). Never shown as a chip on the owner screen; `filterForScope`
   * resets it on any scope change so it can't leak into a day window.
   */
  | 'pending_approval'
  /**
   * Epic 22 — the History bar's Rejected chip (the server's history scope
   * includes rejected rows for their creator, CAP-7). Never a Today chip:
   * the day scope excludes rejected, so `filterForScope` resets it like
   * `pending_approval`.
   */
  | 'rejected';

/**
 * The Jobs tab's timeline bucket — re-exported from the services layer, where
 * the wire contract (`GET /jobs?scope=…`) defines it.
 */
export type { JobScope } from '../../services';
