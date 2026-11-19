/**
 * Pure-model tests for `payslipModel` (story 23-12). Pins: the two
 * date formatters (well-formed → human, malformed → VERBATIM — the
 * render-never-invent rule), the list badge's fixed vocabulary (the
 * two wire status enums stay separate), the machine `source` → human
 * deduction label map, the days/balance copy (typographic minus on
 * negatives, "Overdrawn by" below zero), and the poll budget constants
 * (5s ticks, ~60s hard stop).
 */
import {
  PAYSLIP_POLL_MAX_TICKS,
  PAYSLIP_POLL_MS,
  balanceCaption,
  balanceRemainingCopy,
  deductionLabel,
  formatDayMonthLong,
  formatDays,
  formatMonthLong,
  payslipDaysCopy,
  payslipPdfBadge,
} from './payslipModel';

describe('formatMonthLong', () => {
  it.each([
    ['2026-10', 'October 2026'],
    ['2026-01', 'January 2026'],
    ['2025-12', 'December 2025'],
  ])('%p → %p', (month, expected) => {
    expect(formatMonthLong(month)).toBe(expected);
  });

  it.each([
    ['2026-13'], // month out of range
    ['2026-00'],
    ['2026'],
    ['not-a-month'],
  ])('malformed %p renders verbatim (never invented)', month => {
    expect(formatMonthLong(month)).toBe(month);
  });
});

describe('formatDayMonthLong', () => {
  it('2026-10-16 → 16 Oct 2026 (day de-zeroed, month abbreviated)', () => {
    expect(formatDayMonthLong('2026-10-16')).toBe('16 Oct 2026');
  });

  it('2026-01-02 → 2 Jan 2026', () => {
    expect(formatDayMonthLong('2026-01-02')).toBe('2 Jan 2026');
  });

  it('null → empty string', () => {
    expect(formatDayMonthLong(null)).toBe('');
  });

  it('malformed renders verbatim', () => {
    expect(formatDayMonthLong('16/10/2026')).toBe('16/10/2026');
  });
});

describe('payslipPdfBadge — the list badge vocabulary', () => {
  it('ready → done / Ready', () => {
    expect(payslipPdfBadge('ready')).toEqual({ status: 'done', label: 'Ready' });
  });

  it.each(['queued', 'running'] as const)('%p → scheduled / Making PDF', status => {
    expect(payslipPdfBadge(status)).toEqual({
      status: 'scheduled',
      label: 'Making PDF',
    });
  });

  it('failed → cancelled / PDF failed', () => {
    expect(payslipPdfBadge('failed')).toEqual({
      status: 'cancelled',
      label: 'PDF failed',
    });
  });

  it('none → no badge at all', () => {
    expect(payslipPdfBadge('none')).toBeNull();
  });
});

describe('deductionLabel — machine source → human label', () => {
  it('pf_employee → PF — employee share', () => {
    expect(deductionLabel('pf_employee')).toBe('PF — employee share');
  });

  it('tds → TDS', () => {
    expect(deductionLabel('tds')).toBe('TDS');
  });

  it('head:<name> → the head name verbatim', () => {
    expect(deductionLabel('head:Welfare Fund')).toBe('Welfare Fund');
  });

  it('recovery:<YYYY-MM> → Recovery (Month YYYY)', () => {
    expect(deductionLabel('recovery:2026-09')).toBe('Recovery (September 2026)');
  });

  it('unknown token renders verbatim (the BE owns the vocabulary)', () => {
    expect(deductionLabel('esi_employee')).toBe('esi_employee');
  });
});

describe('formatDays', () => {
  it.each([
    [3, '3'],
    [3.5, '3.5'],
    [0, '0'],
    [-0.5, '−0.5'],
  ])('%p → %p (typographic minus on negatives)', (days, expected) => {
    expect(formatDays(days)).toBe(expected);
  });

  it('non-finite → 0 (never NaN)', () => {
    expect(formatDays(NaN)).toBe('0');
  });
});

describe('balanceRemainingCopy', () => {
  it('2.5 → 2.5 days left', () => {
    expect(balanceRemainingCopy(2.5)).toBe('2.5 days left');
  });

  it('1 → singular day left', () => {
    expect(balanceRemainingCopy(1)).toBe('1 day left');
  });

  it('0 → 0 days left', () => {
    expect(balanceRemainingCopy(0)).toBe('0 days left');
  });

  it('−0.5 → Overdrawn by 0.5 days (allow-over types answer negative)', () => {
    expect(balanceRemainingCopy(-0.5)).toBe('Overdrawn by 0.5 days');
  });
});

describe('balanceCaption', () => {
  it('accrued · used', () => {
    expect(balanceCaption(12, 1, 0)).toBe('12 accrued · 1 used');
  });

  it('carry forward > 0 appends the third part', () => {
    expect(balanceCaption(12, 1, 3)).toBe('12 accrued · 1 used · 3 carried forward');
  });

  it('zero or negative carry forward is omitted', () => {
    expect(balanceCaption(12, 1, -2)).toBe('12 accrued · 1 used');
  });
});

describe('payslipDaysCopy — the list row line', () => {
  it('26 paid · 0 LOP → LOP omitted (the exception, not the norm)', () => {
    expect(payslipDaysCopy(26, 0)).toBe('26 paid days');
  });

  it('1 paid day is singular', () => {
    expect(payslipDaysCopy(1, 0)).toBe('1 paid day');
  });

  it('LOP rides when positive', () => {
    expect(payslipDaysCopy(25, 1)).toBe('25 paid days · 1 LOP');
  });

  it('half-day LOP prints the fraction', () => {
    expect(payslipDaysCopy(25.5, 0.5)).toBe('25.5 paid days · 0.5 LOP');
  });
});

describe('poll budget constants', () => {
  it('5s ticks, 12 ticks ≈ the 60s hard stop', () => {
    expect(PAYSLIP_POLL_MS).toBe(5_000);
    expect(PAYSLIP_POLL_MAX_TICKS).toBe(12);
  });
});
