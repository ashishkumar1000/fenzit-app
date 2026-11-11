import {
  buildTodayTiles,
  deriveTodayButtonState,
  formatCountdown,
  formatCountdownWords,
  formatFixAge,
  formatMinutesCompact,
  formatShiftClock,
  formatMetresGrouped,
  snapshotDistanceM,
  messageForApiError,
  needsHolidayConfirm,
  needsLeaveConfirm,
  punchStatusCard,
  tileVerdictText,
} from './attendanceTodayModel';
import { haversineMetres } from '../../../utils/distanceUtils';
import type { AttendanceTodayFacts } from '../../../services/resources/attendanceMe';

/**
 * Story 16-4 — the pure state machine (spec D4) and copy table (spec §4).
 * Tester stance: the state PRIORITY is the contract (offline > location >
 * rate-limit > latches > done > ready), the copy for catalogued outcomes
 * is the SERVER's verbatim (the AC's "exact PRD-specified message"), and
 * the countdown clamps (a time-bound disabled state must never turn
 * indefinite). If the implementation changed but the AC did not, these
 * must still pass.
 */

const base = {
  permission: 'granted' as const,
  online: true,
  factsKnown: true,
  record: null,
  resolving: false,
  dialogPending: false,
  rateLimitedUntil: null,
  now: 1_000_000,
};

const openRecord = {
  checkinAt: '2026-09-29T10:16:00+05:30',
  checkoutAt: null,
  lateMinutes: 61,
  isLate: true,
  workedMinutes: null,
  earlyCheckout: null,
  earlyCheckoutMinutes: null,
};

const closedRecord = {
  ...openRecord,
  checkoutAt: '2026-09-29T18:05:00+05:30',
  workedMinutes: 469,
  earlyCheckout: false,
  earlyCheckoutMinutes: null,
};

describe('deriveTodayButtonState — the priority ladder (first match wins)', () => {
  it('a plain working day with no record → readyIn', () => {
    expect(deriveTodayButtonState(base)).toEqual({ kind: 'readyIn' });
  });

  it('offline beats EVERYTHING (even resolving) — a doomed request must never be shown as progress', () => {
    expect(
      deriveTodayButtonState({ ...base, online: false, resolving: true }),
    ).toEqual({ kind: 'offline', action: 'in' });
  });

  it.each([
    ['denied', 'permissionDenied'],
    ['preciseOff', 'preciseOff'],
    ['serviceOff', 'serviceOff'],
  ] as const)('location state %s blocks before any readiness state', (permission, kind) => {
    expect(deriveTodayButtonState({ ...base, permission })).toEqual({
      kind,
      action: 'in',
    });
  });

  it('a LIVE rate limit outranks ready (its disabled-ness is time-bound)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 60_000,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'in' });
    // While checked in, the pending action outlives the block: the
    // blocked button is a blocked CHECK OUT.
    expect(
      deriveTodayButtonState({
        ...base,
        record: openRecord,
        rateLimitedUntil: base.now + 60_000,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'out' });
  });

  it('an EXPIRED rate limit falls through to readiness (the block self-lifts)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now - 1,
      }),
    ).toEqual({ kind: 'readyIn' });
  });

  it('the rate-limit remaining CLAMPS to the awarded window (a backward clock change can never extend the block)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 999_999_000, // clock tampered far ahead
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 600, action: 'in' }); // MAX_RATE_WINDOW_S
  });

  it('the dialog latch and resolving are momentary and outrank the record state', () => {
    expect(
      deriveTodayButtonState({ ...base, dialogPending: true, record: openRecord }),
    ).toEqual({ kind: 'dialogPending', action: 'out' });
    expect(
      deriveTodayButtonState({ ...base, resolving: true, record: openRecord }),
    ).toEqual({ kind: 'resolving', action: 'out' });
  });

  it('done outranks EVERY blocker — a finished day has no action left to block (2026-11-10 device-pass find)', () => {
    expect(
      deriveTodayButtonState({ ...base, record: closedRecord, online: false }),
    ).toEqual({ kind: 'done' });
    expect(
      deriveTodayButtonState({
        ...base,
        record: closedRecord,
        permission: 'serviceOff',
      }),
    ).toEqual({ kind: 'done' });
    expect(
      deriveTodayButtonState({
        ...base,
        record: closedRecord,
        rateLimitedUntil: base.now + 60_000,
      }),
    ).toEqual({ kind: 'done' });
  });

  it('a closed record → done; an open record → readyOut (the button flips, never shows both)', () => {
    expect(deriveTodayButtonState({ ...base, record: closedRecord })).toEqual({
      kind: 'done',
    });
    expect(deriveTodayButtonState({ ...base, record: openRecord })).toEqual({
      kind: 'readyOut',
    });
  });

  it('facts UNKNOWN (first load in flight) gates nothing visible but the copy path — the VIEW disables the button', () => {
    // The model still answers readyIn; the interactive gate is the view's
    // factsKnown → enabled prop (the split is deliberate: the model is
    // pure truth, the view adds the gate).
    expect(deriveTodayButtonState({ ...base, factsKnown: false })).toEqual({
      kind: 'readyIn',
    });
  });
});

