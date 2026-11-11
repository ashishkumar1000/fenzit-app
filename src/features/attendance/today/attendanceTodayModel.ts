/**
 * attendanceTodayModel.ts — the punch button's pure state machine
 * (Story 16-4, spec D4; 20-3 adds the status-card model) and the exact
 * copy table (spec §4).
 *
 * 2026-11-10 simplification (owner decision): the client geofence LOCK is
 * gone. The button is always ready once the day facts are known — the
 * press does its own strict capture and the server gates every punch
 * (too_far no longer counts toward the rate limit, so a blind press can
 * never lock a legitimate employee out). The prescreen fix now only
 * drives the status card's snapshot verdict: inside/outside + distance
 * + a "checked N min ago" caption. No lease, no latch.
 *
 * One derivation function, first match wins:
 *   done → offline → permissionDenied → preciseOff → serviceOff →
 *   rateLimited → dialogPending → resolving → readyOut → readyIn
 *
 * Priority rationale: done replaces the button entirely (never both
 * visible — AC), so it outranks EVERY blocker: a finished day has no
 * action left to block, and must never be asked to go online or fix
 * location (2026-11-10 device pass: a checked-out employee with location
 * off was shown the punch button beside the done tiles). Then offline
 * blocks everything; the location states block the tap legally; the rate
 * limit's disabled-ness is time-bound; dialogPending/resolving are the
 * latches that make double-taps no-ops.
 */
import { haversineMetres } from '../../../utils/distanceUtils';
import type {
  AttendanceTodayFacts,
  AttendanceTodayRecord,
} from '../../../services/resources/attendanceMe';

export type AttendanceLocationPermission =
  | 'granted'
  | 'denied'
  | 'preciseOff'
  | 'serviceOff';

/** A location fix kept by the screen's prescreen capture (the punch
 *  geofence's client-side input). `capturedAt` is epoch ms — freshness is
 *  rechecked against the ticker on every derivation, never stored as a
 *  verdict. */
export interface PunchFixSample {
  latitude: number;
  longitude: number;
  capturedAt: number;
}

/** The anchored office's geofence inputs from the summary. `radiusM` null
 *  (no office / radiusless column / field absent on the wire) = the client
 *  has no fence to judge against — the card shows no verdict and the
 *  server stays authoritative anyway. */
export interface PunchOffice {
  latitude: number;
  longitude: number;
  radiusM: number | null;
  name: string | null;
}

/** Which punch a posture is about. Every blocked or busy posture names its
 *  PENDING action: a block never changes what the employee is trying to do
 *  — while checked in, a blocked or spinning button is a CHECK OUT, never
 *  a "Check in" (the rule rateLimited already carried, generalized
 *  2026-11-10 when the service-off popup surfaced a mid-shift button
 *  labelled "Check in"). */
export type PunchAction = 'in' | 'out';

export type TodayButtonState =
  | { kind: 'offline'; action: PunchAction }
  | { kind: 'permissionDenied'; action: PunchAction }
  | { kind: 'preciseOff'; action: PunchAction }
  | { kind: 'serviceOff'; action: PunchAction }
  | { kind: 'rateLimited'; remainingS: number; action: PunchAction }
  | { kind: 'dialogPending'; action: PunchAction }
  | { kind: 'resolving'; action: PunchAction }
  | { kind: 'done' }
  /** The ready rungs are UNCONDITIONAL once the day facts are known: the
   *  prescreen's fence verdict never blocks the tap — the card speaks and
   *  the server decides the press. */
  | { kind: 'readyOut' }
  | { kind: 'readyIn' };

export interface TodayModelInput {
  permission: AttendanceLocationPermission;
  online: boolean;
  /** True when the summary has LOADED — no interactive check-in before the
   *  day facts are known (the holiday gate must be able to fire). */
  factsKnown: boolean;
  record: AttendanceTodayRecord | null;
  resolving: boolean;
  dialogPending: boolean;
  /** Epoch ms when the rate-limit block lifts; null when not blocked. */
  rateLimitedUntil: number | null;
  now: number;
}

