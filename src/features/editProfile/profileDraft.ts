/**
 * profileDraft.ts — pure rules for the Edit profile page: what counts as a
 * valid name, GST number and business-type pick, and which fields changed.
 * No React here, so every rule is testable on its own. The backend repeats
 * these checks; this copy only gives the person an answer before they tap Save.
 */
import type { UpdateCompanyBody } from '../../services';

/** Same rule as the database check `tenants_gstin_format` and the API DTO. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const MAX_NAME_LENGTH = 100;
export const MAX_BUSINESS_TYPES = 10;
/** Largest profile photo the server accepts. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Longest edge the photo is scaled to before upload (aspect kept). */
export const AVATAR_MAX_DIMENSION = 512;

/** GST numbers are case-insensitive on entry; store and compare in capitals. */
export function normalizeGstin(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Null when the GST field is empty (optional) or a valid 15-character GSTIN. */
export function gstinError(raw: string): string | null {
  const value = normalizeGstin(raw);
  if (value === '') return null;
  if (value.length !== 15 || !GSTIN_PATTERN.test(value)) {
    return 'Enter a 15-character GST number, like 29ABCDE1234F1Z5.';
  }
  return null;
}

export function nameError(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return 'Enter your name.';
  if (value.length > MAX_NAME_LENGTH) return `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}

export function businessTypesError(codes: readonly string[]): string | null {
  if (codes.length === 0) return 'Pick at least one business type.';
  if (codes.length > MAX_BUSINESS_TYPES) {
    return `Pick at most ${MAX_BUSINESS_TYPES} business types.`;
  }
  return null;
}

/** Order-insensitive equality for two code lists. */
export function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((code, i) => code === right[i]);
}

/**
 * The `PATCH /company` body for the fields that changed, or null when neither
 * changed (so no request is sent). Only changed fields go out.
 */
export function buildCompanyPatch(input: {
  savedGstin: string | null;
  draftGstin: string;
  savedCodes: readonly string[];
  draftCodes: readonly string[];
}): UpdateCompanyBody | null {
  const body: UpdateCompanyBody = {};
  const gstin = normalizeGstin(input.draftGstin) || null;
  if (gstin !== input.savedGstin) body.gstin = gstin;
  if (!sameCodes(input.savedCodes, input.draftCodes)) {
    body.businessTypeCodes = [...input.draftCodes];
  }
  return Object.keys(body).length === 0 ? null : body;
}
