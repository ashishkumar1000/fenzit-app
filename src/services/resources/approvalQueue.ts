/**
 * services/resources/approvalQueue.ts
 * ───────────────────────────────────
 * The owner's approval queue (`GET /approval-queue`, Epic 22 story 4):
 * every job in `pending_approval` in this company, oldest submission first —
 * the job that has waited longest leads. The decision itself is
 * `jobService.decidePending` (POST /jobs/:id/approval), not here.
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `jobs.ts`). Rejects with `ApiError` on failure. Documented failures:
 *   401 (missing/invalid JWT) · 403 (not a company admin of this company) ·
 *   422 (bad employee filter / age filter).
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/** One queue row — a pending job's decision-relevant summary. */
export interface ApprovalQueueItem {
  id: string;
  jobNumber: string;
  submittedAt: string;
  /** Whole hours since the job was submitted. */
  ageHours: number;
  /** The employee who created the job (their id, if still resolvable). */
  employee: { id: string; name: string | null } | null;
  customerName: string | null;
}

async function list(
  query: {
    /** Filter to one employee's submissions. */
    employeeId?: string;
    /** Only jobs submitted more than this many hours ago. */
    olderThanHours?: number;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<Paginated<ApprovalQueueItem>> {
  const res = await apiClient.get<Paginated<ApprovalQueueItem>>(
    '/approval-queue',
    { params: query },
  );
  return res.data;
}

export const approvalQueueService = { list };
