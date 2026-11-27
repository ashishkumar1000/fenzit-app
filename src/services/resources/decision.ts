/**
 * services/resources/decision.ts
 * ───────────────────────────────
 * The per-row decision answer the backend stamps on leave requests and job
 * rows (Epic 24, CAP-5 — fenzit-be 24-5). The walk behind it is the SAME one
 * the decision POST runs, so a button rendered from `canDecide` can never
 * disagree with the server's gate.
 *
 * Shared here because both `attendanceLeave.ts` and `jobs.ts` carry it — a
 * leave row and a pending job row answer the identical `{ canDecide, reason }`
 * shape.
 *
 * `reason` is the read-only explanation, null when `canDecide` is true:
 *   - `higher_manager` — someone closer to the requester decides it
 *   - `unresolved`     — no approver is set up
 *   - `not_pending`    — the row is not waiting for a decision
 * Optional on the owning types so a backend older than 24-5 fails hidden
 * (no buttons, no note) rather than pretending a decision exists.
 */
export type DecisionReason = 'higher_manager' | 'unresolved' | 'not_pending';

export interface DecisionView {
  canDecide: boolean;
  reason: DecisionReason | null;
}
