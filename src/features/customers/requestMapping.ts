/**
 * `NewCustomerInput` → `CreateCustomerRequest` mapping, used by
 * `AddCustomerScreen` — kept in one place so the "Places is additive, never
 * mandatory" field-omission rule can't drift if another caller ever needs it.
 * The edit side lives here too (`toCustomerFormSeed`,
 * `buildCustomerUpdatePatch`) so the create merge and the edit diff share
 * one definition of the merged address line.
 */
import { DIAL_CODE } from './constants';
import type {
  NewCustomerInput,
  PickedAddressSnapshot,
} from './types';
import type {
  CreateCustomerRequest,
  CustomerDetail,
  UpdateCustomerRequest,
} from '../../services';

/**
 * Builds the `POST /customers` payload from the sheet's form values.
 *
 * The endpoint has no `area` field, so Area is merged into the address line
 * as "<address>, <area>" — either part alone is sent on its own. Optional
 * fields are omitted rather than sent as empty strings, so the backend
 * stores null instead of "".
 *
 * The 5 structured fields ride only on a located pick, gated on its
 * coordinates — a `MapPinPicker` pin drop has coordinates but no `placeId`
 * (only a resolved search place carries one), and any of the text fields
 * can legitimately be absent on either path, so each is gated on its own.
 */
export function toCreateCustomerRequest(
  input: NewCustomerInput,
): CreateCustomerRequest {
  const address = mergedAddressLine(input.address, input.area);

  return {
    name: input.name,
    countryCode: DIAL_CODE,
    phoneNumber: input.phone,
    ...(address ? { address } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.latitude != null && input.longitude != null
      ? {
          ...(input.formattedAddress ? { formattedAddress: input.formattedAddress } : {}),
          latitude: input.latitude,
          longitude: input.longitude,
          ...(input.placeId ? { placeId: input.placeId } : {}),
          ...(input.pincode ? { pincode: input.pincode } : {}),
        }
      : {}),
    // CAP-5 — the user's own detail travels as its own field regardless of
    // pick origin (pin, search, or manual); omitted when empty so the
    // backend stores null, like every other optional here.
    ...(input.addressDetails ? { addressDetails: input.addressDetails } : {}),
  };
}

/**
 * The create flow's merge — Street and Area join into one address line,
 * either part alone on its own. Single-sourced because the edit diff
 * (`buildCustomerUpdatePatch`) must compare against the exact same
 * composition the create stored.
 */
function mergedAddressLine(street: string, area: string): string {
  return [street, area].filter(Boolean).join(', ');
}

/**
 * The live form values the edit patch diffs — the screen's own string state
 * shape (untrimmed; the builder trims, like the office form model does).
 */
export type CustomerFormValues = {
  name: string;
  street: string;
  area: string;
  city: string;
  addressDetails: string;
  snapshot: PickedAddressSnapshot | null;
};

/**
 * What the server had when the form was seeded — the diff anchor. Field-by-
 * field server truth rather than a copy of the form state, so the comparison
 * can't drift from what the columns actually hold; the strings are trimmed
 * because the builder trims the current side. `snapshot` is the
 * reconstructed seed object and is compared BY REFERENCE (see
 * `buildCustomerUpdatePatch`), so it must stay one shared instance.
 */
export type CustomerUpdateBaseline = {
  name: string;
  /** The stored merged address line, or null when the customer has none. */
  address: string | null;
  /** `''` stands in for a null column — same shape as the form's state. */
  city: string;
  addressDetails: string;
  /** The reconstructed seed snapshot, or null when there is no block. */
  snapshot: PickedAddressSnapshot | null;
};

/**
 * What one render of the seeded form holds, plus the baseline it diffs
 * against. `snapshot`/`previewLine` follow the pick conventions: the
 * snapshot only exists when coordinates do (they are what make it a pin),
 * and the preview line is the resolved line falling back to the raw
 * coordinates — the same display rule `MapPinPicker` uses for a pin drop.
 */
export type CustomerFormSeed = CustomerFormValues & {
  phone: string;
  previewLine: string;
  baseline: CustomerUpdateBaseline;
};

