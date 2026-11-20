/**
 * utils/formatRupee.ts — the app's one rupee formatter (stories 23-12 /
 * 23-14, the payslip + balance surfaces).
 *
 * Hand-rolled Indian 2-2-3 grouping (1,23,456 — NOT the western 123,456
 * the house digit regex produces), because the house rule avoids a
 * `toLocaleString`/`Intl.NumberFormat` dependency on Hermes Intl config
 * (attendanceTodayModel.ts's `formatMetresGrouped` precedent — one more
 * environment axis than a display string earns).
 *
 * Decimals print only when the figure has a fractional paisa part —
 * always TWO digits (`₹1,500` vs `₹1,234.56`), the payslip convention —
 * negatives carry a true minus (a balance can go negative on the wire —
 * an overdrawn leave balance, a recovery excess), and `−` is the
 * typographic minus for consistency with the stat chips elsewhere.
 */
const RUPEE_SIGN = '₹';

/** The integer digits of `n`, Indian 2-2-3 grouped. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  // 2-at-a-time from the right over the leading block (…,12,34,XXX).
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${last3}`;
}

/**
 * `1500` → `₹1,500`; `123456.5` → `₹1,23,456.50`; `-500` → `−₹500`.
 * Non-finite input renders as `₹0` — the wire's money fields are
 * numbers, but a `null`/undefined slip of an older backend must never
 * print `NaN` on a payslip.
 */
export function formatRupee(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = safe < 0 ? '−' : '';
  const abs = Math.abs(safe);
  const fixed = abs.toFixed(2);
  const [whole, frac] = fixed.split('.');
  const fracPart = frac === '00' ? '' : `.${frac}`;
  return `${sign}${RUPEE_SIGN}${groupIndian(whole)}${fracPart}`;
}
