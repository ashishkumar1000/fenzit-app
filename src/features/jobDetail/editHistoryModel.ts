/**
 * editHistoryModel.ts — CAP-6's per-field owner-edit history, parsed from a
 * `job_edited` activity row (user decision 2026-11-13, option A). The
 * backend's `update_job_with_log` RPC writes one row per save whose
 * metadata carries `changes: { field: { before, after } }` (camelCase keys,
 * ISO timestamps raw) — migration 20261113000002. This model turns that
 * into display rows for the ActivityTimeline: plain-English field labels,
 * human before → after values.
 *
 * Same unknown-value rule as every model: a drifted or pre-convention row
 * (metadata absent — older saves) renders the plain "Changed by owner"
 * label with no rows, never a crash. ID-valued fields (skill, customer,
 * employee) carry only UUIDs in the log — the surrounding stores can't
 * resolve a MOVED name, so those render as "X changed" without values
 * instead of a bare UUID.
 */
import type { ActivityLogEntry } from '../../services';
import { formatIstDateTimeLabel } from '../../utils/istDate';

export interface EditChangeRow {
  /** Plain-English field label ("Start time", "Location"). */
  field: string;
  /** Display value before the edit, or null when not displayable. */
  before: string | null;
  /** Display value after the edit, or null when not displayable. */
  after: string | null;
  /** True when the field's values are IDs (render "changed", no values). */
  isIdField: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  scheduledStart: 'Start time',
  scheduledEnd: 'End time',
  notesForTechnician: 'Notes',
  priority: 'Priority',
  serviceLocation: 'Location',
  skillId: 'Skill',
  customerId: 'Customer',
  technicianId: 'Employee',
};

/** Fields whose before/after are UUIDs — not displayable from the log. */
const ID_FIELDS = new Set(['skillId', 'customerId', 'technicianId']);

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** ISO timestamp → "13 Nov, 7:00 pm" in IST wall-clock (NOT the device's
 *  timezone — see formatIstDateTimeLabel); anything else renders "—". */
function formatValue(field: string, value: unknown): string {
  if (field === 'scheduledStart' || field === 'scheduledEnd') {
    if (!isText(value)) return '—';
    return formatIstDateTimeLabel(value) ?? '—';
  }
  if (field === 'priority') {
    if (!isText(value)) return '—';
    return value === 'urgent' ? 'Urgent' : value === 'normal' ? 'Normal' : value;
  }
  if (!isText(value)) return '—';
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * Parses one `job_edited` row into its per-field change lines. Rows from
 * other event types (or rows whose metadata carries no usable `changes`
 * object — older saves, drift) yield nothing: the timeline renders their
 * label alone, as it always has.
 */
export function editChangeRows(entry: ActivityLogEntry): EditChangeRow[] {
  if (entry.eventType !== 'job_edited') return [];
  const changes = entry.metadata?.['changes'];
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  const rows: EditChangeRow[] = [];
  for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const { before, after } = raw as { before?: unknown; after?: unknown };
    if (ID_FIELDS.has(field)) {
      rows.push({
        field: FIELD_LABELS[field] ?? field,
        before: null,
        after: null,
        isIdField: true,
      });
      continue;
    }
    rows.push({
      field: FIELD_LABELS[field] ?? field,
      before: formatValue(field, before),
      after: formatValue(field, after),
      isIdField: false,
    });
  }
  return rows;
}
