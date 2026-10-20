/**
 * Auth feature — public surface.
 */
export { default as AuthFlow } from './AuthFlow';
export {
  useAuth,
  useSessionExpired,
  expireSession,
  clearSessionExpired,
  revokeCompanyAccess,
} from './useAuth';
export type { AuthStatus, Session } from './useAuth';
export type { AuthResult, AuthStep, BusinessProfile } from './types';
export { default as NoAccessScreen } from './screens/NoAccessScreen';
export { useLogOut } from './useLogOut';
export {
  ROLE_LABELS,
  VIEW_ONLY_REASON,
  canWrite,
  isAdminRole,
  isCompanyWideRole,
  isEmployeeRole,
  isUserRole,
  isViewerRole,
} from './roles';
export { hasCompanyAccess, useCanWrite, useSessionRole } from './useRole';
