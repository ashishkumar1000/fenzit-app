/**
 * App configuration and environment setup.
 *
 * Kept as plain constants (no env-file library) since we only need a
 * dev/prod switch today. If per-environment builds (staging, multiple
 * API keys, etc.) become necessary, swap this for `react-native-config`
 * without touching any call site — everything imports from here.
 */

/**
 * API server coordinates, split into origin and versioned path prefix.
 *
 * The path prefix matches `setGlobalPrefix('api/v1')` in fenzit-be's
 * main.ts; the Cloudflare worker fronting api.fenzit.com
 * (`fenzit-api-proxy`) forwards `/api/v1/*` transparently to Render with the
 * path unchanged.
 *
 * `API_BASE_URL` is what apiClient and the resource services consume. The
 * pieces are kept separate so other consumers (e.g. a websocket or a
 * media/asset URL builder) can reuse the origin without re-hardcoding it.
 */
export const API_HOST = 'https://api.fenzit.com';
export const API_VERSION_PREFIX = '/api/v1';
export const API_BASE_URL = `${API_HOST}${API_VERSION_PREFIX}`;

/**
 * Default request timeout, in milliseconds.
 *
 * 30s: the heaviest reads (attendance Today/Monthly on the Oregon↔Mumbai
 * path) run 6–9s server-side, and a Render free-tier cold start can add
 * ~50s ahead of them — 15s turned those into spurious error cards. This is
 * a guard against hung connections, not a performance number; shrink it
 * once the backend stops paying the cross-region round-trip tax.
 */
export const API_TIMEOUT = 30000;

/**
 * Supabase project coordinates (Story 3.3 — Realtime as a refetch hint).
 *
 * The publishable key is public by design (same class as API_BASE_URL) —
 * it scopes the client to the project; authorization happens server-side
 * via RLS. The service_role key never leaves fenzit-be — do not add it here.
 * Used only by `src/services/supabaseRealtime.ts` for the Realtime socket;
 * all REST traffic keeps going through `API_BASE_URL` / apiClient.
 */
export const SUPABASE_URL = 'https://pnlvreaijzslfymlnoti.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PysMKIKlQIul6KyAh8-58w_ArsfVh3L';

/**
 * Sentry project DSN. A DSN is public by design (it can only send events,
 * not read them). Empty disables Sentry entirely.
 */
export const SENTRY_DSN =
  'https://8fd5c8dc4bae0432114a6efcd9e26e1c@o4512395948916736.ingest.de.sentry.io/4512395959992400';

/**
 * Public pages on the marketing site (fenzit.com). The privacy-policy link
 * is a Google Play requirement inside the app (User Data policy): the policy
 * must be reachable in-app. Owned by fenzit-web — these must match its
 * routes. (Account deletion does not open the web page; the in-app flow
 * files the request itself.)
 */
export const PRIVACY_POLICY_URL = 'https://fenzit.com/privacy-policy';
export const TERMS_URL = 'https://fenzit.com/terms';

