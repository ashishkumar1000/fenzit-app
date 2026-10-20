/**
 * services/resources/authApi.ts
 * ───────────────────────────────
 * Auth onboarding — OTP send/verify and first-time company setup.
 *
 * Unlike `technicians.ts`, this is NOT built on `ApiService<T>` — these are
 * action endpoints (`send`, `verify`, `setupCompany`), not CRUD on a single
 * resource, so there's no `list`/`getById`/etc. that makes sense here.
 * Instead, this is a plain object of functions built directly on the shared
 * `apiClient`, one per endpoint documented in the backend's auth guide.
 *
 * Every function rejects with `ApiError` on failure (via apiClient's
 * response interceptor) — the same contract as `ApiService`, callers never see
 * a raw axios error.
 *
 * Currently implemented: `sendOtp`, `verifyOtp`, and `setupCompany`.
 */
import { apiClient } from '../api/apiClient';

// ── Send OTP ────────────────────────────────────────────────────────────────

export interface SendOtpRequest {
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** 6–15 digits, no country code, no spaces/dashes. */
  phoneNumber: string;
}

export interface SendOtpResponse {
  /** Opaque session id — pass this (not the phone number) to `verifyOtp` next. */
  otp_session_id: string;
  /** ISO timestamp — the OTP session expires 5 minutes after send. */
  expires_at: string;
  // No `otp` field: the dev-echo response field is dead to this app (PRD
  // FR-FE1). Real codes arrive over SMS; if a dev build needs a code, read
  // the mock provider's log line or use the flag-gated master code.
}

/** `POST /auth/otp/send` — no auth required. */
async function sendOtp(input: SendOtpRequest): Promise<SendOtpResponse> {
  const res = await apiClient.post<SendOtpResponse>('/auth/otp/send', input);
  return res.data;
}

// ── Verify OTP ───────────────────────────────────────────────────────────────

export interface VerifyOtpRequest {
  /** From `sendOtp`'s response — not the phone number. */
  otpSessionId: string;
  /** Exactly 6 digits. */
  otpCode: string;
}

/**
 * A person's role inside one company, as the backend names it on the wire:
 * `company_admin` (was owner), `employee` (was technician), `viewer`
 * (read-only). Platform staff are NOT a company role — see `LoginRole`.
 */
export type UserRole = 'company_admin' | 'employee' | 'viewer';

/**
 * What `role` can be on a login or `/users/me` response: a company role,
 * `platform_admin` (Fenzit staff, a flag rather than a membership), or
 * `null` (a person with no company yet, or one who was removed).
 */
export type LoginRole = UserRole | 'platform_admin';

export interface VerifiedUser {
  userId: string;
  /**
   * `null` when the person belongs to no company: a brand-new person (role
   * is `null` too — route to company setup next), a removed person, or
   * Fenzit staff. The token is identity only; the backend reads company and
   * role on every request.
   */
  tenantId: string | null;
  role: LoginRole | null;
  /** `null` until set — a fresh company admin has no name until Profile Edit saves one. */
  name: string | null;
  /** True for Fenzit staff (`role` is then `'platform_admin'`, `tenantId` null). */
  platformAdmin: boolean;
  /**
   * True when the person has only removed memberships (no company now). Lets
   * the app show "no access" instead of walking them through company setup.
   */
  formerMember: boolean;
}

export interface VerifyOtpResponse {
  /** JWT — persist via `setAuthToken`; send as `Authorization: Bearer <token>` on subsequent requests. */
  token: string;
  user: VerifiedUser;
}

/** `POST /auth/otp/verify` — no auth required. */
async function verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  const res = await apiClient.post<VerifyOtpResponse>('/auth/otp/verify', input);
  return res.data;
}

// ── Company setup ────────────────────────────────────────────────────────────

export interface SetupCompanyRequest {
  /** The company admin's display name — saved on their users row, shown on Home/More. */
  name: string;
  companyName: string;
  /** 2-letter uppercase ISO 3166-2:IN code, e.g. `KA`. */
  stateCode: string;
  /** Standard 15-char GSTIN, if provided. */
  gstin?: string;
  address?: string;
  /** UPI VPA for payments, e.g. `name@bank`. */
  upiVpa?: string;
}

export interface Tenant {
  id: string;
  /** The user who created the company (was `ownerId`). */
  createdBy: string;
  companyName: string;
  gstin: string | null;
  address: string | null;
  stateCode: string;
  upiVpa: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetupCompanyResponse {
  /**
   * ⚠️ CRITICAL: a NEW token, replacing the one from `verifyOtp` — it now
   * has `tenantId` populated. The old token will keep failing tenant-scoped
   * endpoints. Always persist this one via `setAuthToken` immediately.
   */
  token: string;
  tenant: Tenant;
}

/**
 * `POST /auth/company` — requires the token from `verifyOtp`. For a person
 * with no company (creates it and makes them its admin) or the company's own
 * admin (updates it). An employee, viewer or platform admin gets 403, and a
 * person who is only invited elsewhere gets 409. Idempotent: safe to call
 * again later to update company details.
 */
async function setupCompany(input: SetupCompanyRequest): Promise<SetupCompanyResponse> {
  const res = await apiClient.post<SetupCompanyResponse>('/auth/company', input);
  return res.data;
}

export const authApi = {
  sendOtp,
  verifyOtp,
  setupCompany,
};
