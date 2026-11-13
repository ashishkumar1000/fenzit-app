/**
 * services/resources/members.ts
 * ─────────────────────────────
 * The company's people list (`GET /members`) and the per-employee job
 * switches (`PATCH /members/:userId/job-settings`, Epic 22 step 5): whether
 * the person may create jobs, and whether their new jobs wait for the
 * owner's approval. Both are company-admin only (`member.read` /
 * `member.job_settings`).
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `jobs.ts`). Rejects with `ApiError` on failure. Documented failures:
 *   list    401 · 403 (not a company admin)
 *   patch   400 NOT_AN_EMPLOYEE · 403 · 404 (not an active member)
 */
import { apiClient } from '../api/apiClient';

/** A membership role. `viewer` reads; only employees work jobs. */
export type MemberRole = 'company_admin' | 'employee' | 'viewer';

export interface CompanyMember {
  /** The USER id — the same id the roster (`GET /users/me`) rides, and the
   *  path key of the job-settings PATCH. */
  userId: string;
  name: string | null;
  countryCode: string;
  phoneNumber: string;
  /** Per-tenant human reference (`EMP-004`). */
  employeeCode: string;
  role: MemberRole;
  status: 'invited' | 'active' | 'removed';
  createdAt: string;
  /** Short-lived photo link, or null. */
  avatarUrl: string | null;
  /** Job switches (CAP-1). Meaningful for employees; false/true for others. */
  canCreateJobs: boolean;
  jobApprovalRequired: boolean;
}

/** Body of `PATCH /members/:userId/job-settings` — both switches, always. */
export interface MemberJobSettings {
  canCreateJobs: boolean;
  jobApprovalRequired: boolean;
}

/** `PATCH …/job-settings` response — the stored values back. */
export type MemberJobSettingsResponse = MemberJobSettings & { userId: string };

async function listMembers(): Promise<CompanyMember[]> {
  const res = await apiClient.get<CompanyMember[]>('/members');
  return res.data;
}

async function setJobSettings(
  userId: string,
  settings: MemberJobSettings,
): Promise<MemberJobSettingsResponse> {
  const res = await apiClient.patch<MemberJobSettingsResponse>(
    `/members/${userId}/job-settings`,
    settings,
  );
  return res.data;
}

export const membersService = { listMembers, setJobSettings };
