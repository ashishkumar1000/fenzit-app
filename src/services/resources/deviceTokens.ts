/**
 * services/resources/deviceTokens.ts
 * ───────────────────────────────────
 * FCM device-token registration (Firebase spec CAP-1): the signed-in app
 * tells fenzit-be which FCM token belongs to its user so the server can
 * push that user's notifications. The wire (fenzit-be `DeviceTokensController`):
 *
 *   POST   /device-tokens        { token, platform, appVersion } → 204
 *   DELETE /device-tokens/:token → 204 (the bearer's own row)
 *
 * The JWT decides ownership — the client never sends a user id (the token
 * belongs to whoever signed in last; a shared phone naturally rebinds).
 *
 * Why `unregister` takes an EXPLICIT bearer: logout clears the stored token
 * (clearAuthToken) and the bearer interceptor reads the store per request —
 * clearing the token races queued/queued-behind requests. The caller
 * captures the bearer BEFORE clearing and passes it here, so the DELETE
 * authenticates with the exact session that registered the token. A register
 * call is an idempotent upsert on the token PK (React StrictMode
 * double-mounts effects in dev — the server tolerates duplicate uploads).
 *
 * Rejects with `ApiError` on failure (via apiClient's response interceptor);
 * callers treat every failure as log-only — push is additive.
 */
import { apiClient } from '../api/apiClient';

/** The platforms the backend's `platform` check accepts. */
export type DeviceTokenPlatform = 'android' | 'ios';

/** Body of `POST /device-tokens` — all fields required. */
export interface RegisterDeviceTokenBody {
  /** The FCM registration token (the upsert target / primary key). */
  token: string;
  /** Device platform — the FCM token is platform-bound. */
  platform: DeviceTokenPlatform;
  /** Installed app version (`installedAppVersion()`), for stale-token triage. */
  appVersion: string;
}

/**
 * `POST /device-tokens` — upsert the token for the signed-in user
 * (`last_seen_at = now()`). Idempotent: a duplicate is a server-side no-op.
 */
async function register(body: RegisterDeviceTokenBody): Promise<void> {
  await apiClient.post('/device-tokens', body);
}

/**
 * `DELETE /device-tokens/:token` — delete the caller's own token row.
 * `bearer` is the captured pre-logout session token (see the header note);
 * it is sent explicitly so clearing the stored token cannot strip the
 * request's Authorization header mid-logout.
 */
async function unregister(token: string, bearer: string): Promise<void> {
  await apiClient.delete(`/device-tokens/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
}

export const deviceTokenService = { register, unregister };
