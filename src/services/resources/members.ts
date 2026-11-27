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

/** One step up the reporting tree: the manager's id and their name. */
export interface MemberChainLink {
  userId: string;
  name: string;
}

/**
 * Epic 24 — the hierarchy fields every `GET /members` row carries (fenzit-be
 * `MemberHierarchy`). `chain` is nearest-first ("Reports to Priya → Arjun
 * (Owner)"); `headcount` counts everyone strictly below the member;
 * `directReports` the immediate count. Removed memberships and disabled
 * accounts are not counted.
 */
export interface MemberHierarchy {
  managerId: string | null;
  managerName: string | null;
  chain: MemberChainLink[];
  headcount: number;
  directReports: number;
}

export interface CompanyMember extends MemberHierarchy {
  /** The USER id — the same id the roster (`GET /users/me`) rides, and the
   *  path key of the job-settings PATCH. */
  userId: string;
  name: string | null;
  countryCode: string;
  phoneNumber: string;
  /** Per-tenant human reference (`EMP-004`). */
  employeeCode: string;
  role: MemberRole;
  status: 'invited' | 'active' | 'deactivated' | 'removed';
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

/**
 * `PATCH /members/:userId/manager` — the owner sets "Reports to". `managerId`
 * is REQUIRED in the body: `null` clears it, an omitted key is a malformed
 * request. The updated member (chain + headcount included) comes back, so the
 * sheet can swap the row in without a second read.
 *
 * Documented failures: 400 body not a UUID/null · 403 not a company admin ·
 * 404 person/manager not in the company · 409 `MEMBER_IS_ADMIN` /
 * `HIERARCHY_CYCLE` / `HIERARCHY_DEPTH` · 422 `MANAGER_NOT_ACTIVE` or
 * `VALIDATION_ERROR` (self).
 */
async function setManager(
  userId: string,
  managerId: string | null,
): Promise<CompanyMember> {
  const res = await apiClient.patch<CompanyMember>(
    `/members/${userId}/manager`,
    { managerId },
  );
  return res.data;
}

export const membersService = { listMembers, setJobSettings, setManager };
