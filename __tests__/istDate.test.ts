/**
 * istDate util — the hand-built IST day math behind the timeline scopes.
 *
 * jest runs in the host machine's timezone and clock, so every test pins
 * `nowIso` explicitly. `2026-09-04T04:00:00Z` is the anchor: 09:30 IST on
 * 4 Sep 2026. Its IST midnight is `2026-09-03T18:30:00Z` — which is also the
 * day boundary used to prove that two jobs 30 minutes apart can be a whole
 * day apart in overdue terms.
 */
import {
  addIstDays,
  daysOverdue,
  formatIstDateLabel,
  formatIstDateTimeLabel,
  isSameIstDay,
  istDayStartMs,
} from '../src/utils';

const NOW = '2026-09-04T04:00:00Z'; // 09:30 IST, Fri 4 Sep 2026
const IST_MIDNIGHT = '2026-09-03T18:30:00Z'; // 00:00 IST on 4 Sep
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('istDayStartMs', () => {
  it('returns the IST midnight of the pinned day as an epoch-ms instant', () => {
    expect(istDayStartMs(NOW)).toBe(Date.parse(IST_MIDNIGHT));
  });

  it('advances one IST day per 24h — add multiples of 86_400_000 for fixtures', () => {
    const tomorrow = istDayStartMs(NOW) + MS_PER_DAY;
    expect(new Date(tomorrow).toISOString()).toBe('2026-09-04T18:30:00.000Z');
  });
});

describe('isSameIstDay', () => {
  it('counts any hour of the same IST day as today', () => {
    expect(isSameIstDay('2026-09-03T18:30:00Z', NOW)).toBe(true); // 00:00 IST
    expect(isSameIstDay('2026-09-04T11:00:00Z', NOW)).toBe(true); // 16:30 IST
  });

  it('flips at the 18:30Z boundary, not the UTC midnight', () => {
    expect(isSameIstDay('2026-09-03T18:29:59Z', NOW)).toBe(false); // 23:59:59 IST, 3 Sep
    expect(isSameIstDay('2026-09-03T18:30:00Z', NOW)).toBe(true); // 00:00:00 IST, 4 Sep
  });
});

describe('daysOverdue', () => {
  it('is 0 for anything today, however early', () => {
    expect(daysOverdue(IST_MIDNIGHT, NOW)).toBe(0);
  });

  it('is 1 for yesterday', () => {
    expect(daysOverdue('2026-09-03T10:00:00Z', NOW)).toBe(1);
  });

  it('counts whole IST days, so 23:30 IST yesterday → 1 but 00:00 IST today → 0', () => {
    // These two instants are 30 minutes apart, yet a day apart in IST terms.
    expect(daysOverdue('2026-09-03T18:00:00Z', NOW)).toBe(1); // 23:30 IST, 3 Sep
    expect(daysOverdue('2026-09-03T18:30:00Z', NOW)).toBe(0); // 00:00 IST, 4 Sep
  });

  it('counts a full week and never goes negative for future jobs', () => {
    expect(daysOverdue('2026-08-28T10:00:00Z', NOW)).toBe(7);
    expect(daysOverdue('2026-09-10T10:00:00Z', NOW)).toBe(0); // future → clamped
  });
});

describe('formatIstDateLabel', () => {
  it('omits the year when it matches the pinned now', () => {
    expect(formatIstDateLabel('2026-09-04T04:00:00Z', NOW)).toBe('4 Sep');
  });

  it('appends the year when it differs from the pinned now', () => {
    expect(formatIstDateLabel('2027-09-05T04:00:00Z', NOW)).toBe('5 Sep 2027');
  });

  it('reads the IST wall date, not the UTC date', () => {
    // 2026-09-04T17:00:00Z is 4 Sep UTC but 22:30 IST 4 Sep → "4 Sep";
    // 2026-09-04T19:30:00Z is 4 Sep UTC but 01:00 IST 5 Sep → "5 Sep".
    expect(formatIstDateLabel('2026-09-04T17:00:00Z', NOW)).toBe('4 Sep');
    expect(formatIstDateLabel('2026-09-04T19:30:00Z', NOW)).toBe('5 Sep');
  });
});

describe('addIstDays', () => {
  // The report windows (Epic 22) build `from` = `to` − (N−1) with this, so a
  // wrong day count silently widens or narrows every summary on the app.
  // Pure string math on UTC calendar days — no clock, no timezone.

  it('steps single days across a month boundary', () => {
    expect(addIstDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addIstDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('spans a 30-day window across the month edge (from = to − 29)', () => {
    expect(addIstDays('2026-09-04', -29)).toBe('2026-08-06');
    // And back, proving the pair is a true 30-day window inclusive.
    expect(addIstDays('2026-08-06', 29)).toBe('2026-09-04');
  });

  it('spans a 7-day window', () => {
    expect(addIstDays('2026-09-04', -6)).toBe('2026-08-29');
  });

  it('crosses the year boundary including the leap-year February 2028', () => {
    expect(addIstDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addIstDays('2025-12-20', 30)).toBe('2026-01-19');
    // 2028 is a leap year: Feb has 29 days.
    expect(addIstDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addIstDays('2028-02-28', 2)).toBe('2028-03-01');
    // 2027 is not: Feb has 28 days.
    expect(addIstDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('is its own inverse for zero and mirrored days', () => {
    expect(addIstDays('2026-09-04', 0)).toBe('2026-09-04');
    expect(addIstDays(addIstDays('2026-09-04', 17), -17)).toBe('2026-09-04');
  });

  it('propagates malformed input unchanged — the API call fails visibly, never a crash', () => {
    // Adversarial: the util is pure and unguarded by design (callers pass
    // server dates). A malformed date must not silently produce a
    // valid-looking neighbouring date, and must not throw (a RangeError from
    // toISOString on NaN would crash the report screen). Returning the input
    // unchanged makes the API call fail with a visible error state instead.
    expect(addIstDays('not-a-date', 5)).toBe('not-a-date');
    expect(addIstDays('', 5)).toBe('');
  });
});

describe('formatIstDateTimeLabel', () => {
  it('renders the IST wall clock regardless of the device timezone', () => {
    // 2026-11-13T14:30Z is 20:00 IST — the whole point of the +5:30 shift:
    // a UTC-machine render must read 8:00 PM on the 13th, not 2:30 PM.
    expect(formatIstDateTimeLabel('2026-11-13T14:30:00Z')).toBe('13 Nov, 8:00 PM');
  });

  it('UPPERCASES the meridiem — the app-wide convention (case-sensitive pin)', () => {
    expect(formatIstDateTimeLabel('2026-11-13T14:30:00Z')).toMatch(/8:00 PM/);
    expect(formatIstDateTimeLabel('2026-11-13T14:30:00Z')).not.toMatch(/pm/);
  });

  it('renders UTC midnight as 5:30 AM on the shifted day (the +5:30 proof)', () => {
    expect(formatIstDateTimeLabel('2026-11-14T00:00:00Z')).toBe('14 Nov, 5:30 AM');
  });

  it('reads midnight IST as 12:xx AM (hour-12 rollover, not hour 0)', () => {
    // 2026-11-13T18:35:00Z = midnight +5m IST.
    expect(formatIstDateTimeLabel('2026-11-13T18:35:00Z')).toBe('14 Nov, 12:05 AM');
  });

  it('returns null on unparseable input (the caller renders nothing, never "NaN")', () => {
    expect(formatIstDateTimeLabel('not-a-date')).toBeNull();
  });
});
