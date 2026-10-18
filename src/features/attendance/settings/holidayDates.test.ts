/**
 * Tests for holidayDates — pure date helpers, computed from the "YYYY-MM-DD"
 * parts so the result never depends on the phone's timezone.
 */
import { daysBetween, daysUntilLabel, formatLongDate, parseYmd } from './holidayDates';

describe('parseYmd', () => {
  it('parses a real date', () => {
    expect(parseYmd('2026-10-19')).toEqual({ year: 2026, month: 10, day: 19 });
  });

  it('accepts 29 Feb only in a leap year', () => {
    expect(parseYmd('2028-02-29')).not.toBeNull();
    expect(parseYmd('2026-02-29')).toBeNull();
  });

  it.each(['2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '26-10-19', '', 'tomorrow', '2026-10-19T00:00'])(
    'rejects %p',
    (input) => {
      expect(parseYmd(input)).toBeNull();
    },
  );
});

describe('formatLongDate', () => {
  it('writes weekday, day, month and year', () => {
    expect(formatLongDate('2026-10-19')).toBe('Monday, 19 October 2026');
  });

  it('zero-pads the day', () => {
    expect(formatLongDate('2026-01-05')).toBe('Monday, 05 January 2026');
  });

  it('handles a year boundary', () => {
    expect(formatLongDate('2026-12-31')).toBe('Thursday, 31 December 2026');
    expect(formatLongDate('2027-01-01')).toBe('Friday, 01 January 2027');
  });

  it('returns malformed input unchanged instead of "Invalid Date"', () => {
    expect(formatLongDate('not a date')).toBe('not a date');
    expect(formatLongDate('')).toBe('');
  });
});

describe('daysBetween', () => {
  it('is 0 for the same day', () => {
    expect(daysBetween('2026-10-19', '2026-10-19')).toBe(0);
  });

  it('counts across a month and a leap day', () => {
    expect(daysBetween('2026-10-18', '2026-11-01')).toBe(14);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('is negative when the target is earlier', () => {
    expect(daysBetween('2026-10-19', '2026-10-17')).toBe(-2);
  });

  it('is null if either side is malformed', () => {
    expect(daysBetween('x', '2026-10-19')).toBeNull();
    expect(daysBetween('2026-10-19', '2026-02-30')).toBeNull();
  });
});

describe('daysUntilLabel', () => {
  it.each([
    ['2026-10-18', '2026-10-18', 'Today'],
    ['2026-10-18', '2026-10-19', 'Tomorrow'],
    ['2026-10-18', '2026-10-22', 'In 4 days'],
  ])('%s → %s = %s', (today, date, expected) => {
    expect(daysUntilLabel(today, date)).toBe(expected);
  });

  it('is null for a past date', () => {
    expect(daysUntilLabel('2026-10-18', '2026-10-17')).toBeNull();
  });

  it('is null for a malformed date', () => {
    expect(daysUntilLabel('2026-10-18', 'soon')).toBeNull();
  });
});
