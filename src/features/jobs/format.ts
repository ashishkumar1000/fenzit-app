/**
 * Pure display mappings for the jobs feature — API vocabulary in, UI
 * vocabulary out. No React, no side effects; unit-testable on their own.
 */
import type { StatusKey } from '../../theme';
import type { JobStatusApi } from '../../services';

/**
 * The JOB badge subset of `StatusKey`. Attendance's day-status keys (spec
 * 18-3) share the same `colors.status` palette but are not job vocabulary
 * — keeping this narrow is what keeps the label/record maps over job
 * statuses total and the job rendering byte-identical.
 */
export type JobBadgeStatus = Extract<
  StatusKey,
  | 'done'
  | 'progress'
  | 'scheduled'
  | 'pendingApproval'
  | 'rejected'
  | 'cancelled'
>;

/**
 * API status → the Badge vocabulary (`StatusKey`). `in_progress` collapses to
 * `progress` — the theme's key for that state, and the one title-case
 * exception in Badge labels ("In Progress").
 */
export function statusToBadge(s: JobStatusApi): JobBadgeStatus {
  const map = {
    scheduled: 'scheduled',
    in_progress: 'progress',
    completed: 'done',
    cancelled: 'cancelled',
    pending_approval: 'pendingApproval',
    rejected: 'rejected',
  } as const;
  // Fallback for enum drift: an unknown status must not render `undefined`
  // into `<Badge status>` — fall back to the scheduled badge.
  return map[s] ?? 'scheduled';
}

/**
 * 12-hour clock label ("2:00 – 4:00 PM"), or a single time when the job has
 * no end.
 */
export function formatTimeLabel(startIso: string, endIso: string | null): string {
  // en-IN prints the meridiem lowercase ("3:30 pm"); the app's other time
  // renders say "AM"/"PM" (punch tiles, attendance history, activity
  // timeline, stepper, dashboard pulse) — a job row under the punch card
  // read "3:30 pm" while the punch above it said "4:06 AM" (Sally's casing
  // split, 2026-11-13). Uppercase is the one convention. No \b anchors:
  // "3:30pm" has no word boundary between digit and letter, and the match
  // runs over the formatter's digits/colons output only.
  const fmt = (d: Date) =>
    d
      .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
      .replace(/(am|pm)/gi, m => m.toUpperCase());
  const start = new Date(startIso);
  return endIso ? `${fmt(start)} – ${fmt(new Date(endIso))}` : fmt(start);
}