/** The straight-line distance from the prescreen's latest fix to the
 *  office — the status card's snapshot input. null when there is nothing
 *  to judge (no fix / no office / radiusless office). No freshness cap:
 *  the card carries the fix's age in its caption instead. */
export function snapshotDistanceM(
  fix: PunchFixSample | null | undefined,
  office: PunchOffice | null | undefined,
): number | null {
  if (!fix || !office || office.radiusM == null) return null;
  return haversineMetres(fix, office);
}

/** "Checked 4 min ago" for the card caption — null while the fix is
 *  fresh enough (< 1 min) that the caption would just be noise. */
export function formatFixAge(fix: PunchFixSample | null | undefined, now: number): string | null {
  if (!fix) return null;
  const ageS = Math.max(0, Math.round((now - fix.capturedAt) / 1000));
  if (ageS < 60) return null;
  if (ageS < 3600) {
    const m = Math.floor(ageS / 60);
    return `Checked ${m} min ago`;
  }
  const h = Math.floor(ageS / 3600);
  return `Checked ${h} h ago`;
}

export function deriveTodayButtonState(input: TodayModelInput): TodayButtonState {
  if (input.record?.checkoutAt) return { kind: 'done' };
  const action: PunchAction = input.record ? 'out' : 'in';
  if (!input.online) return { kind: 'offline', action };
  if (input.permission === 'denied') return { kind: 'permissionDenied', action };
  if (input.permission === 'preciseOff') return { kind: 'preciseOff', action };
  if (input.permission === 'serviceOff') return { kind: 'serviceOff', action };
  if (input.rateLimitedUntil !== null && input.rateLimitedUntil > input.now) {
    return {
      kind: 'rateLimited',
      // Clamped to the awarded window: a backward clock change can push the
      // raw delta past it, and a time-bound disabled state must never turn
      // indefinite.
      remainingS: Math.min(
        Math.ceil((input.rateLimitedUntil - input.now) / 1000),
        MAX_RATE_WINDOW_S,
      ),
      action,
    };
  }
  if (input.dialogPending) return { kind: 'dialogPending', action };
  if (input.resolving) return { kind: 'resolving', action };
  if (!input.factsKnown) {
    // Facts unknown (first load in flight or failed) — the button is not
    // interactive until the holiday gate COULD fire. Rendered as readyIn
    // but disabled via factsKnown by the caller.
    return { kind: 'readyIn' };
  }
  return input.record ? { kind: 'readyOut' } : { kind: 'readyIn' };
}

/** The PRD's rate window (16-1 D6) — the fallback when the Retry-After
 *  header is missing, and the countdown clamp ceiling. */
export const MAX_RATE_WINDOW_S = 600;

/** The countdown label, "Try again in 9:42" (M:SS). A clamped, always-
 *  finite remaining: 0 renders as 0:00, negatives never leak. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.trunc(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The countdown in words for the screen-reader announcement ("Try again
 *  in 9 minutes") — an M:SS chip is unreadable through a11y. */
