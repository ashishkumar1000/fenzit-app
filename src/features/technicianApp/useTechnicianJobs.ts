/**
 * useTechnicianJobs — the technician side's source of truth for their TODAY
 * jobs, from `GET /jobs` (the server scopes technician-role calls to the
 * caller: the `technicianId` param is silently ignored, so never send it).
 *
 * Same API-backed shared-store pattern as `useJobs`: one module-level state
 * object, any number of subscribers via `useSyncExternalStore`, one query —
 * Today (the default day window, cursor-paginated by the server).
 *
 * Epic 22 — the former History tab is now the Jobs tab and rides the SHARED
 * `useJobs` store (features/jobs) with the owner's screen components, so the
 * two roles' job lists can never drift. This store is Today-only.
 *
 * Not MMKV-persisted: same reasoning as `useJobs`, the list is server truth.
 *
 * The screen owns the fetch schedule (the tab's `useFocusEffect` calls
 * `loadToday`); this module only holds state and the loader.
 *
 * The Epic 4 seam lives in `setHydrators`. The hydration path returns
 * `Promise<Paginated<ApiJob>>`; the offline sync store will fake the envelope
 * so screens never change. (The shared `useJobs` store calls `jobService`
 * directly — when Epic 4 lands it defines the offline path for both stores.)
 * Screens import the hook only — never `jobService`.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { jobService } from '../../services';
import { registerReset } from '../../services/resetRegistry';
import type { ApiError, ApiJob, JobDetail, Paginated } from '../../services';
import { FOCUS_REFRESH_TTL_MS } from '../../constants';

export interface TechnicianJobsState {
  today: ApiJob[];
  /** True while the first Today load is in flight (nothing to show yet). */
  isLoadingToday: boolean;
  errorToday: string | null;
  /** False until a load has completed, so "empty" can't be confused with "not fetched". */
  hasLoadedToday: boolean;
  /** Last SUCCESSFUL Today load — the focus throttle window. */
  lastLoadedAtToday: number | null;
}

const INITIAL: TechnicianJobsState = {
  today: [],
  isLoadingToday: true,
  errorToday: null,
  hasLoadedToday: false,
  lastLoadedAtToday: null,
};

// --- Shared store: one query, any number of subscribers ----------------------
const subscribers = new Set<() => void>();
let state: TechnicianJobsState = INITIAL;

function setState(next: Partial<TechnicianJobsState>) {
  state = { ...state, ...next };
  subscribers.forEach(notify => notify());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  // Same reference until something actually changes — required by
  // useSyncExternalStore to avoid an infinite re-render loop.
  return state;
}

/**
 * Bumped by `clearTechnicianJobs`. Any response that lands after a bump is
 * stale — it must not commit rows into the just-reset store (e.g. a late GET
 * arriving after logout).
 */
let resetGen = 0;

/**
 * Bumped by every optimistic row write (`upsertTechnicianJob`). A load that
 * started before a mutation must not commit over it — its response carries
 * the pre-mutation server page and would silently revert the optimistic row
 * until the next refetch.
 */
let dataGen = 0;

// --- Epic 4 hydration seam ----------------------------------------------------
/**
 * The hydrator returns the same envelope so Epic 4 can re-point it at the
 * sync store (faking `Paginated`) without touching screens. Today
 * deliberately sends no params — the server's default scope IS the day
 * window.
 */
type Hydrator = (cursor?: string) => Promise<Paginated<ApiJob>>;

let hydrateToday: Hydrator = () => jobService.list({});

/** Swaps the hydration path. Epic 4 only — nothing else should call this. */
export function setHydrators(today: Hydrator): void {
  hydrateToday = today;
}

/**
 * Throttle check. The `elapsed >= 0` guard keeps a device clock
 * stepped backwards (NTP/DST/manual correction) from reading as "fresh" and
 * silently blocking refetches — same guard `useCustomers` keeps.
 */
function isThrottled(lastLoadedAt: number | null): boolean {
  if (!lastLoadedAt) return false;
  const elapsed = Date.now() - lastLoadedAt;
  return elapsed >= 0 && elapsed < FOCUS_REFRESH_TTL_MS;
}

