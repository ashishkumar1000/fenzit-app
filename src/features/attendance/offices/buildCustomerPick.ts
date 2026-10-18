/**
 * buildCustomerPick — the customer-mode Confirm payload. A resolved search
 * place wins when the pin still sits on it (its structured fields are exact,
 * and only it carries a placeId); otherwise the settled reverse geocode
 * fills the snapshot. All fields nullable — a point with no address falls
 * back to the raw coordinates for display.
 */
import type { LatLng } from 'react-native-maps';
import type { ResolvedPlace } from '../../../services';
import type { PickedAddressSnapshot } from '../../customers/types';
import type { ReverseResult } from './useReverseAddress';

/** Programmatic-move matching tolerance (≈ 11 m) — shared by the
 *  GPS-provenance check and the customer confirm-time snapshot selection. */
export const sameCentre = (a: LatLng, b: LatLng) =>
  Math.abs(a.latitude - b.latitude) < 1e-4 && Math.abs(a.longitude - b.longitude) < 1e-4;

export function buildCustomerPick(
  centre: LatLng,
  resolvedRef: { centre: LatLng; place: ResolvedPlace } | null,
  reverseResult: ReverseResult | null,
) {
  const resolved = resolvedRef && sameCentre(resolvedRef.centre, centre) ? resolvedRef.place : null;
  const reverse =
    reverseResult && sameCentre(reverseResult.centre, centre) ? reverseResult.place : null;
  const formattedAddress = resolved?.formattedAddress || reverse?.formattedAddress || null;
  const snapshot: PickedAddressSnapshot = {
    formattedAddress,
    pincode: resolved?.pincode ?? reverse?.pincode ?? null,
    latitude: centre.latitude,
    longitude: centre.longitude,
    placeId: resolved?.placeId ?? null,
  };
  return {
    addressLine:
      formattedAddress ?? `${centre.latitude.toFixed(5)}, ${centre.longitude.toFixed(5)}`,
    city: resolved?.city ?? reverse?.city ?? '',
    snapshot,
  };
}
