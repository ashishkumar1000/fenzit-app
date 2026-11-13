/**
 * jobApprovalNotificationModel.ts — the Epic 22 approval-lifecycle cards
 * (story 22-7 step 6): `job.submitted` (to each owner), and
 * `job.approved` / `job.rejected` / `job.cancelled` / `job.edited` (to the
 * employee who created the job). fenzit-be writes one row per event with
 * `job_id` set and a payload of job number, customer name and — for a
 * submission — the creator's name (pending-job-notifications.ts).
 *
 * Same unknown-value rule as every notifications model: the payload is
 * display DATA, not display text — each field degrades independently and a
 * drifted payload degrades to the honest minimal card, never a crash. The
 * rejection's reason is quoted when present, capped to keep the card one
 * readable line or two.
 *
 * The tap is the SHARED job-card decision (`tapTargetForJobCard`): the
 * owner lands on JobDetail (the decision bar sits there), the creator on
 * TechJobDetail — exactly where the push tap lands (CAP-3's one mapping).
 */
import type { ApiNotification } from '../../services';

/** The five approval-lifecycle event types (fenzit-be PENDING_JOB_EVENT). */
export const JOB_APPROVAL_EVENTS = [
  'job.submitted',
  'job.approved',
  'job.rejected',
  'job.cancelled',
  'job.edited',
] as const;

export type JobApprovalEventType = (typeof JOB_APPROVAL_EVENTS)[number];

export function isJobApprovalEvent(eventType: string): eventType is JobApprovalEventType {
  return (JOB_APPROVAL_EVENTS as readonly string[]).includes(eventType);
}

/** Fixed titles — each event says the one thing it is. */
const TITLES: Record<JobApprovalEventType, string> = {
  'job.submitted': 'New job waiting for approval',
  'job.approved': 'Your job was approved',
  'job.rejected': 'Your job was rejected',
  'job.cancelled': 'Your pending job was cancelled',
  'job.edited': 'Your pending job was changed',
};

export interface JobApprovalNotificationCardData {
  kind: 'job-approval';
  /** The notification row's id — the FlatList key. */
  key: string;
  /** The job's uuid — the deep-link target (the role's job viewer). */
  jobId: string;
  title: string;
  message: string | null;
  latestCreatedAt: string;
  isUnread: boolean;
  unreadIds: string[];
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Truncation caps — a rejection reason can be 500 chars; the card is not. */
const NAME_CAP = 30;
const REASON_CAP = 80;

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text;
  // Never cut between the halves of a surrogate pair: a cap landing after
  // a high surrogate would print a lone half — a garbled glyph (review
  // 2026-11-13).
  const end = text.charCodeAt(cap - 1) >= 0xd800 && text.charCodeAt(cap - 1) <= 0xdbff
    ? cap - 1
    : cap;
  return `${text.slice(0, end)}…`;
}

function payloadField(payload: Record<string, unknown>, snake: string): string | null {
  const v = payload[snake];
  return isText(v) ? v : null;
}

/**
 * Builds one card per approval-lifecycle row, preserving the list's
 * newest-first order. Classification has already happened in the registry —
 * every row passed here IS an approval row for the signed-in recipient. A
 * jobless row is wire drift (the deep-link target could not exist), so it
 * builds no card rather than a dead one.
 */
export function buildJobApprovalCards(
  items: ApiNotification[],
): JobApprovalNotificationCardData[] {
  return items
    .filter(
      (n): n is ApiNotification & {
        jobId: string;
        eventType: JobApprovalEventType;
      } => isJobApprovalEvent(n.eventType) && n.jobId != null,
    )
    .map(n => {
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      const jobNumber = payloadField(payload, 'job_number');
      const customerName = payloadField(payload, 'customer_name');
      const employeeName = payloadField(payload, 'employee_name');
      const reason = payloadField(payload, 'reason');

      // The job number leads every message (it is load-bearing); names
      // follow; the rejection's reason trails, capped.
      const parts = [
        jobNumber,
        customerName !== null ? truncate(customerName, NAME_CAP) : null,
        employeeName !== null ? truncate(employeeName, NAME_CAP) : null,
      ].filter((v): v is string => v !== null);
      const base = parts.length > 0 ? parts.join(' · ') : null;
      const message =
        n.eventType === 'job.rejected' && isText(reason)
          ? base !== null
            ? `${base} — ${truncate(reason, REASON_CAP)}`
            : truncate(reason, REASON_CAP)
          : base;

      return {
        kind: 'job-approval' as const,
        key: n.id,
        jobId: n.jobId,
        title: TITLES[n.eventType],
        message,
        latestCreatedAt: n.createdAt,
        isUnread: n.readAt === null,
        unreadIds: n.readAt === null ? [n.id] : [],
      };
    });
}
