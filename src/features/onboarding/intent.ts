/**
 * Onboarding intent — the "How will you use Fenzit?" answer.
 *
 * The picker is an INTENT, never an identity: in Fenzit the phone number
 * decides the role (verify-otp returns it), so a mismatch between what the
 * person picked and what their number is gets a one-line correction and the
 * real experience — never a dead end, never a second account type.
 */
import type { UserRole } from '../../services';

export type OnboardingIntent = 'owner' | 'staff';

/** One-line correction shown above the tour when intent and reality differ. */
export function mismatchNotice(
  intent: OnboardingIntent | null,
  role: UserRole | null,
): string | null {
  if (!intent) return null;
  if (intent === 'owner' && role === 'employee') {
    return 'This number is registered as a field employee \u2014 here\u2019s the employee app.';
  }
  if (intent === 'staff' && role === 'company_admin') {
    return 'This number runs a company on Fenzit \u2014 here\u2019s the owner app.';
  }
  return null;
}
