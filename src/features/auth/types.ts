/**
 * Auth & account-setup domain types for the first-launch sign-up flow.
 *
 * Kept local to the feature; promote to `src/types` only if another feature
 * needs to consume them.
 */
import type { UserRole } from '../../services';

/** The three steps of first-time account setup. */
export type AuthStep = 'phone' | 'otp' | 'profile';

/** Business profile captured in step 3. */
export type BusinessProfile = {
  businessName: string;
  ownerName: string;
  /** One or more business types — profile data only, nothing downstream reads them. */
  businessTypes: string[];
  city: string;
  /** 2-letter ISO 3166-2: IN state code, e.g. "KA" — required by company setup. */
  stateCode: string;
  /** GSTIN — optional; only needed for GST invoices. */
  gstNumber: string;
};

/**
 * What the flow hands back once setup is complete — everything the app gate
 * (`useAuth`) needs to persist to know who's signed in and route them to the
 * right side of the app (company admin, viewer, employee, or the plain
 * "no access" screen) on this and future launches.
 */
export type AuthResult = {
  phone: string; // E.164-ish, e.g. "+919876543210"
  profile: BusinessProfile;
  /** `null` for a person with no company, a removed person, or Fenzit staff. */
  role: UserRole | null;
  /** `null` for a fresh company admin (no name until Profile Edit saves one); set for invited people. */
  name: string | null;
  /** `null` when the person belongs to no company. */
  tenantId: string | null;
  /** Fenzit staff — they use the web admin, not this app. */
  platformAdmin: boolean;
};