export function formatCountdownWords(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(Math.max(0, totalSeconds) / 60));
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Below-button message per settled outcome (server copy is verbatim —
 *  the AC's "exact PRD-specified message" travels in ApiError.message). */
export type TodayOutcomeMessage =
  | { tone: 'error'; text: string }
  | { tone: 'info'; text: string };

export function messageForApiError(err: {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}): TodayOutcomeMessage {
  switch (err.code) {
    case 'ATTENDANCE_RATE_LIMITED':
      return {
        tone: 'error',
        text: err.message || 'Too many attempts. Try again in 10 minutes.',
      };
    default:
      // Every catalogued code carries its own PRD copy server-side
      // ("You are 600 m from …", "Check in before checking out", …);
      // transport errors carry their own copy from toApiError. An empty
      // message (a non-ApiError rejection) falls back to the shared line
      // rather than rendering nothing.
      //
      // ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED (17-8 D4) has NO entry
      // here on purpose: its AC copy lives in exactly one place — the
      // leave dialog. A 409 with that code is intercepted by the hook's
      // press continuation (the awaited wire-driven fallback); one that
      // still reaches this table is the terminal posture (a flag-carrying
      // retry cannot 409) and renders the generic server-message error.
      return {
        tone: 'error',
        text: err.message || 'Something went wrong with that request.',
      };
  }
}

/** One stat chip in the punch card's chips row (2026-11-10 redesign):
 *  an uppercase label, a big compact value and a small caption. */
export interface TodayTileChip {
  value: string;
  caption: string | null;
}

/** The WORKED chip — a TodayTileChip plus the full-shift verdict. `full`
 *  compares worked minutes against the shift span, mirroring how the
 *  day's schedule defines a full shift. `shortfallMinutes` is the
 *  quantified gap (span − worked) on a short day — the card tones the
 *  chip amber and captions "Short by …"; null on a full day or when no
 *  schedule is on the wire (the chip then stays neutral — it never
 *  celebrates a day it cannot judge). */
export interface WorkedTileChip extends TodayTileChip {
  full: boolean;
  shortfallMinutes?: number | null;
}

/** The per-punch verdict line under a tile's time (owner mockup
 *  2026-11-10): the tile itself carries the punctuality truth, replacing
 *  the LATE BY / EARLY BY chips that used to repeat it below the tiles.
 *  Derived from the BE's own day flags, so it holds on legacy summaries
 *  with no schedule on the wire too. */
export type TodayTileVerdict =
  | { kind: 'onTime' }
  | { kind: 'pending' }
  | { kind: 'late'; minutes: number }
  | { kind: 'early'; minutes: number; major?: boolean };

/** The verdict's copy ("On time" / "Late by 52 min" / "Early by 14 min").
 *  `pending` renders as the grey Pending pill instead of text — null here.
 *  Severity rides the early variant's `major`: leaving at or before the
 *  shift MIDPOINT (early minutes ≥ half the span — the same half-day line
 *  the backend's FR-7 midpoint draws) means half the shift or less was
 *  worked, and the tile inks the verdict red; a smaller early leave stays
 *  amber. Absent `major` (or no schedule on the wire to draw the line)
 *  always renders the minor amber. */
export function tileVerdictText(verdict: TodayTileVerdict): string | null {
  switch (verdict.kind) {
    case 'onTime':
      return 'On time';
    case 'late':
      return `Late by ${formatMinutesCompact(verdict.minutes)}`;
    case 'early':
      return `Early by ${formatMinutesCompact(verdict.minutes)}`;
    case 'pending':
      return null;
  }
}

/** The punch card's data — the two tile times with their per-punch
 *  verdicts and the lone WORKED stat. Built for EVERY record state
 *  (checked-in-only included: the checkout tile reads the dashed
 *  placeholder and the Pending pill), so the mid-session card and the
 *  button coexist. */
export interface TodayTilesModel {
  /** Tile times, "4:06 AM" — null renders the dashed placeholder. */
  checkinText: string | null;
  checkoutText: string | null;
  /** Under-time verdicts. Check-in is never pending (the card only
   *  renders once a record exists); check-out stays pending until the
   *  punch lands. */
  checkinVerdict: TodayTileVerdict;
  checkoutVerdict: TodayTileVerdict;
  /** The shift-end meridiem ("PM") shown beside the empty checkout
   *  placeholder; null without schedule on the wire. */
  checkoutHintMeridiem: string | null;
  /** WORKED — the one chip under the divider; null until check-out lands
   *  (minutes unknown). */
  worked: WorkedTileChip | null;
}

/** The chips' compact minute format ("1 min" / "47 min" / "7h 13m" /
 *  "8h 00m") — minutes padded to two digits past the hour, per the
 *  mockups. */
export function formatMinutesCompact(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h}h ${String(rest).padStart(2, '0')}m`;
}

/** "09:30" (+ offset minutes) → "9:45 AM" — the shift clock the chips
 *  caption ("Sched 9:45 AM"). Wall-clock only; null on a malformed input. */
export function formatShiftClock(hhmm: string, addMinutes = 0): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + addMinutes;
  if (!Number.isFinite(total)) return null;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${meridiem}`;
}

