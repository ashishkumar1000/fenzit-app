/**
 * Customers domain types.
 * Kept local to the feature; promote to `src/types` once a real API/service
 * backs this list.
 */
import type { ApiCustomer } from '../../services';

/**
 * The list model. Currently identical to the API row — kept as a feature-level
 * alias so screens don't import service types directly, and so a mapping layer
 * can slot in here if the two ever diverge.
 *
 * Note there's no lifetime value and no address: `GET /customers` returns
 * neither.
 */
export type Customer = ApiCustomer;

/**
 * The 5 structured fields of a located address pick. Two origins share this
 * shape (SPEC-customer-map-pin-picker):
 * - a resolved `AddressPickerSheet` search place — `placeId` and
 *   `formattedAddress` always present;
 * - a `MapPinPicker` pin drop — `placeId` always null (reverse geocoding
 *   yields no place id) and `formattedAddress` null when the point has no
 *   address (the caller falls back to the raw coordinates for display).
 * `pincode` is independently nullable on both paths.
 */
export type PickedAddressSnapshot = {
  formattedAddress: string | null;
  pincode: string | null;
  /** Coordinates are always present — they are what make it a map pin. */
  latitude: number;
  longitude: number;
  placeId: string | null;
};

/**
 * One located-address pick as the form consumes it — either a resolved
 * place, a dropped pin, or (snapshot `null`) a manual entry, which has no
 * `placeId` or coordinates and must wipe any previously-picked snapshot
 * (otherwise "pick a place, then enter manually" would send the OLD pick's
 * snapshot alongside the NEW text and the job's map pin would silently
 * point at the abandoned place).
 */
export type PickedAddress = {
  /** What the screen's Address `Input` displays. */
  addressLine: string;
  /** The pick's city, or '' when the entry carried none (the caller must
   *  not wipe a city the user typed themselves in that case). */
  city: string;
  snapshot: PickedAddressSnapshot | null;
};

/**
 * What the "Add customer" sheet collects. Name and phone are required; the
 * rest are optional, so they arrive as trimmed strings that may be empty —
 * the caller decides whether to omit them from the API payload.
 *
 * The 5 trailing fields are the located-address snapshot (Story 1.5 search
 * resolve; pin-drop since SPEC-customer-map-pin-picker) — present only when
 * a located pick exists, absent otherwise (never sent as empty strings).
 * They're independent of `address`/`city` above: a hand-edit to the free
 * text after a pick never changes or clears them.
 */
export type NewCustomerInput = {
  name: string;
  /** Digits only, no dial code — see `DIAL_CODE` in `constants.ts`. */
  phone: string;
  city: string;
  area: string;
  /** Free-text address or map hint, e.g. "Flat 4B, Sai Krupa, near Metro". */
  address: string;
  /** `ResolvedPlace.formattedAddress`, as picked. */
  formattedAddress?: string;
  /** `ResolvedPlace.pincode`, when the resolved place had one. */
  pincode?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
};
