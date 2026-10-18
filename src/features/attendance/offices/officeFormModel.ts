/**
 * officeFormModel — pure form state + validation for OfficeFormScreen
 * (Story 15-4). Ranges mirror the 15-3 DB CHECK constraints / DTO so a
 * 422 can never happen in practice: radius 50–1000, late cut-off 0–120,
 * full-day hours > 0, half-day hours > 0 and < full, end after start.
 * (The radius range is validated here, not only in the RadiusStepper
 * clamp — the model is the last line of defence.)
 */
import type {
  CreateOfficeRequest,
  UpdateOfficeRequest,
} from '../../../services';
import type { OfficeDetail, OfficeRule } from '../../../types/office';

/** Raw form state — numbers as strings while typing. */
export interface OfficeFormState {
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  startTime: string;
  endTime: string;
  lateCutoffMinutes: string;
  fullDayHours: string;
  halfDayHours: string;
}

/**
 * Seed times (18-5 D7): times are mandatory, so a blank start is a
 * guaranteed first-error dead end — a new (or rule-less) form ships a
 * VALID rule by default and the owner edits from there. FE-local consts:
 * the BE's own defaults are the hours/cutoff anchors (15-3); the server
 * stays authoritative over whatever the owner saves.
 */
export const OFFICE_START_TIME_DEFAULT = '09:30';
export const OFFICE_END_TIME_DEFAULT = '18:30';

/** Defaults for a new office — BE create defaults (radius 100, cutoff 15, 8/4 h). */
export function emptyOfficeForm(): OfficeFormState {
  return {
    name: '',
    latitude: null,
    longitude: null,
    radiusM: 100,
    startTime: OFFICE_START_TIME_DEFAULT,
    endTime: OFFICE_END_TIME_DEFAULT,
    lateCutoffMinutes: '15',
    fullDayHours: '8',
    halfDayHours: '4',
  };
}

/**
 * Pre-fill from the detail's rule history (ascending by validFrom — the
 * newest entry is the current rule, or a pending one). An explicit rule
 * always wins; the seed times only cover the no-rule fallback.
 */
export function formFromDetail(detail: OfficeDetail): OfficeFormState {
  const rule: OfficeRule | undefined = detail.rules[detail.rules.length - 1];
  return {
    name: detail.name,
    latitude: detail.latitude,
    longitude: detail.longitude,
    radiusM: detail.radiusM,
    startTime: rule?.startTime ?? OFFICE_START_TIME_DEFAULT,
    endTime: rule?.endTime ?? OFFICE_END_TIME_DEFAULT,
    lateCutoffMinutes: rule ? String(rule.lateCutoffMinutes) : '15',
    fullDayHours: rule ? String(rule.fullDayHours) : '8',
    halfDayHours: rule ? String(rule.halfDayHours) : '4',
  };
}

/** `HH:mm` 24-hour, e.g. 09:00. */
export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type OfficeFormErrors = {
  name?: string;
  location?: string;
  radiusM?: string;
  startTime?: string;
  endTime?: string;
  lateCutoffMinutes?: string;
  fullDayHours?: string;
  halfDayHours?: string;
};

/**
 * Client-side validation mirroring the server's 422 ranges. Returns an
 * errors object that is empty (all keys undefined) when the form is valid.
 */
export function validateOfficeForm(state: OfficeFormState): OfficeFormErrors {
  const errors: OfficeFormErrors = {};
  const name = state.name.trim();
  if (!name) {
    errors.name = 'Enter an office name';
  } else if (name.length > 80) {
    errors.name = 'Keep the name within 80 characters';
  }
  if (state.latitude === null || state.longitude === null) {
    errors.location = 'Place the office pin on the map';
  }
  if (state.radiusM < 50 || state.radiusM > 1000) {
    errors.radiusM = 'Check-in distance must be 50–1000 m';
  }
  if (!isValidTime(state.startTime)) {
    errors.startTime = 'Use 24-hour time — 09:00 means 9 AM';
  }
  if (!isValidTime(state.endTime)) {
    errors.endTime = 'Use 24-hour time — 18:00 means 6 PM';
  } else if (isValidTime(state.startTime) && state.endTime <= state.startTime) {
    errors.endTime = 'End time must be after the start time';
  }
  // Number('') === 0 would let a cleared field through as a silent
  // 0-minute grace period — empty is its own error, checked first.
  const cutoffRaw = state.lateCutoffMinutes.trim();
  const cutoff = Number(cutoffRaw);
  if (cutoffRaw === '') {
    errors.lateCutoffMinutes = 'Enter the late cut-off minutes';
  } else if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 120) {
    errors.lateCutoffMinutes = 'Late cut-off must be a whole number from 0 to 120 minutes';
  }
  const full = Number(state.fullDayHours);
  if (!Number.isFinite(full) || full <= 0) {
    errors.fullDayHours = 'Full-day hours must be greater than 0';
  }
  const half = Number(state.halfDayHours);
  if (!Number.isFinite(half) || half <= 0) {
    errors.halfDayHours = 'Half-day hours must be greater than 0';
  } else if (state.fullDayHours.trim() !== '' && Number.isFinite(full) && half >= full) {
    // Checked even while the full-day value is itself invalid (0), so both
    // wrong fields show their error at once instead of one after the other.
    errors.halfDayHours = 'Half-day hours must be less than full-day hours';
  }
  return errors;
}