/**
 * Seeds the edit form from `GET /customers/:id` (never a list row — rows
 * lack the coordinates the map prefill needs).
 *
 * The BE stores ONE merged `address` line (`street + ', ' + area` at
 * create), so the whole stored line goes back into Street and Area is left
 * empty: un-merging is lossy, and a seed that guessed at the split could
 * rewrite the customer's line on a no-touch save. Saving without editing
 * either field round-trips the same line; moving text between the two
 * fields is simply how the owner retitles the line.
 */
export function toCustomerFormSeed(detail: CustomerDetail): CustomerFormSeed {
  const snapshot =
    detail.latitude != null && detail.longitude != null
      ? {
          formattedAddress: detail.formattedAddress ?? null,
          pincode: detail.pincode ?? null,
          latitude: detail.latitude,
          longitude: detail.longitude,
          placeId: detail.placeId ?? null,
        }
      : null;

  return {
    name: detail.name,
    phone: detail.phoneNumber,
    street: detail.address ?? '',
    area: '',
    city: detail.city ?? '',
    addressDetails: detail.addressDetails ?? '',
    snapshot,
    previewLine: snapshot
      ? snapshot.formattedAddress ??
        `${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)}`
      : '',
    baseline: {
      // Trimmed to match the patch builder's current-side trims — a legacy
      // stored value with stray whitespace must not read as changed (and
      // rewrite itself on an untouched save).
      name: detail.name.trim(),
      address: detail.address?.trim() ?? null,
      city: (detail.city ?? '').trim(),
      addressDetails: (detail.addressDetails ?? '').trim(),
      // The SAME object the form state starts with — the reference is the
      // "no new pick yet" marker (see buildCustomerUpdatePatch).
      snapshot,
    },
  };
}

/**
 * The edit PATCH, diff-gated against the seeded baseline: a key is sent
 * only when its value changed, an empty diff means no request at all (the
 * BE answers a bare body with 400 "Nothing to update").
 *
 * The picked-location block is replaced AS A UNIT on a new pick —
 * `current.snapshot !== baseline.snapshot` is "a new pick happened"
 * (reference equality against the seed object; every pick produces a fresh
 * object, so even a re-pin of the same spot rewrites the block). Within the
 * block, absent fields travel as explicit nulls so a stale pin's line,
 * pincode or placeId can never survive a re-pin; a manual-entry pick (no
 * snapshot) over a pinned customer nulls all five. A re-pin never touches
 * `addressDetails` (CAP-5) — only emptying the Flat field clears it.
 */
export function buildCustomerUpdatePatch(
  current: CustomerFormValues,
  baseline: CustomerUpdateBaseline,
): UpdateCustomerRequest {
  const patch: UpdateCustomerRequest = {};

  // Name diffs as a plain string — required in the form, NOT NULL in the
  // schema, so it never travels as an explicit null.
  const name = current.name.trim();
  if (name !== baseline.name) patch.name = name;

  // Same merge as create, compared against the STORED line (which the seed
  // round-trips). Emptying both text fields clears the column.
  const address = mergedAddressLine(current.street.trim(), current.area.trim());
  if (address !== (baseline.address ?? '')) patch.address = address || null;

  const city = current.city.trim();
  if (city !== baseline.city) patch.city = city || null;

  const addressDetails = current.addressDetails.trim();
  if (addressDetails !== baseline.addressDetails) {
    patch.addressDetails = addressDetails || null;
  }

  if (current.snapshot !== baseline.snapshot) {
    if (current.snapshot) {
      patch.formattedAddress = current.snapshot.formattedAddress;
      patch.pincode = current.snapshot.pincode;
      patch.latitude = current.snapshot.latitude;
      patch.longitude = current.snapshot.longitude;
      patch.placeId = current.snapshot.placeId;
    } else if (baseline.snapshot) {
      patch.formattedAddress = null;
      patch.pincode = null;
      patch.latitude = null;
      patch.longitude = null;
      patch.placeId = null;
    }
    // No third case: null !== null is false, so a manual-entry customer
    // that never picked lands outside this branch entirely.
  }

  return patch;
}
