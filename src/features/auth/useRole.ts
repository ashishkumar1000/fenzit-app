/**
 * Role hooks — thin readers over the shared session. The decisions
 * themselves live in `roles.ts`.
 */
import { useAuth } from './useAuth';
import type { Session } from './useAuth';
import { canWrite, isUserRole } from './roles';
import type { UserRole } from '../../services';

/**
 * Whether this session belongs inside a company at all. False for a person
 * with no company, a removed person and Fenzit staff — they see the
 * "no access" screen instead of any company data.
 */
export function hasCompanyAccess(session: Session | null): boolean {
  return Boolean(
    session &&
      !session.platformAdmin &&
      session.tenantId !== null &&
      isUserRole(session.role),
  );
}

/** Screens call this to decide whether to show write controls (live from the session). */
export function useCanWrite(): boolean {
  const { session } = useAuth();
  return canWrite(session?.role);
}

/** The signed-in company role, or `null` (no session, or no company). */
export function useSessionRole(): UserRole | null {
  const { session } = useAuth();
  return session && isUserRole(session.role) ? session.role : null;
}