describe('messageForApiError — the copy table (server-verbatim for catalogued codes)', () => {
  it('the four location outcomes render the server message VERBATIM (the AC demands the exact PRD message)', () => {
    const tooFar = {
      code: 'ATTENDANCE_TOO_FAR',
      message: 'You are 1357 m from Hero wala. Move within 150 m.',
    };
    expect(messageForApiError(tooFar)).toEqual({
      tone: 'error',
      text: 'You are 1357 m from Hero wala. Move within 150 m.',
    });
    expect(
      messageForApiError({
        code: 'ATTENDANCE_LOW_ACCURACY',
        message: 'Location not accurate enough, try again in the open',
      }),
    ).toMatchObject({ tone: 'error' });
  });

  it('rate limited keeps the server copy (with the live count), tone error', () => {
    expect(
      messageForApiError({
        code: 'ATTENDANCE_RATE_LIMITED',
        message: 'Too many attempts. Try again in 10 min',
        retryAfterSeconds: 600,
      }),
    ).toEqual({
      tone: 'error',
      text: 'Too many attempts. Try again in 10 min',
    });
  });

  it('leave_confirmation_required has NO entry — the 17-8 holding string is RETIRED (the AC copy lives only in the leave dialog)', () => {
    // A 409 that reaches this table is the TERMINAL posture (a
    // flag-carrying retry cannot 409): the generic server-message error,
    // never dialog copy outside a dialog, never a re-dialog.
    const msg = messageForApiError({
      code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED',
      message: 'You have leave today. Confirm to cancel it and check in',
    });
    expect(msg).toEqual({
      tone: 'error',
      text: 'You have leave today. Confirm to cancel it and check in',
    });
  });

  it('an empty-message leave 409 falls to the shared generic line (never renders nothing)', () => {
    expect(
      messageForApiError({ code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED', message: '' }),
    ).toEqual({
      tone: 'error',
      text: 'Something went wrong with that request.',
    });
  });

  it('transport errors (NETWORK_ERROR/TIMEOUT) surface their own toApiError copy', () => {
    expect(
      messageForApiError({
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check your connection and try again.',
      }),
    ).toMatchObject({ text: 'Could not reach the server. Check your connection and try again.' });
  });
});

describe('needsHolidayConfirm — the 16-4 pre-flight scope', () => {
  const facts = (over: Partial<AttendanceTodayFacts>): AttendanceTodayFacts => ({
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
    leaveState: null,
    leavePart: null,
    ...over,
  });

  it('a weekly off OR a holiday today asks; a working day does not', () => {
    expect(needsHolidayConfirm(facts({ isWeeklyOff: true }))).toBe(true);
    expect(needsHolidayConfirm(facts({ isHoliday: true }))).toBe(true);
    expect(needsHolidayConfirm(facts({}))).toBe(false);
  });

  it('facts ABSENT (undefined = pre-16-4 backend) never asks — the server still records the truth', () => {
    expect(needsHolidayConfirm(undefined)).toBe(false);
    expect(needsHolidayConfirm(null)).toBe(false);
  });
});

describe('needsLeaveConfirm — byte-parity with the BE D11 gate (17-8 D2)', () => {
  /**
   * The BE gate VERBATIM (fenzit-be `check-in-out.service.ts:186-195`,
   * the `leaveGateActive` block):
   *
   *   const leaveGateActive =
   *     kind === 'check_in' &&
   *     ctx.leaveState !== null &&
   *     ctx.leavePart === 'full_day' &&
   *     ctx.isWorkingDay;
   *
   * Mirrored here conjunct-for-conjunct so any FE drift against the
   * recorded gate fails this test (the spec's byte-parity demand).
   * The BE copy is hand-retyped — a BE-side drift fails nothing HERE
   * (separate repos): there the BE's own suite catches it, and at
   * runtime the authoritative server gate + the wire-driven 409
   * fallback remain the net.
   */
  function beLeaveGate(input: {
    kind: 'check_in' | 'check_out';
    isWorkingDay: boolean;
    leaveState: 'pending' | 'approved' | null;
    leavePart: 'full_day' | 'first_half' | 'second_half' | null;
  }): boolean {
    const leaveGateActive =
      input.kind === 'check_in' &&
      input.leaveState !== null &&
      input.leavePart === 'full_day' &&
      input.isWorkingDay;
    return leaveGateActive;
  }

  const facts = (over: Partial<AttendanceTodayFacts>): AttendanceTodayFacts => ({
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
    leaveState: null,
    leavePart: null,
    ...over,
  });

  it('the FULL truth table (2 kinds × 2 working-day × 3 states × 4 parts) matches the service condition exactly', () => {
    const kinds = ['check_in', 'check_out'] as const;
    const states = [null, 'pending', 'approved'] as const;
    const parts = [null, 'full_day', 'first_half', 'second_half'] as const;
    let rows = 0;
    for (const kind of kinds) {
      for (const isWorkingDay of [true, false]) {
        for (const leaveState of states) {
          for (const leavePart of parts) {
            const today = facts({ isWorkingDay, leaveState, leavePart });
            expect(needsLeaveConfirm(today, kind)).toBe(
              beLeaveGate({ kind, isWorkingDay, leaveState, leavePart }),
            );
            rows += 1;
          }
        }
      }
    }
    expect(rows).toBe(48);
  });

  it('each conjunct is load-bearing (the readable four rows of the matrix)', () => {
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day' }), 'check_in')).toBe(true);
    expect(needsLeaveConfirm(facts({ leaveState: 'pending', leavePart: 'full_day' }), 'check_in')).toBe(true);
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day' }), 'check_out')).toBe(false);
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day', isWorkingDay: false }), 'check_in')).toBe(false);
  });

  it('half-day parts are strictly NOTHING — first_half and second_half never ask (FR-9 pass-through is structural)', () => {
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'first_half' }), 'check_in')).toBe(false);
    expect(needsLeaveConfirm(facts({ leaveState: 'pending', leavePart: 'second_half' }), 'check_in')).toBe(false);
  });

  it('cancelled/revoked reads null (the post-auto-cancel shape) — no dialog', () => {
    expect(needsLeaveConfirm(facts({}), 'check_in')).toBe(false);
  });

  it('legacy absence: today undefined/null never asks; leaveState ABSENT on the wire (pre-17-8 sub-field) never asks', () => {
    expect(needsLeaveConfirm(undefined, 'check_in')).toBe(false);
    expect(needsLeaveConfirm(null, 'check_in')).toBe(false);
    const legacySubfield = facts({}) as Partial<AttendanceTodayFacts>;
    delete legacySubfield.leaveState;
    delete legacySubfield.leavePart;
    expect(needsLeaveConfirm(legacySubfield as AttendanceTodayFacts, 'check_in')).toBe(false);
  });

  it('needsLeaveConfirm and needsHolidayConfirm are MUTUALLY EXCLUSIVE (the isWorkingDay conjunct) — no ladder-order rule exists', () => {
    // Well-formed facts couple isWorkingDay = !isWeeklyOff && !isHoliday,
    // so on any day the leave predicate can fire, the holiday one cannot.
    const onLeaveWorkingDay = facts({ leaveState: 'approved', leavePart: 'full_day' });
    expect(needsLeaveConfirm(onLeaveWorkingDay, 'check_in')).toBe(true);
    expect(needsHolidayConfirm(onLeaveWorkingDay)).toBe(false);
    // The off-day-inside-leave shape (the D1 read does not filter on
    // working-day): leaveState non-null, isWorkingDay false — the HOLIDAY
    // dialog owns the day, exactly as the BE gate behaves.
    const offDayInsideLeave = facts({
      isWeeklyOff: true,
      isWorkingDay: false,
      leaveState: 'approved',
      leavePart: 'full_day',
    });
    expect(needsLeaveConfirm(offDayInsideLeave, 'check_in')).toBe(false);
    expect(needsHolidayConfirm(offDayInsideLeave)).toBe(true);
  });
});

