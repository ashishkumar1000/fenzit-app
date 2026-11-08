/**
 * services/resources/company.ts
 * ─────────────────────────────
 * Company details the owner edits on the Edit profile page: the GST number
 * and the business types. Plain functions on the shared `apiClient`, like
 * `users.ts`.
 *
 * The backend is the source of truth for both lists and rules: the business
 * type options come from `GET /business-types`, and `PATCH /company` (owner
 * only) rejects a bad GSTIN or an unknown type with 422.
 */
import { apiClient } from '../api/apiClient';

/** One business type: a stable `code` to send back, and a plain `label` to show. */
export interface BusinessType {
  code: string;
  label: string;
}

/** Company details as the backend returns them from `PATCH /company`. */
export interface CompanyDetails {
  id: string;
  companyName: string;
  gstin: string | null;
  address: string | null;
  stateCode: string;
  upiVpa: string | null;
  businessTypes: BusinessType[];
}

/** `PATCH /company` body. Absent fields are left as they are. `gstin: null` clears it. */
export interface UpdateCompanyBody {
  gstin?: string | null;
  businessTypeCodes?: string[];
}

/** `GET /business-types` — the picker options, in display order. */
async function listBusinessTypes(signal?: AbortSignal): Promise<BusinessType[]> {
  const res = await apiClient.get<{ businessTypes: BusinessType[] }>('/business-types', {
    signal,
  });
  return res.data.businessTypes;
}

/** `PATCH /company` — owner only. Returns the updated company details. */
async function updateCompany(body: UpdateCompanyBody): Promise<CompanyDetails> {
  const res = await apiClient.patch<CompanyDetails>('/company', body);
  return res.data;
}

export const companyApi = {
  listBusinessTypes,
  updateCompany,
};
