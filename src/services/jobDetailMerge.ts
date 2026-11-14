/**
 * jobDetailMerge.ts — the one rule for merging a mutation/list-shape `ApiJob`
 * over an open `JobDetail`.
 *
 * Deliberately its own module with ONLY type imports (erased at runtime, so
 * zero module dependencies): screens that mock the whole services barrel in
 * tests can still pull the REAL helper in via `jest.requireActual` without
 * dragging the API client / MMKV chain into the suite.
 */
import type { ApiJob, JobDetail } from './resources/jobs';

/**
 * Merges a mutation/list-shape `ApiJob` over an existing `JobDetail` without
 * letting its thin `technician`/`customer` embeds clobber the detail's full
 * person profiles (skills/phones/addresses) — spreading a bare `ApiJob` over
 * the detail crashed `JobDetailScreen` on `technician.skills.length` (Crashlytics
 * 2026-11). The detail keeps its own embeds; the caller's refetch brings
 * fresh ones. Null detail in, null out — callers keep their loading guard.
 */
export function mergeJobIntoDetail(
  detail: JobDetail | null,
  job: ApiJob,
): JobDetail | null {
  if (!detail) return detail;
  // Rest-destructure strips the thin `{ id, name }` embeds — the same
  // omission idiom `apiJobOf` uses for the detail→row direction ('^_'
  // discards; rest siblings are ignored by the repo's unused-vars rule).
  // The detail-only keys are stripped too: a list-shape response never
  // carries `activityLog`/`attachments` (the latter hold 1-hour presigned
  // URLs, regenerated per GET), so if contract drift ever adds one, a stale
  // array must not survive the merge. The cast only widens the view for the
  // strip; runtime payloads are unchanged.
  const {
    technician: _thinTechnician,
    customer: _thinCustomer,
    activityLog: _staleActivityLog,
    attachments: _staleAttachments,
    ...jobFields
  } = job as ApiJob & Partial<JobDetail>;
  return { ...detail, ...jobFields };
}