describe('countdown and checked-in formatting', () => {
  it('formatCountdown renders M:SS and clamps negatives', () => {
    expect(formatCountdown(527)).toBe('8:47');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('the countdown announces in WORDS for a11y (an M:SS chip is unreadable through a screen reader)', () => {
    expect(formatCountdownWords(60)).toBe('Try again in 1 minute');
    expect(formatCountdownWords(600)).toBe('Try again in 10 minutes');
  });
});

describe('buildTodayTiles — the punch card\'s data (2026-11-10 tiles + severity)', () => {
  const formatTime = (iso: string) => (iso.includes('10:16') ? '10:16 AM' : '6:05 PM');
  const schedule = {
    endText: '6:30 PM',
    rangeText: '9:30 AM - 6:30 PM',
    spanMinutes: 540,
  };

  it('a closed record builds both tile times, verdicts and the WORKED chip (a short day)', () => {
    expect(buildTodayTiles(closedRecord, formatTime, schedule)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: '6:05 PM',
      checkinVerdict: { kind: 'late', minutes: 61 },
      checkoutVerdict: { kind: 'onTime' },
      checkoutHintMeridiem: 'PM',
      worked: {
        value: '7h 49m',
        caption: 'Short by 1h 11m',
        full: false,
        shortfallMinutes: 71,
      },
    });
  });

  it('a MID-SESSION record still builds the card — pending checkout, dashed placeholder hint, no worked chip yet', () => {
    expect(buildTodayTiles(openRecord, formatTime, schedule)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: null,
      checkinVerdict: { kind: 'late', minutes: 61 },
      checkoutVerdict: { kind: 'pending' },
      checkoutHintMeridiem: 'PM',
      worked: null,
    });
  });

  it('a FULL shift celebrates: "Full shift completed • Sched …" with no shortfall', () => {
    const tiles = buildTodayTiles({ ...closedRecord, workedMinutes: 540 }, formatTime, schedule);
    expect(tiles.worked).toEqual({
      value: '9h 00m',
      caption: 'Full shift completed • Sched 9:30 AM - 6:30 PM',
      full: true,
      shortfallMinutes: null,
    });
  });

  it('EARLY severity: crossing the shift midpoint is MAJOR, under it minor, no schedule never majors', () => {
    const record = { ...closedRecord, isLate: false, lateMinutes: 0 };
    // 330 min early of the 540-min span — past the 270 midpoint → red.
    expect(
      buildTodayTiles({ ...record, earlyCheckout: true, earlyCheckoutMinutes: 330 }, formatTime, schedule)
        .checkoutVerdict,
    ).toEqual({ kind: 'early', minutes: 330, major: true });
    // The boundary: exactly HALF the span early is major (half the shift or less worked).
    expect(
      buildTodayTiles({ ...record, earlyCheckout: true, earlyCheckoutMinutes: 270 }, formatTime, schedule)
        .checkoutVerdict,
    ).toEqual({ kind: 'early', minutes: 270, major: true });
    // Under it — the ordinary amber early leave.
    expect(
      buildTodayTiles({ ...record, earlyCheckout: true, earlyCheckoutMinutes: 269 }, formatTime, schedule)
        .checkoutVerdict,
    ).toEqual({ kind: 'early', minutes: 269, major: false });
    // A legacy wire without a span cannot draw the line — minor, always.
    expect(
      buildTodayTiles({ ...record, earlyCheckout: true, earlyCheckoutMinutes: 330 }, formatTime, null)
        .checkoutVerdict,
    ).toEqual({ kind: 'early', minutes: 330, major: false });
  });

  it('no schedule on the wire (legacy) → value-only chips, plain caption, no meridiem hint', () => {
    const tiles = buildTodayTiles(openRecord, formatTime, null);
    expect(tiles).toEqual({
      checkinText: '10:16 AM',
      checkoutText: null,
      checkinVerdict: { kind: 'late', minutes: 61 },
      checkoutVerdict: { kind: 'pending' },
      checkoutHintMeridiem: null,
      worked: null,
    });
    const closed = buildTodayTiles(closedRecord, formatTime, {
      endText: null,
      rangeText: null,
      spanMinutes: null,
    });
    expect(closed.worked).toEqual({
      value: '7h 49m',
      caption: 'Shift duration',
      full: false,
      shortfallMinutes: null,
    });
    expect(closed.checkoutHintMeridiem).toBeNull();
  });

  it('a corrupt worked value (non-finite) renders no chip — never a negative or NaN string', () => {
    expect(
      buildTodayTiles({ ...closedRecord, workedMinutes: Number.NaN } as never, formatTime, schedule),
    ).toMatchObject({ worked: null });
  });
});