/** The shift span in minutes ("09:00" → "17:00" = 480) — the full-shift
 *  threshold the WORKED chip's `full` verdict compares against. null when
 *  either bound is malformed or the span is not positive. */
export function shiftSpanMinutes(startHhmm: string, endHhmm: string): number | null {
  const parse = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!match) return null;
    const total = Number(match[1]) * 60 + Number(match[2]);
    return Number.isFinite(total) ? total : null;
  };
  const start = parse(startHhmm);
  const end = parse(endHhmm);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

/** The shift schedule preformatted by the caller (wall-clock rendering is
 *  a view concern): the full-shift WORKED card captions the raw range and
 *  compares against the span, and the end text seeds the empty checkout
 *  tile's meridiem hint ("PM"). Lateness is NOT judged here — the server's
 *  isLate/lateMinutes own it. */
export interface TodayTilesSchedule {
  endText: string | null;
  /** "9:00 AM - 5:00 PM" — the raw shift range. */
  rangeText: string | null;
  /** end − start in minutes; the full-shift threshold. */
  spanMinutes: number | null;
}

export function buildTodayTiles(
  record: AttendanceTodayRecord,
  formatTime: (iso: string) => string | null,
  schedule?: TodayTilesSchedule | null,
): TodayTilesModel {
  const spanMinutes = schedule?.spanMinutes ?? null;
  const worked =
    record.workedMinutes !== null && Number.isFinite(record.workedMinutes)
      ? (() => {
          const full = spanMinutes !== null && record.workedMinutes >= spanMinutes;
          const shortfallMinutes =
            spanMinutes !== null && !full
              ? Math.max(0, spanMinutes - record.workedMinutes)
              : null;
          return {
            value: formatMinutesCompact(record.workedMinutes),
            caption:
              full && schedule?.rangeText
                ? `Full shift completed • Sched ${schedule.rangeText}`
                : shortfallMinutes !== null
                  ? `Short by ${formatMinutesCompact(shortfallMinutes)}`
                  : 'Shift duration',
            full,
            shortfallMinutes,
          };
        })()
      : null;
  const checkinVerdict: TodayTileVerdict =
    record.isLate && record.lateMinutes !== null && record.lateMinutes > 0
      ? { kind: 'late', minutes: record.lateMinutes }
      : { kind: 'onTime' };
  const halfSpanMinutes = spanMinutes !== null ? spanMinutes / 2 : null;
  const checkoutVerdict: TodayTileVerdict = !record.checkoutAt
    ? { kind: 'pending' }
    : record.earlyCheckout &&
        record.earlyCheckoutMinutes !== null &&
        record.earlyCheckoutMinutes > 0
      ? {
          kind: 'early',
          minutes: record.earlyCheckoutMinutes,
          major:
            halfSpanMinutes !== null &&
            record.earlyCheckoutMinutes >= halfSpanMinutes,
        }
      : { kind: 'onTime' };
  const endText = schedule?.endText ?? null;
  const endSpace = endText ? endText.lastIndexOf(' ') : -1;
  return {
    checkinText: formatTime(record.checkinAt),
    checkoutText: record.checkoutAt ? formatTime(record.checkoutAt) : null,
    checkinVerdict,
    checkoutVerdict,
    checkoutHintMeridiem:
      endText && endSpace > 0 ? endText.slice(endSpace + 1) : null,
    worked,
  };
}

/** The offline block message (one string, three call sites in the hook). */
export const offlineMessage = "You're offline. Check-in needs a working connection.";

