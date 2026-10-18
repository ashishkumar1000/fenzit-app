/**
 * useReverseAddress — the picker's settle-only reverse geocode, latest-wins
 * abort (the useAddressAutosuggest abort pattern). A 200 with no address →
 * the raw-coordinates label, never a throw. Runs regardless of the services
 * state, so a manually dragged pin keeps its Nearby area label.
 */
import { useEffect, useState } from 'react';
import type { LatLng } from 'react-native-maps';
import { placesService } from '../../../services';
import type { ReverseGeocodedAddress } from '../../../services';
import { isAbort } from '../../../utils';

export type ReverseResult = { centre: LatLng; place: ReverseGeocodedAddress };

export function useReverseAddress(settled: LatLng) {
  const [addressText, setAddressText] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  // The result paired with the centre it resolved, so Confirm (customer
  // mode) can tell a fresh answer from a stale one.
  const [reverseResult, setReverseResult] = useState<ReverseResult | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setAddressLoading(true);
    placesService
      .reverse(settled.latitude, settled.longitude, ctrl.signal)
      .then(place => {
        const label =
          place.formattedAddress ||
          `${settled.latitude.toFixed(5)}, ${settled.longitude.toFixed(5)}`;
        setAddressText(label);
        setReverseResult({ centre: settled, place });
      })
      .catch(err => {
        if (!isAbort(err, ctrl.signal)) {
          setAddressText(`${settled.latitude.toFixed(5)}, ${settled.longitude.toFixed(5)}`);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setAddressLoading(false);
      });
    return () => ctrl.abort();
  }, [settled]);

  return { addressText, addressLoading, reverseResult };
}
