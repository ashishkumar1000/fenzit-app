/**
 * payslipModel.ts — the payslip surfaces' pure model (story 23-12). The
 * screens render; this decides. No `Intl`/`toLocaleString` (the Hermes
 * house rule — grouping lives in `utils/formatRupee`), date-string
 * arithmetic only.
 *
 * Two wire vocabularies this model keeps apart on purpose:
 *   - the LIST/GET rows' `pdf.status` (`none|queued|running|ready|failed`)
 *     — what the UI reflects;
 *   - the POST response's `status` (`queued|generating|ready|failed`) —
 *     never rendered, only used to decide "poll now".
 */
import type { PayslipDeductionLine, PayslipPdfStatus } from '../../services';

/** How often the PDF poll refetches the detail while it is in flight. */
export const PAYSLIP_POLL_MS = 5_000;
/** The poll's hard stop (~60s): stop and hand the retry to the user
 *  rather than spin forever — generation may be queue-paused. */
export const PAYSLIP_POLL_MAX_TICKS = 12;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `2026-10` → `October 2026`; anything malformed renders verbatim. */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split('-');
  const index = Number(m) - 1;
  if (!y || Number.isNaN(index) || index < 0 || index > 11) return month;
  return `${MONTHS[index]} ${y}`;
}

/** `2026-10-16` → `16 Oct 2026`; malformed renders verbatim. */
export function formatDayMonthLong(date: string | null): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  const index = Number(m) - 1;
  if (!y || Number.isNaN(index) || index < 0 || index > 11) return date;
  return `${Number(d)} ${MONTHS[index].slice(0, 3)} ${y}`;
}

/** The list row's badge vocabulary for the live `pdf` status. */
export function payslipPdfBadge(status: PayslipPdfStatus): {
  status: 'done' | 'progress' | 'scheduled' | 'cancelled' | 'neutral';
  label: string;
} | null {
  switch (status) {
    case 'ready':
      return { status: 'done', label: 'Ready' };
    case 'queued':
    case 'running':
      return { status: 'scheduled', label: 'Making PDF' };
    case 'failed':
      return { status: 'cancelled', label: 'PDF failed' };
    case 'none':
      return null;
  }
}

/**
 * Deduction rows' human labels — the wire's `source` is a machine token
 * (`pf_employee | tds | head:<name> | recovery:<YYYY-MM>`). Earnings'
 * `name` is already human and renders verbatim.
 */
export function deductionLabel(source: string): string {
  if (source === 'pf_employee') return 'PF — employee share';
  if (source === 'tds') return 'TDS';
  if (source.startsWith('head:')) return source.slice('head:'.length);
  if (source.startsWith('recovery:')) {
    return `Recovery (${formatMonthLong(source.slice('recovery:'.length))})`;
  }
  return source;
}

/** Days figure for copy: `3` → "3", `3.5` → "3.5", `−0.5` → "−0.5". */
export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return '0';
  const rounded = Math.round(days * 10) / 10;
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded)}`;
}

/** The balance row's headline: `2.5` → "2.5 days left", `0` → "0 days
 *  left", `−0.5` → "Overdrawn by 0.5 days" (the derived balance is not
 *  clamped and allow-over types can answer negative). */
export function balanceRemainingCopy(remaining: number): string {
  if (remaining < 0) {
    return `Overdrawn by ${formatDays(Math.abs(remaining))} days`;
  }
  return `${formatDays(remaining)} ${remaining === 1 ? 'day' : 'days'} left`;
}

/** The balance row's caption: accrued · used (+ carried forward >0).
 *  The payslip snapshot carries `availed`; the live endpoint carries
 *  `consumed` — the caller passes the number. */
export function balanceCaption(
  accrued: number,
  availed: number,
  carryForward: number,
): string {
  const parts = [
    `${formatDays(accrued)} accrued`,
    `${formatDays(availed)} used`,
  ];
  if (carryForward > 0) parts.push(`${formatDays(carryForward)} carried forward`);
  return parts.join(' · ');
}

/** The list row's paid/LOP line: "26 paid days · 0 LOP" (LOP omitted at
 *  zero — it is the interesting exception, not the norm). */
export function payslipDaysCopy(paidDays: number, lopDays: number): string {
  const paid = `${formatDays(paidDays)} ${paidDays === 1 ? 'paid day' : 'paid days'}`;
  return lopDays > 0 ? `${paid} · ${formatDays(lopDays)} LOP` : paid;
}