describe('tileVerdictText — the tiles\' verdict copy (2026-11-10 redesign)', () => {
  it('onTime / late / early / pending render the mockup\'s lines', () => {
    expect(tileVerdictText({ kind: 'onTime' })).toBe('On time');
    expect(tileVerdictText({ kind: 'late', minutes: 52 })).toBe('Late by 52 min');
    expect(tileVerdictText({ kind: 'early', minutes: 390 })).toBe('Early by 6h 30m');
    expect(tileVerdictText({ kind: 'pending' })).toBeNull();
  });
});

describe('formatMinutesCompact + formatShiftClock — the chips\' formats', () => {
  it('compact minutes: sub-hour reads "N min", hours read "Xh YYm" (minutes padded past the hour)', () => {
    expect(formatMinutesCompact(1)).toBe('1 min');
    expect(formatMinutesCompact(47)).toBe('47 min');
    expect(formatMinutesCompact(478)).toBe('7h 58m');
    expect(formatMinutesCompact(120)).toBe('2h 00m');
    expect(formatMinutesCompact(0)).toBe('0 min');
    expect(formatMinutesCompact(-5)).toBe('0 min');
  });

  it('shift clock: "09:30"+15 → "9:45 AM" (the late-after start), "18:30" → "6:30 PM", midnight and malformed fail safe', () => {
    expect(formatShiftClock('09:30', 15)).toBe('9:45 AM');
    expect(formatShiftClock('09:30')).toBe('9:30 AM');
    expect(formatShiftClock('18:30')).toBe('6:30 PM');
    expect(formatShiftClock('00:15')).toBe('12:15 AM');
    expect(formatShiftClock('12:00')).toBe('12:00 PM');
    expect(formatShiftClock('25:00')).toBe('1:00 AM'); // wraps, never crashes
    expect(formatShiftClock('nope')).toBeNull();
    expect(formatShiftClock('')).toBeNull();
  });
});

