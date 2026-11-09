/**
 * Pure helpers for the subscription roadblock: the expiry test and the IST
 * date line. No hooks, no Intl: Hermes' Intl support varies, so IST is
 * computed by hand (UTC + 5h30m, then the UTC getters).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Expired when a date is set and `nowMs` has reached it (no grace, the
 * boundary instant counts as expired). No date, or a date that cannot be
 * read, is never expired: the roadblock must fail safe.
 */
export function isSubscriptionExpired(validUntil: string | null | undefined, nowMs: number): boolean {
  if (!validUntil) return false;
  const untilMs = Date.parse(validUntil);
  if (Number.isNaN(untilMs)) return false;
  return nowMs >= untilMs;
}

/** "8 Nov 2026" in IST, or null when there is no readable date (hide the line). */
export function formatExpiryDateIst(validUntil: string | null | undefined): string | null {
  if (!validUntil) return null;
  const ms = Date.parse(validUntil);
  if (Number.isNaN(ms)) return null;
  const ist = new Date(ms + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}
