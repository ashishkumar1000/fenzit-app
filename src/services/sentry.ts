/**
 * services/sentry.ts
 * ──────────────────
 * Sentry crash reporting for JavaScript errors, running alongside Firebase
 * Crashlytics (see services/telemetry.ts). Imported first in index.js so it
 * starts before the rest of the app loads and can catch startup errors.
 *
 * Privacy settings (this app holds employee photos, locations and attendance):
 * - no default PII (IP address, cookies, user details)
 * - no session replay, no screenshots, no view-hierarchy capture
 * - no app logs and no performance traces
 * - console, touch and ui.click breadcrumbs dropped; query strings removed from the
 *   URL on breadcrumbs only; error text is redacted for emails and phone numbers
 * - disabled in development, so dev crashes never reach the production project
 */
import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../config';

/** Breadcrumb categories that can carry typed text or on-screen labels. */
const DROPPED_BREADCRUMB_CATEGORIES = new Set(['console', 'touch', 'ui.click']);

/** Emails and phone-like digit runs, which can appear in error text. */
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /\+?\d[\d\s-]{7,}\d/g;

function redact(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
}

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !__DEV__,
  sendDefaultPii: false,
  enableLogs: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  attachScreenshot: false,
  attachViewHierarchy: false,
  beforeSend(event) {
    if (event.message) {
      event.message = redact(event.message);
    }
    for (const exception of event.exception?.values ?? []) {
      if (exception.value) {
        exception.value = redact(exception.value);
      }
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (DROPPED_BREADCRUMB_CATEGORIES.has(breadcrumb.category ?? '')) {
      return null;
    }
    const url = breadcrumb.data?.url;
    if (typeof url === 'string') {
      breadcrumb.data = { ...breadcrumb.data, url: url.split(/[?#]/)[0] };
    }
    return breadcrumb;
  },
});
