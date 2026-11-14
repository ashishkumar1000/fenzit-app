/**
 * services/index.ts — barrel export for the shared services layer.
 *
 * Folder map:
 *   storage.ts    → raw MMKV instance (key/value persistence)
 *   authToken.ts  → session token get/set/clear, built on storage.ts
 *   api/          → the REST infrastructure (apiClient, ApiError, ApiService)
 *                   — see api/ApiService.ts for the generic CRUD class
 *   resources/    → one file per backend resource (technicianService, etc.)
 *                   — all API calls for the whole app live here, in one
 *                   place, regardless of which feature uses them. See
 *                   resources/technicians.ts for the template to copy.
 *   jobDetailMerge.ts → the pure rule for merging a mutation/list-shape
 *                   `ApiJob` over an open `JobDetail` (not a resource; a
 *                   shared contract helper, type-import-only so test suites
 *                   can requireActual it without the API client chain).
 *
 * Import from this barrel (`@services` / `'../../services'`), not from the
 * individual files — it keeps call sites stable if files move around inside
 * this folder later.
 */
export {
  apiClient,
  setOnForbidden,
  setOnSubscriptionExpired,
  setOnUnauthorized,
} from './api/apiClient';
export type { ApiError } from './api/apiClient';
export { ApiService, createCancelSignal } from './api/ApiService';
export type { ListParams } from './api/ApiService';
export type { Paginated } from './api/pagination';
export { getAuthToken, setAuthToken, clearAuthToken } from './authToken';
export { getRealtimeToken, clearRealtimeToken } from './realtimeToken';
export {
  supabaseRealtime,
  getUserChannel,
  teardownChannel,
  userNotificationsTopic,
} from './supabaseRealtime';
export { storage } from './storage';
export {
  compareVersions,
  getForceUpdateRule,
  getRemoteConfig,
  onRemoteConfigChange,
  refreshRemoteConfig,
} from './remoteConfig';
export type { ForceUpdatePlatform, ForceUpdateRule, RemoteConfigValues } from './remoteConfig';
export { clientMetadataHeaders } from './clientMetadata';
export { currentResetEpoch, registerReset, runAllResets } from './resetRegistry';
export {
  emitAttendanceAccessRefresh,
  isAttendanceEventType,
  isAttendanceReachable,
  registerAttendanceAccessRefresh,
  resetAttendanceAccessEvents,
  setAttendanceReachable,
} from './attendanceAccessEvents';
export * from './resources';
export { mergeJobIntoDetail } from './jobDetailMerge';

