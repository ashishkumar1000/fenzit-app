/**
 * `formatRupee` — the one rupee formatter (23-12/23-14). Pins the
 * Indian 2-2-3 grouping (1,23,456 — NOT the western 123,456), the
 * fraction-prints-only-when-nonzero rule, the true typographic minus
 * for negatives, and the non-finite → ₹0 guard (a null slip of an older
 * backend must never print NaN on a payslip).
 */
import { formatRupee } from './formatRupee';

describe('integer grouping — Indian 2-2-3', () => {
  it.each([
    [0, '₹0'],
    [999, '₹999'],
    [1500, '₹1,500'],
    [123456, '₹1,23,456'],
    [1234567, '₹12,34,567'],
    [15112.91, '₹15,112.91'],
  ])('%p → %p', (amount, expected) => {
    expect(formatRupee(amount)).toBe(expected);
  });
});

describe('decimals print only when there is paisa', () => {
  it('1500.00 hides the zero fraction', () => {
    expect(formatRupee(1500.0)).toBe('₹1,500');
  });

  it('1500.5 prints the fractional part (always two digits)', () => {
    expect(formatRupee(1500.5)).toBe('₹1,500.50');
  });

  it('1234.56 prints two decimals', () => {
    expect(formatRupee(1234.56)).toBe('₹1,234.56');
  });
});

describe('negatives carry the true minus', () => {
  it('-500 → −₹500 (typographic, not hyphen)', () => {
    expect(formatRupee(-500)).toBe('−₹500');
  });

  it('-0.5 → −₹0.50', () => {
    expect(formatRupee(-0.5)).toBe('−₹0.50');
  });

  it('-123456 groups the absolute value', () => {
    expect(formatRupee(-123456)).toBe('−₹1,23,456');
  });

  it('-0 is not negative (no stray minus)', () => {
    expect(formatRupee(-0)).toBe('₹0');
  });
});

describe('non-finite renders ₹0 — never NaN', () => {
  it('NaN → ₹0', () => {
    expect(formatRupee(NaN)).toBe('₹0');
  });

  it('Infinity → ₹0', () => {
    expect(formatRupee(Infinity)).toBe('₹0');
  });
});
