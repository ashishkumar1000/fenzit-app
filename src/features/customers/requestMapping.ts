/**
 * `NewCustomerInput` → `CreateCustomerRequest` mapping, used by
 * `AddCustomerScreen` — kept in one place so the "Places is additive, never
 * mandatory" field-omission rule can't drift if another caller ever needs it.
 */
import { DIAL_CODE } from './constants';
import type { NewCustomerInput } from './types';
import type { CreateCustomerRequest } from '../../services';

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
  const address = [input.address, input.area].filter(Boolean).join(', ');

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
  };
}