// --- 20-3 → 2026-11 simplification: the prescreen snapshot (no client
// --- lock — the fence verdict is card copy, never a button posture) -----

/** Office at (12, 77); IN_FIX sits ~28.5 m north of it — inside the
 *  150 m fence; OUT_FIX ~1.35 km north — far outside it. Fixes are 30 s
 *  old (fresh: no age caption) unless a test overrides capturedAt. */
const OFFICE = { latitude: 12.0, longitude: 77.0, radiusM: 150, name: 'Hero wala' };
const IN_FIX = { latitude: 12.000256, longitude: 77.0, capturedAt: base.now - 30_000 };
const OUT_FIX = { latitude: 12.0122, longitude: 77.0, capturedAt: base.now - 30_000 };

describe('deriveTodayButtonState — the fence NEVER blocks the button (2026-11 simplification)', () => {
  it('the plain ready rungs are unconditional once facts are known — the press decides, the server gates', () => {
    expect(deriveTodayButtonState(base)).toEqual({ kind: 'readyIn' });
    expect(deriveTodayButtonState({ ...base, record: openRecord })).toEqual({
      kind: 'readyOut',
    });
  });

  it('the ladder above readiness is untouched: offline, rate-limit and done outrank everything', () => {
    expect(
      deriveTodayButtonState({ ...base, online: false }),
    ).toEqual({ kind: 'offline', action: 'in' });
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 60_000,
        record: openRecord,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'out' });
    expect(
      deriveTodayButtonState({ ...base, record: closedRecord }),
    ).toEqual({ kind: 'done' });
  });
});

