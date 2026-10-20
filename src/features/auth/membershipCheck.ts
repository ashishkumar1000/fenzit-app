import { apiClient } from '../../services/api/apiClient';
import { getSession } from './useAuth';
import type { Session } from './useAuth';

/** The fields this check reads from `GET /users/me/access`. */
interface MembershipSnapshot {
  tenant: unknown;
  platformAdmin: boolean;
}

/** The check running now, and the session it was started for. */
let inFlight: { session: Session; done: Promise<void> } | null = null;

/**
 * Runs after a company call returns 403. A 403 can mean "your role may not
 * do this" (leave the person alone) or "you are no longer in the company"
 * (send them to the no-access screen). Only the second needs action, so
 * re-read the profile and look at `tenant`, which is null once the company
 * membership is removed. A burst of 403s for the same person causes one
 * profile call.
 *
 * Race rule: the answer applies only to the session that was signed in when
 * the 403 arrived. If that person signed out, or someone else signed in,
 * while the call was running, the answer is dropped, so one person's
 * removal never clears another person's session.
 */
export function checkMembershipAfterForbidden(
  onRemoved: () => void,
): Promise<void> {
  const started = getSession();
  if (!started) return Promise.resolve();
  if (inFlight && inFlight.session === started) return inFlight.done;

  const done: Promise<void> = runCheck(started, onRemoved).finally(() => {
    if (inFlight?.done === done) inFlight = null;
  });
  inFlight = { session: started, done };
  return done;
}

async function runCheck(started: Session, onRemoved: () => void): Promise<void> {
  try {
    const { data } = await apiClient.get<MembershipSnapshot>('/users/me/access');
    // Fenzit staff have no company by design (`tenant` is null for them), so
    // a null company does not mean they were removed.
    const removed = data.tenant === null && !data.platformAdmin;
    if (removed && getSession() === started) onRemoved();
  } catch {
    // Offline or a server fault: keep the session. The next call decides.
  }
}
