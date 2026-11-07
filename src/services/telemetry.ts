/**
 * services/telemetry.ts
 * ─────────────────────
 * The single choke point for Firebase Analytics + Crashlytics (CAP-4/5).
 * Everything the app logs goes through these never-throwing wrappers, so a
 * telemetry failure can never surface as a user-facing error and no call
 * site imports the Firebase SDKs directly.
 *
 * Catalog (v1, per the spec's resolved open question): `app_open`, `login`,
 * `job_created`, `job_step_completed` {step}, `notification_tap`
 * {source, type}. Analytics limits respected here: param values are
 * strings/numbers only (objects/arrays are dropped), names ≤ 40 chars,
 * string values truncated to 100 chars.
 *
 * Crashlytics breadcrumbs: `log` for the same catalog events (release traces
 * stay minified — breadcrumbs are the hand-decodable context). JS uncaught
 * errors reach Crashlytics via the SDK's auto-installed global handler
 * (exception-handler chaining is disabled in firebase.json per the plan —
 * never re-chain it here).
 */
import { getApp } from '@react-native-firebase/app';
import {
  getAnalytics,
  logEvent as fbLogEvent,
  setUserProperty,
} from '@react-native-firebase/analytics';
import {
  getCrashlytics,
  log as crumb,
  recordError,
  setAttribute,
} from '@react-native-firebase/crashlytics';

/** Analytics param values — the subset Firebase accepts and we send. */
type TelemetryParamValue = string | number | boolean;

/** Analytics hard limits (support.google.com/analytics/answer/9267744). */
const MAX_EVENT_NAME_LENGTH = 40;
const MAX_PARAM_VALUE_LENGTH = 100;

/**
 * Sanitizes params to what Firebase silently accepts — it drops malformed
 * params WITHOUT an error, so bad values would vanish invisibly; we filter
 * them here instead and keep the good ones.
 */
function sanitizeParams(
  params: Record<string, TelemetryParamValue> | undefined,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === 'string' && value.length > 0) {
      clean[key] = value.slice(0, MAX_PARAM_VALUE_LENGTH);
    } else if (typeof value === 'boolean') {
      clean[key] = value ? 'true' : 'false';
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** Warn-and-drop: every wrapper funnels failures here, never to the caller. */
function warn(what: string, err: unknown): void {
  console.warn(`[telemetry] ${what} failed:`, err);
}

/**
 * Runs one SDK call, swallowing BOTH throw paths: the synchronous one
 * (native module missing at import/call time) and the async one (some
 * modular fns are typed `void`, some `Promise` — a returned promise is
 * caught, a sync fn returns nothing). This is what makes every wrapper
 * below never-throwing without caring about each fn's exact type.
 */
function guard(what: string, run: () => unknown): void {
  try {
    const result = run();
    if (
      result !== null &&
      typeof result === 'object' &&
      typeof (result as Promise<unknown>).catch === 'function'
    ) {
      (result as Promise<unknown>).catch((err: unknown) => warn(what, err));
    }
  } catch (err) {
    warn(what, err);
  }
}

/**
 * Logs one catalog event to Analytics (plus a matching Crashlytics
 * breadcrumb). Never throws — a telemetry failure is log-only by design.
 */
export function logEvent(
  name: string,
  params?: Record<string, TelemetryParamValue>,
): void {
  const eventName = name.slice(0, MAX_EVENT_NAME_LENGTH);
  const clean = sanitizeParams(params);
  guard(`logEvent(${eventName})`, () =>
    fbLogEvent(getAnalytics(getApp()), eventName, clean),
  );
  guard(`breadcrumb(${eventName})`, () =>
    crumb(getCrashlytics(), clean ? `${eventName} ${JSON.stringify(clean)}` : eventName),
  );
}

/**
 * Stamps the signed-in ROLE on Analytics (user property) and Crashlytics
 * (attribute). No user id is sent to either: a role is enough to read a
 * report, and it keeps the data-safety declarations to device/diagnostic IDs.
 * A `null` role clears it (logout). Never throws.
 */
export function setTelemetryRole(role: string | null): void {
  guard('analytics role', () => {
    void setUserProperty(getAnalytics(getApp()), 'role', role ?? 'unknown');
  });
  guard('crashlytics role', () => {
    void setAttribute(getCrashlytics(), 'role', role ?? 'unknown');
  });
}

/**
 * Clears the telemetry role (logout / forced 401). Never throws.
 */
export function clearTelemetryRole(): void {
  setTelemetryRole(null);
}

/**
 * Reports a JS error that React caught (the error boundary's path). Uncaught
 * JS errors are reported by Crashlytics' own handler. Never throws.
 */
export function recordCrash(error: Error): void {
  guard('crashlytics error', () => {
    recordError(getCrashlytics(), error);
  });
}
