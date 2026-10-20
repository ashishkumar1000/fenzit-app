/**
 * RealtimeBridge — the mount point for the Realtime wiring (Story 3.3,
 * generalized to both roles in Story 14-3).
 *
 * Why a bridge exists: App.tsx's role gate is a conditional render chain,
 * not an early return, so hooks cannot be called at `App()` top level.
 * This component renders in BOTH role branches of App.tsx and internally:
 *   1. re-checks the session (defense in depth — even if mounted elsewhere
 *      by accident, a bootstrap-null or unknown session runs zero Realtime
 *      code: no listener, no subscription, no token exchange; the allowlist
 *      direction means only a signed-in owner/technician enables the hook),
 *   2. runs `useRealtimeNotifications` (AppState-gated socket + role-aware
 *      force-refetch — one hook, no duplicated bridge code per role),
 *   3. renders `StatusBanner` when an owner job-status banner is live,
 *      null otherwise. Technicians get no banner: no job-status events are
 *      ever emitted to them (epic non-goal), and the hook only raises one
 *      on the owner branch.
 */
import { useAuth } from '../auth/useAuth';
import { isCompanyWideRole } from '../auth/roles';
import { hasCompanyAccess } from '../auth/useRole';
import { useRealtimeNotifications } from './useRealtimeNotifications';
import { StatusBanner } from '../../components/StatusBanner';

export function RealtimeBridge() {
  const { session } = useAuth();
  // Allowlist, not denylist: bootstrap (session null) and any future role
  // suspend the hook by default — only a session inside a company (not a
  // removed person or Fenzit staff) enables it.
  const isEnabled = hasCompanyAccess(session);

  const { banner } = useRealtimeNotifications({ enabled: isEnabled });

  // Job-status banners are for the company-wide roles (admin, viewer).
  if (!isEnabled || !isCompanyWideRole(session?.role) || !banner) return null;

  return <StatusBanner banner={banner} />;
}
