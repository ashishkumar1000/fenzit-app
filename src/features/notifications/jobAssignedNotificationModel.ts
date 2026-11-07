/**
 * jobAssignedNotificationModel.ts — the `job.assigned` card (Firebase plan,
 * user decision 2026-11-07): when an admin assigns (or reassigns) a job to
 * a technician, fenzit-be writes that technician one `job.assigned` row
 * (job_id set, payload with the job number, customer name and scheduled
 * start when known). The inbox renders it as a readable "New job assigned"
 * card — NOT as a workflow-step stage on the grouped job card (the
 * registry classifies the event type before the job fallback, and the job
 * grouper skips these rows).
 *
 * Same unknown-value rule as every notifications model: the payload is
 * display DATA, not display text — each field degrades independently and a
 * drifted payload degrades to the honest minimal card ("New job assigned",
 * nothing else), never a crash, never a broken stage. Payload field names
 * are read in BOTH conventions (camelCase and the Story 3.1 RPC's
 * snake_case) because the BE payload is new wire surface — display never
 * depends on which one shipped.
 *
 * The tap is the SHARED job-card decision (`tapTargetForJobCard`): the
 * technician lands on TechJobDetail — exactly where the push tap lands
 * (one mapping; the plan's CAP-3 rule).
 */
import dayjs from 'dayjs';
import type { ApiNotification } from '../../services';

/** Fixed title — assignment is the one thing this card says. */
export const JOB_ASSIGNED_TITLE = 'New job assigned';

export interface JobAssignedNotificationCardData {
  kind: 'job-assigned';
  /** The notification row's id — the FlatList key. */
  key: string;
  /** The assigned job's uuid — the deep-link target (TechJobDetail). */
  jobId: string;
  title: string;
  /** "JOB-1042 · Sharma Electronics · 12 Nov, 10:30 AM" — present parts only. */
  message: string | null;
  latestCreatedAt: string;
  isUnread: boolean;
  unreadIds: string[];
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** UX truncation cap for a customer name (the spec's label cap). */
const CUSTOMER_NAME_CAP = 30;

function truncate(text: string, cap: number): string {
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

/**
 * Reads the assignment payload's three display fields, in BOTH naming
 * conventions (camelCase first — the payload is new wire surface), each
 * degrading independently to null. The customer name applies the spec's
 * 30-char truncation; the job number is load-bearing and never truncated.
 * Shared by the inbox card and the technician's Realtime banner, so the
 * shade and the card can never disagree.
 */
export function readJobAssignedParts(payload: Record<string, unknown>): {
  jobNumber: string | null;
  customerName: string | null;
  scheduledStart: string | null;
} {
  const customer = payloadField(payload, 'customerName', 'customer_name');
  return {
    jobNumber: payloadField(payload, 'jobNumber', 'job_number'),
    customerName: customer !== null ? truncate(customer, CUSTOMER_NAME_CAP) : null,
    scheduledStart: payloadField(payload, 'scheduledStart', 'scheduled_start'),
  };
}

/** Reads one payload field in either naming convention (camelCase first). */
function payloadField(
  payload: Record<string, unknown>,
  camel: string,
  snake: string,
): string | null {
  if (isText(payload[camel])) return payload[camel] as string;
  if (isText(payload[snake])) return payload[snake] as string;
  return null;
}

/** Human "12 Nov, 10:30 AM" from an ISO scheduled start; null when absent/unparseable. */
function scheduledStartCopy(iso: string | null): string | null {
  if (iso === null) return null;
  const at = dayjs(iso);
  return at.isValid() ? at.format('DD MMM, h:mm A') : null;
}

/**
 * Builds one card per `job.assigned` row, preserving the list's
 * newest-first order (same contract as the other one-row-per-card models).
 * Classification has already happened in the registry — every row passed
 * here IS an assignment row for the signed-in recipient. A jobless
 * assignment row is wire drift (the deep-link target could not exist), so
 * it builds no card rather than a dead one.
 */
export function buildJobAssignedCards(
  items: ApiNotification[],
): JobAssignedNotificationCardData[] {
  return items
    .filter(
      (n): n is ApiNotification & { jobId: string } =>
        n.eventType === 'job.assigned' && n.jobId !== null,
    )
    .map(n => {
      const payload = (n.payload ?? {}) as Record<string, unknown>;
      const { jobNumber, customerName, scheduledStart } = readJobAssignedParts(payload);
      const parts = [
        jobNumber,
        customerName,
        scheduledStartCopy(scheduledStart),
      ].filter((v): v is string => v !== null);
      return {
        kind: 'job-assigned' as const,
        key: n.id,
        jobId: n.jobId,
        title: JOB_ASSIGNED_TITLE,
        message: parts.length > 0 ? parts.join(' · ') : null,
        latestCreatedAt: n.createdAt,
        isUnread: n.readAt === null,
        unreadIds: n.readAt === null ? [n.id] : [],
      };
    });
}