describe('snapshotDistanceM — the status card input (no freshness cap)', () => {
  it('answers the straight-line distance for any fix + office with a radius', () => {
    expect(snapshotDistanceM(IN_FIX, OFFICE)).toBe(
      haversineMetres(IN_FIX, OFFICE),
    );
    // An hour-old fix still speaks — the card captions its age instead.
    const hourOld = { ...IN_FIX, capturedAt: base.now - 3_600_000 };
    expect(snapshotDistanceM(hourOld, OFFICE)).toBe(
      haversineMetres(hourOld, OFFICE),
    );
  });

  it('null when there is nothing to judge — no fix, no office, radiusless office', () => {
    expect(snapshotDistanceM(null, OFFICE)).toBeNull();
    expect(snapshotDistanceM(IN_FIX, null)).toBeNull();
    expect(snapshotDistanceM(IN_FIX, { ...OFFICE, radiusM: null })).toBeNull();
  });
});

describe('formatFixAge — the card caption', () => {
  it('a fix younger than a minute carries NO caption (it would just be noise)', () => {
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now }, base.now)).toBeNull();
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now - 59_000 }, base.now)).toBeNull();
  });

  it('minutes and hours render human captions', () => {
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now - 60_000 }, base.now)).toBe(
      'Checked 1 min ago',
    );
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now - 1_800_000 }, base.now)).toBe(
      'Checked 30 min ago',
    );
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now - 7_200_000 }, base.now)).toBe(
      'Checked 2 h ago',
    );
  });

  it('no fix / a future-stamped fix (backward clock step) never captions', () => {
    expect(formatFixAge(null, base.now)).toBeNull();
    expect(formatFixAge({ ...IN_FIX, capturedAt: base.now + 60_000 }, base.now)).toBeNull();
  });
});

describe('formatMetresGrouped — the at-office card\'s plain metres', () => {
  it('rounds to whole metres, groups thousands, spells "meters" (owner copy 2026-11-10)', () => {
    expect(formatMetresGrouped(0)).toBe('0 meters');
    expect(formatMetresGrouped(28)).toBe('28 meters');
    expect(formatMetresGrouped(1357)).toBe('1,357 meters');
    expect(formatMetresGrouped(1355.4)).toBe('1,355 meters');
    expect(formatMetresGrouped(-3)).toBe('0 meters');
  });
});

