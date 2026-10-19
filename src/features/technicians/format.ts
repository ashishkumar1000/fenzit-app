/**
 * Display/search helpers for the profile roster (`ProfileTechnician`). Kept
 * out of the components so the picker tiles and the Select screen's rows
 * share one definition of "phone" and one search filter — the same
 * separation `customers/format.ts` gives its surfaces.
 */
import type { ProfileTechnician } from '../../services';

/** `+91 6765644658` — dial code and number, single space between. Mirrors
 *  `customerPhone`; both sides store digits without the dial code. */
export function technicianPhone(
  technician: Pick<ProfileTechnician, 'countryCode' | 'phoneNumber'>,
): string {
  return `${technician.countryCode} ${technician.phoneNumber}`;
}

/** Name as a string even if a malformed row slips through (null/undefined). */
function safeName(t: Pick<ProfileTechnician, 'name'>): string {
  return typeof t.name === 'string' ? t.name : '';
}

/**
 * A pick list reads alphabetically by name, whatever order the roster was
 * created in (R-23). Locale-aware and case/accent-insensitive at the base
 * level (numbers by value, "Tech 2" before "Tech 10"), so "bala" sits between "Asha" and "Chitra" and "Éla" before "Zoya".
 * Returns a new array; equal names keep their roster order (stable sort).
 */
export function sortTechniciansByName(
  technicians: ProfileTechnician[],
): ProfileTechnician[] {
  return [...technicians].sort((a, b) => {
    // Defensive: a malformed row with no name must not throw; it sorts last.
    const an = safeName(a);
    const bn = safeName(b);
    if (!an && !bn) return 0;
    if (!an) return 1;
    if (!bn) return -1;
    return an.localeCompare(bn, undefined, { sensitivity: 'base', numeric: true });
  });
}

/**
 * Client-side search over the profile roster. Small list, so client-side is
 * free — but the semantics mirror `filterCustomers` (name OR phone digits)
 * so a later server-side switch is invisible to the user.
 *
 * Phone and employee-code matching use only the digits of the query, so a
 * partial number typed with stray punctuation still matches the stored
 * digits-only number, and every spelling of a code ("104", "EMP-104",
 * "emp104") reduces to the same digits. A query with no digits ("emp")
 * never matches codes — it would otherwise match every technician at once.
 */
export function filterTechnicians(
  technicians: ProfileTechnician[],
  query: string,
): ProfileTechnician[] {
  const q = query.trim().toLowerCase();
  if (!q) return technicians;
  const digits = q.replace(/\D/g, '');
  return technicians.filter(
    t =>
      safeName(t).toLowerCase().includes(q) ||
      (digits.length > 0 &&
        ((t.phoneNumber ?? '').includes(digits) ||
          (t.employeeCode ?? '').toLowerCase().includes(digits))),
  );
}
