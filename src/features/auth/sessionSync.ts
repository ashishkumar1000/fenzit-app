/**
 * Re-reads the signed-in person's company access from `GET /users/me` and
 * brings the stored session in line with it.
 *
 * Why: the session (role, tenant) is saved on login and never re-read, so a
 * person whose access changed while the app was closed or in the background
 * stayed on the old screen until they logged out. The server is the source
 * of truth, so the app asks it on launch and on every return to the
 * foreground. A 403 mid-session is still handled by `membershipCheck.ts`.
 *
 * A failed call (offline, server fault) keeps the stored session: the next
 * launch or foreground event tries again.
 *
 * Race rule: each sync is tied to the session object it started from. If the
 * person signs out, or signs in as someone else, while the call is in flight,
 * the answer is dropped, so one person's access is never written onto
 * another person's session.
 */
import { usersApi } from '../../services';
import { runAllResets } from '../../services';
import { getSession, updateSessionIfChanged } from './useAuth';
import type { Session } from './useAuth';
import { isUserRole } from './roles';

/** The sync already running, and the session it was started for. */
let inFlight: { session: Session; done: Promise<void> } | null = null;

export function syncSessionFromServer(): Promise<void> {
  const started = getSession();
  if (!started) return Promise.resolve();
  // Same person, call already running: share it. A different session (a new
  // sign-in) gets its own request, so it is never skipped.
  if (inFlight && inFlight.session === started) return inFlight.done;

  const done: Promise<void> = runSync(started).finally(() => {
    if (inFlight?.done === done) inFlight = null;
  });
  inFlight = { session: started, done };
  return done;
}

async function runSync(started: Session): Promise<void> {
  try {
    const access = await usersApi.getAccess();
    // The session changed while the call was running (signed out, signed in
    // as someone else, or access revoked by a 403 check). This answer belongs
    // to the old session, so drop it. If someone is still signed in, check
    // again for the current session: nothing else would, until the next
    // foreground event.
    if (getSession() !== started) {
      return getSession() ? syncSessionFromServer() : undefined;
    }

    // `tenant` is null once the company membership is gone (removed, or
    // never set up). The no-access screen covers that case.
    const tenant = access.tenant;
    const next: Session = {
      role: tenant && isUserRole(access.role) ? access.role : null,
      tenantId: tenant ? tenant.id : null,
      platformAdmin: access.platformAdmin ?? false,
    };
    // A different company, or a different role inside the same company: drop
    // the cached company data before the new screens mount. The same company
    // data can hold rows the new role must not see.
    if (started.tenantId !== next.tenantId || started.role !== next.role) {
      runAllResets();
    }
    updateSessionIfChanged(next);
  } catch {
    // Keep the stored session; the next launch or foreground event retries.
  }
}