describe('punchStatusCard — the snapshot-verdict table, copy verbatim', () => {
  const flat = (c: { segments: { text: string }[] }) =>
    c.segments.map(s => s.text).join('');

  it('readyIn in-fence → the green card, the OWNER\'S VERBATIM COPY (2026-11-10)', () => {
    const card = punchStatusCard({
      state: { kind: 'readyIn' },
      fix: IN_FIX,
      office: OFFICE,
      now: base.now,
    });
    expect(card).toMatchObject({
      tone: 'done',
      title: "You're at the office",
    });
    expect(flat(card!)).toBe(
      `You're at Hero wala, just ${formatMetresGrouped(
        haversineMetres(IN_FIX, OFFICE),
      )} away. Your location is verified.`,
    );
  });

  it('readyIn OUT-of-fence → the red TOO FAR card under the still-ready button (no lock — advice, not a gate)', () => {
    const card = punchStatusCard({
      state: { kind: 'readyIn' },
      fix: OUT_FIX,
      office: OFFICE,
      now: base.now,
    });
    expect(card).toMatchObject({
      tone: 'cancelled',
      title: 'Too far from Hero wala',
    });
    expect(flat(card!)).toBe(
      'You are 1.4 km from Hero wala. Go closer, then check in.',
    );
  });

  it('readyOut renders NO card — the tiles own the check-in time, the button owns the action (owner decision 2026-11-10)', () => {
    expect(
      punchStatusCard({
        state: { kind: 'readyOut' },
        fix: IN_FIX,
        office: OFFICE,
        now: base.now,
      }),
    ).toBeNull();
    expect(
      punchStatusCard({
        state: { kind: 'readyOut' },
        fix: OUT_FIX,
        office: OFFICE,
        now: base.now,
      }),
    ).toBeNull();
  });

  it('a stale fix captions its age on the TOO-FAR card — but NEVER on the green card (owner copy has no age line)', () => {
    const old = { ...IN_FIX, capturedAt: base.now - 1_800_000 }; // 30 min
    const green = punchStatusCard({
      state: { kind: 'readyIn' },
      fix: old,
      office: OFFICE,
      now: base.now,
    });
    expect(flat(green!)).toBe(
      `You're at Hero wala, just ${formatMetresGrouped(
        haversineMetres(old, OFFICE),
      )} away. Your location is verified.`,
    );
    const far = punchStatusCard({
      state: { kind: 'readyIn' },
      fix: { ...OUT_FIX, capturedAt: base.now - 1_800_000 },
      office: OFFICE,
      now: base.now,
    });
    expect(flat(far!)).toBe(
      'You are 1.4 km from Hero wala. Go closer, then check in. Checked 30 min ago.',
    );
  });

  it('serviceOff is the RED blocker card; denied/preciseOff stay neutral (2026-11-10 owner decisions)', () => {
    const blocker = punchStatusCard({
      state: { kind: 'serviceOff', action: 'in' },
      fix: null,
      office: OFFICE,
      now: base.now,
    });
    expect(blocker).toMatchObject({ tone: 'blocker', title: 'Location is off' });
    expect(flat(blocker!)).toBe(
      'Turn on your location to verify your office presence and mark attendance.',
    );
    const denied = punchStatusCard({
      state: { kind: 'permissionDenied', action: 'in' },
      fix: null,
      office: null,
      now: base.now,
    });
    expect(flat(denied!)).toBe(
      'Attendance needs your location to check in and out. You can still view your records and apply for leave without it.',
    );
    const preciseOut = punchStatusCard({
      state: { kind: 'preciseOff', action: 'out' },
      fix: null,
      office: null,
      now: base.now,
    });
    expect(flat(preciseOut!)).toBe('Turn on precise location to check out');
  });

  it('the row-5 postures carry the EXISTING remediation copy in the neutral card', () => {
    const offline = punchStatusCard({
      state: { kind: 'offline', action: 'in' },
      fix: null,
      office: null,
      now: base.now,
    });
    expect(flat(offline!)).toBe(
      "You're offline. Check-in needs a working connection.",
    );
    const rateLimited = punchStatusCard({
      state: { kind: 'rateLimited', remainingS: 582, action: 'in' },
      fix: null,
      office: null,
      now: base.now,
    });
    expect(flat(rateLimited!)).toBe('Too many attempts. Try again in 9:42');
    const resolving = punchStatusCard({
      state: { kind: 'resolving', action: 'in' },
      fix: null,
      office: null,
      now: base.now,
    });
    expect(resolving).toMatchObject({ tone: 'neutral', title: 'Getting your location…' });
  });

  it('a ready posture WITHOUT a fix is the getting-location card — never a green lie', () => {
    expect(
      punchStatusCard({
        state: { kind: 'readyIn' },
        fix: null,
        office: OFFICE,
        now: base.now,
        }),
    ).toMatchObject({ tone: 'neutral', title: 'Getting your location…' });
  });

  it('a radiusless office has no fence to judge — the getting-location card, never a verdict', () => {
    expect(
      punchStatusCard({
        state: { kind: 'readyIn' },
        fix: IN_FIX,
        office: { ...OFFICE, radiusM: null },
        now: base.now,
        }),
    ).toMatchObject({ tone: 'neutral', title: 'Getting your location…' });
  });

  it('done and dialogPending render NO card', () => {
    expect(
      punchStatusCard({
        state: { kind: 'done' },
        fix: IN_FIX,
        office: OFFICE,
        now: base.now,
        }),
    ).toBeNull();
    expect(
      punchStatusCard({
        state: { kind: 'dialogPending', action: 'in' },
        fix: IN_FIX,
        office: OFFICE,
        now: base.now,
        }),
    ).toBeNull();
  });

  it('every card announces its title + flat body for screen readers', () => {
    const card = punchStatusCard({
      state: { kind: 'readyIn' },
      fix: OUT_FIX,
      office: OFFICE,
      now: base.now,
    });
    expect(card!.announce).toBe(
      'Too far from Hero wala You are 1.4 km from Hero wala. Go closer, then check in.',
    );
  });
});
