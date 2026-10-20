/**
 * roles — the ONE place the app decides what a role may do.
 *
 * The backend owns the rules (it refuses a viewer's write with 403); this
 * file only decides what the app SHOWS, so a person is never offered a button
 * that can only fail. Screens ask these helpers instead of comparing role
 * strings, so a future role is one change here.
 *
 * Wire names: `company_admin` (was owner), `employee` (was technician),
 * `viewer` (read-only). Fenzit staff are a flag (`platformAdmin`), not a
 * company role, and never reach the company screens.
 *
 * Pure functions only (no hooks, no store) so any module can import this
 * without a cycle; the hooks live in `useRole.ts`.
 */
import type { UserRole } from '../../services';

type RoleLike = UserRole | null | undefined;

/** Every company role the app knows — used to reject stale or unknown stored values. */
export const USER_ROLES: readonly UserRole[] = ['company_admin', 'employee', 'viewer'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Plain-English names for the role badge and profile header. */
export const ROLE_LABELS: Record<UserRole, string> = {
  company_admin: 'Admin',
  employee: 'Employee',
  viewer: 'Viewer',
};

/** Shown beside every control a viewer cannot use. */
export const VIEW_ONLY_REASON = 'View-only access';

/** The company admin: full control of the company. */
export function isAdminRole(role: RoleLike): boolean {
  return role === 'company_admin';
}

/** The field employee: own jobs and own attendance only. */
export function isEmployeeRole(role: RoleLike): boolean {
  return role === 'employee';
}

/** The read-only role. */
export function isViewerRole(role: RoleLike): boolean {
  return role === 'viewer';
}

/**
 * Roles that see the whole company (admin and viewer) rather than only their
 * own work — they share the company-wide screens.
 */
export function isCompanyWideRole(role: RoleLike): boolean {
  return role === 'company_admin' || role === 'viewer';
}

/** May create, edit, delete or approve anything. Today only the company admin. */
export function canWrite(role: RoleLike): boolean {
  return role === 'company_admin';
}