// --- Today -------------------------------------------------------------------
let todayInFlight: Promise<void> | null = null;

/**
 * Loads Today's window. Throttled: skipped within `FOCUS_REFRESH_TTL_MS` of a
 * success unless `opts.force` (pull-to-refresh / retry). A forced refresh
 * queues behind the request already running rather than joining it — joining
 * would resolve with pre-refresh rows and stamp a fresh throttle window over
 * stale data. A failed load keeps prior rows on screen.
 */
export function loadToday(opts: { force?: boolean } = {}): Promise<void> {
  if (todayInFlight) {
    return todayInFlight.then(() => loadToday(opts));
  }
  if (!opts.force && isThrottled(state.lastLoadedAtToday) && state.hasLoadedToday) {
    return Promise.resolve();
  }
  // Clearing `errorToday` here makes every attempt transition the error
  // through null, so a repeat failure re-shows a dismissed banner.
  setState({ isLoadingToday: !state.hasLoadedToday, errorToday: null });
  const gen = resetGen;
  const dataGenAtStart = dataGen;
  todayInFlight = hydrateToday()
    .then(page => {
      // Store cleared (resetGen) or a local mutation landed while we were
      // away (dataGen): the response predates the store's current truth.
      if (gen !== resetGen || dataGen !== dataGenAtStart) return;
      setState({
        today: page.data,
        hasLoadedToday: true,
        isLoadingToday: false,
        errorToday: null,
        lastLoadedAtToday: Date.now(),
      });
    })
    .catch((error: ApiError) => {
      if (gen !== resetGen) return;
      console.warn('[useTechnicianJobs] GET /jobs (today) failed →', error);
      setState({ isLoadingToday: false, errorToday: error.message });
    })
    .finally(() => {
      todayInFlight = null;
    });
  return todayInFlight;
}

// --- Row updates -----------------------------------------------------------------
/**
 * The list-store row for a freshly fetched job detail — the ApiJob fields
 * ONLY. The detail's embedded technician/customer profiles, activity log and
 * attachments (whose presigned URLs are 1-hour and must never be persisted)
 * are stripped before anything lands in the shared store. Lives here because
 * every store writer needs the exact same strip — a missed field would leak
 * a 1-hour URL into whatever screen persists the row.
 */
export function apiJobOf(detail: JobDetail): ApiJob {
  const {
    technician: _technician,
    customer: _customer,
    activityLog: _activityLog,
    attachments: _attachments,
    ...row
  } = detail;
  return row;
}

/**
 * Replaces one row in Today — for a caller that just mutated the job and
 * already holds the full row (Epic 3's workflow actions). Deliberately does
 * NOT move a row between windows: a job that just completed stays in `today`
 * until the next load picks it up server-side — hand-rebalancing would guess
 * at server sort order. The Jobs tab's rows live in the shared `useJobs`
 * store; its `upsertJob` handles the today-scope prepend there.
 *
 * Named `…TechnicianJob` (not `upsertJob`, like the owner store exports) so
 * a barrel-style import can never silently grab the owner-side prepend
 * semantics instead of this replace-in-place one.
 *
 * Also bumps `dataGen`: any load still in flight started before this
 * mutation, so its response is pre-mutation and must not commit over the
 * optimistic row.
 */
export function upsertTechnicianJob(job: ApiJob): void {
  const inToday = state.today.some(j => j.id === job.id);
  if (!inToday) return;
  dataGen += 1;
  setState({ today: state.today.map(j => (j.id === job.id ? job : j)) });
}

/** Reset to the pre-login state. Call on technician logout. */
export function clearTechnicianJobs(): void {
  resetGen += 1; // an in-flight response is now stale — it must not commit
  setState(INITIAL);
}

// Join the global 401 reset flow (story 5.3) — see services/resetRegistry.ts.
registerReset(clearTechnicianJobs);

export function useTechnicianJobs() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  /** Re-fetch page 1 — for pull-to-refresh and the error view's retry. */
  const refreshToday = useCallback(() => loadToday({ force: true }), []);

  return {
    ...snapshot,
    loadToday,
    refreshToday,
  };
}