export function hasErrors(errors: OfficeFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * True when the five rules fields differ from the office's latest rule —
 * the edit save only sends the (complete) rules set when something
 * actually changed, so an unchanged save never seeds a redundant
 * effective-dated row from tomorrow.
 */
export function rulesChanged(state: OfficeFormState, detail: OfficeDetail): boolean {
  const rule = detail.rules[detail.rules.length - 1];
  if (!rule) return true;
  return (
    state.startTime !== rule.startTime ||
    state.endTime !== rule.endTime ||
    Number(state.lateCutoffMinutes) !== rule.lateCutoffMinutes ||
    Number(state.fullDayHours) !== rule.fullDayHours ||
    Number(state.halfDayHours) !== rule.halfDayHours
  );
}

/** True when the profile fields (name/pin/radius) differ from the detail. */
export function profileChanged(state: OfficeFormState, detail: OfficeDetail): boolean {
  return (
    state.name.trim() !== detail.name ||
    state.latitude !== detail.latitude ||
    state.longitude !== detail.longitude ||
    state.radiusM !== detail.radiusM
  );
}
/**
 * True when the owner has changed anything since the form opened — against
 * the loaded office (edit) or the blank defaults (add). Drives the "discard
 * changes?" prompt. A name that differs only by surrounding spaces is not a
 * change; a rule-less office compares against the seed defaults the form
 * shows, so merely opening it is never "dirty".
 */
export function isFormDirty(form: OfficeFormState, detail: OfficeDetail | null): boolean {
  const base = detail ? formFromDetail(detail) : emptyOfficeForm();
  return (Object.keys(base) as (keyof OfficeFormState)[]).some((key) => {
    const a = form[key];
    const b = base[key];
    return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b;
  });
}

/** Server cap on the stored address (display text only). */
export const OFFICE_ADDRESS_MAX = 500;

/** The address to send: trimmed, capped at the server limit, null when blank. */
export function cleanAddress(address?: string | null): string | null {
  const text = address?.trim().slice(0, OFFICE_ADDRESS_MAX).trim();
  return text ? text : null;
}

/**
 * Edit only: the pin's address differs from the saved one (a same-spot
 * re-pick that found or changed an address). The form fields alone do not
 * show it, so the unsaved-changes ask must check it too.
 */
export function isAddressChanged(
  detail: OfficeDetail | null,
  address?: string | null,
): boolean {
  return detail !== null && cleanAddress(address) !== cleanAddress(detail.formattedAddress);
}

/** The validated form's create payload (validation runs before this). */
export function buildCreateRequest(
  form: OfficeFormState,
  address?: string | null,
): CreateOfficeRequest {
  const cleaned = cleanAddress(address);
  return {
    name: form.name.trim(),
    latitude: form.latitude as number,
    longitude: form.longitude as number,
    radiusM: form.radiusM,
    startTime: form.startTime,
    endTime: form.endTime,
    lateCutoffMinutes: Number(form.lateCutoffMinutes),
    fullDayHours: Number(form.fullDayHours),
    halfDayHours: Number(form.halfDayHours),
    ...(cleaned ? { formattedAddress: cleaned } : {}),
  };
}

/**
 * The edit PATCH, diff-gated: profile fields only when they changed (an
 * unchanged save must not rewrite them), the rules five-field set only when
 * a rule field changed (a partial set is a 400 server-side, and an
 * unchanged save must not seed a redundant effective-dated row).
 *
 * `address` is the pin's address shown on the form. It rides with every
 * profile write (the server clears the stored address whenever a pin arrives
 * without one, so a rename must resend it) and also triggers a write by
 * itself when a re-picked pin gained an address the office did not have.
 */
export function buildUpdatePatch(
  form: OfficeFormState,
  detail: OfficeDetail,
  address?: string | null,
): UpdateOfficeRequest {
  const patch: UpdateOfficeRequest = {};
  const cleaned = cleanAddress(address);
  const addressGained = cleaned !== null && cleaned !== cleanAddress(detail.formattedAddress);
  if (profileChanged(form, detail) || addressGained) {
    patch.name = form.name.trim();
    patch.latitude = form.latitude as number;
    patch.longitude = form.longitude as number;
    patch.radiusM = form.radiusM;
    if (cleaned) patch.formattedAddress = cleaned;
  }
  if (rulesChanged(form, detail)) {
    patch.startTime = form.startTime;
    patch.endTime = form.endTime;
    patch.lateCutoffMinutes = Number(form.lateCutoffMinutes);
    patch.fullDayHours = Number(form.fullDayHours);
    patch.halfDayHours = Number(form.halfDayHours);
  }
  return patch;
}

/** Usual shift times offered as chips in the time picker — start / end of day. */
export const START_TIME_PRESETS = ['08:00', '08:30', '09:00', '09:30', '10:00'] as const;
export const END_TIME_PRESETS = ['17:00', '17:30', '18:00', '18:30', '19:00'] as const;