/** The capture-failure copy per union member (UX table verbatim). */
export function captureFailureMessage(failure: unknown): string {
  switch (failure) {
    case 'timeout':
      return "Couldn't get your location. Move to an open area and try again.";
    case 'permission':
      return 'Attendance needs your location to check in and out. You can still view your records and apply for leave without it.';
    case 'unavailable':
      return 'Location services are unavailable. Turn on location and try again.';
    case 'stale':
      return 'Your location seems outdated. Please try again';
    default:
      return 'Could not determine your location. Try again.';
  }
}

/** True when the tap needs the holiday/weekly-off pre-flight confirm
 *  (16-4 scope). `today` absent (legacy backend) never asks — the server
 *  still records the truth. Mutually exclusive with `needsLeaveConfirm`
 *  by construction: this is true only when `isWorkingDay` is false, and
 *  the leave predicate requires it true — there IS no ladder-order rule
 *  to pin (leave + holiday can only ever surface the holiday dialog,
 *  exactly as the BE gate behaves). */
export function needsHolidayConfirm(
  today: AttendanceTodayFacts | null | undefined,
): boolean {
  if (!today) return false;
  return today.isWeeklyOff || today.isHoliday;
}

// --- The punch status card (the approved mockup's four geofence states,
// --- copy verbatim; every other posture carries its existing copy). ----

/** `blocker` shares the red family with `cancelled` but is a different
 *  posture: attendance cannot be marked AT ALL (location services off).
 *  The card inks its text red and carries the lost-pin motif; `cancelled`
 *  stays the too-far verdict's tint with dark text and red accents. */
export type PunchCardTone =
  | 'done'
  | 'progress'
  | 'cancelled'
  | 'scheduled'
  | 'neutral'
  | 'blocker';

/** One body span. `strong` = bold in the card's own ink (names, times);
 *  `danger` = bold red (distances and radii — the mockup's accent). */
export interface PunchBodySegment {
  text: string;
  emphasis?: 'strong' | 'danger';
}

export interface PunchStatusCardModel {
  tone: PunchCardTone;
  title: string | null;
  segments: PunchBodySegment[];
  /** The flat reading a screen reader announces. */
  announce: string;
}

/** Metres in the at-office card's plain words ("2 meters" / "1,357 meters").
 *  Grouping is done by hand — a toLocaleString dependency on Hermes Intl
 *  config is one more environment axis than a display string earns. */
