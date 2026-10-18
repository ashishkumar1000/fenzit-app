/**
 * pickerAddressLabel — the text the picker's bottom card shows for the pin.
 * Two rules, both about the title (the part before the first comma):
 *  - A search result the owner picked wins while the pin still sits on it —
 *    otherwise the reverse geocode of the same point replaces the name they
 *    chose ("Koramangala, Bengaluru" turned into "WJPF+3RV, Bengaluru").
 *  - A leading Google plus code ("XPJQ+3WM") is dropped from any address:
 *    it is a grid reference, not a place name an owner would recognise.
 */
import type { LatLng } from 'react-native-maps';
import type { ResolvedPlace } from '../../../services';
import { sameCentre } from './buildCustomerPick';

// Open Location Code: 4–8 chars from its 20-letter alphabet, a "+", 2+ more.
const PLUS_CODE_PREFIX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b[\s,]*/i;

/** "XPJQ+3WM, Whitefield, Bengaluru" → "Whitefield, Bengaluru". */
export function stripPlusCode(address: string): string {
  return address.replace(PLUS_CODE_PREFIX, '').trim();
}

export function pickerAddressLabel(
  pin: LatLng,
  resolved: { centre: LatLng; place: ResolvedPlace } | null,
  reverseText: string | null,
): { label: string; fromSearch: boolean } {
  const fromSearch = Boolean(resolved && sameCentre(resolved.centre, pin));
  const raw = fromSearch ? resolved!.place.formattedAddress : (reverseText ?? '');
  const label =
    stripPlusCode(raw) || `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;
  return { label, fromSearch };
}
