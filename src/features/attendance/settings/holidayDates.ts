/**
 * Pure date helpers for the Holidays screen. Dates are the BE's tenant-local
 * "YYYY-MM-DD" strings; everything is computed from the parts (never through
 * the device timezone), so "19 Oct" is "19 Oct" on every phone.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_ABBR = MONTHS.map(m => m.slice(0, 3).toUpperCase());

export type YmdParts = { year: number; month: number; day: number };

/** Parse "YYYY-MM-DD"; null for anything malformed or not a real date. */
export function parseYmd(ymd: string): YmdParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** "2026-10-19" → "Monday, 19 October 2026"; the raw string if malformed. */
export function formatLongDate(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${String(p.day).padStart(2, '0')} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier); null if either is malformed. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return null;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** "Today" / "Tomorrow" / "In 4 days" — null when the date is past or malformed. */
export function daysUntilLabel(today: string, date: string): string | null {
  const n = daysBetween(today, date);
  if (n === null || n < 0) return null;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}