export function formatMetresGrouped(metres: number): string {
  const rounded = Math.max(0, Math.round(metres));
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} meters`;
}

/** The too-far line's distance: metres under a kilometre ("990 m"), one-
 *  decimal kilometres at or above ("1.4 km") — the formatDistance house
 *  pattern (nearest-10 m rounding) without its "away" suffix. */
function formatGeofenceDistance(metres: number): string {
  const rounded = Math.round(metres / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

const seg = (text: string, emphasis?: PunchBodySegment['emphasis']): PunchBodySegment =>
  emphasis ? { text, emphasis } : { text };

function card(
  tone: PunchCardTone,
  title: string | null,
  segments: PunchBodySegment[],
): PunchStatusCardModel {
  // The segments carry their own spacing (they render as contiguous Text
  // spans) — the announce must read them verbatim, never re-join with
  // extra separators.
  const body = segments.map(s => s.text).join('');
  return {
    tone,
    title,
    segments,
    announce: title ? `${title} ${body}` : body,
  };
}

/**
 * The status card under the punch button, per posture. The readyIn posture
 * renders the prescreen's SNAPSHOT verdict (inside / outside the fence,
 * from the latest fix — never a gate, the button stays tappable). The
 * checked-in postures render NO card (owner decision 2026-11-10): the
 * punch tiles already carry the check-in time and the button carries the
 * action — a card would only repeat them. The blocked postures carry
 * their remediation copy in the same visual language — service off reads
 * as the RED blocker (owner request 2026-11-10: attendance cannot be
 * verified at all, so the card must stop the employee before the tap);
 * the done posture renders NO card (the punch tiles are the done render).
 */
export function punchStatusCard(input: {
  state: TodayButtonState;
  fix: PunchFixSample | null | undefined;
  office: PunchOffice | null | undefined;
  now: number;
}): PunchStatusCardModel | null {
  const { state, fix, office, now } = input;
  const distance = snapshotDistanceM(fix, office);
  const officeName = office?.name ?? 'your office';
  const age = formatFixAge(fix, now);
  const ageSeg = age ? [seg(` ${age}.`)] : [];

  switch (state.kind) {
    case 'readyIn': {
      if (distance == null) {
        // No fix yet (or no fence to judge against): the punch stays
        // available, the card explains what's missing — once, not always.
        return card('neutral', 'Getting your location…', []);
      }
      if (distance > (office?.radiusM ?? 0)) {
        return card('cancelled', `Too far from ${officeName}`, [
          seg('You are '),
          seg(formatGeofenceDistance(distance), 'danger'),
          seg(' from '),
          seg(officeName, 'strong'),
          seg('. Go closer, then check in.'),
          ...ageSeg,
        ]);
      }
      // Owner's verbatim copy (2026-11-10, replacing "At your office /
      // You are at … (2 m away). Location checked."): one plain sentence,
      // and the freshness caption does not appear on this posture.
      return card('done', "You're at the office", [
        seg("You're at "),
        seg(officeName, 'strong'),
        seg(', just '),
        seg(formatMetresGrouped(distance), 'danger'),
        seg(' away. Your location is verified.'),
      ]);
    }
    case 'readyOut':
      // The tiles own the checked-in truth; the button owns the action.
      return null;
    case 'offline':
      return card('neutral', null, [seg(offlineMessage)]);
    case 'permissionDenied':
      return card('neutral', null, [seg(captureFailureMessage('permission'))]);
    case 'preciseOff':
      return card('neutral', null, [
        seg(
          `Turn on precise location to check ${state.action === 'out' ? 'out' : 'in'}`,
        ),
      ]);
    case 'serviceOff':
      // RED, not a grey line (owner decision 2026-11-10: location off is
      // a BLOCKER — attendance cannot be verified at all): the card says
      // so plainly and hands over the fix, in the owner's own words (the
      // same line the tap-time popup carries). No card is shown once the
      // day is done.
      return card('blocker', 'Location is off', [
        seg(
          'Turn on your location to verify your office presence and mark attendance.',
        ),
      ]);
    case 'rateLimited':
      return card('neutral', null, [
        seg('Too many attempts. '),
        seg(`Try again in ${formatCountdown(state.remainingS)}`, 'strong'),
      ]);
    case 'resolving':
      return card('neutral', 'Getting your location…', []);
    default:
      // dialogPending: a confirm dialog owns the moment — no card behind
      // it. done: the tiles are the done render.
      return null;
  }
}

/**
 * True when the check-in needs the FR-9 full-day-leave confirm (17-8 D2):
 * the FULL byte-parity mirror of the BE D11 gate (fenzit-be
 * `check-in-out.service.ts:186-195` — `leaveGateActive`):
 *
 *   kind === 'check_in' && ctx.isWorkingDay && ctx.leaveState !== null &&
 *   ctx.leavePart === 'full_day'
 *
 * with `today != null` standing in for the summary's legacy absence
 * signal (a pre-17-8 wire has no leave fields; `today` absent is the
 * 16-4 signal). A model test asserts the parity against the service
 * condition conjunct-for-conjunct. Half-day parts (`first_half` /
 * `second_half`) are strictly NOTHING — no dialog, no subtext, no copy
 * anywhere (the gate is full_day-only, so pass-through is structural).
 * Check-out is never gated (FR-9 is check-in only).
 */
export function needsLeaveConfirm(
  today: AttendanceTodayFacts | null | undefined,
  kind: 'check_in' | 'check_out',
): boolean {
  return (
    kind === 'check_in' &&
    today != null &&
    today.isWorkingDay === true &&
    today.leaveState != null &&
    today.leavePart === 'full_day'
  );
}
