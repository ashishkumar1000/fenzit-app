/**
 * Address picker feature — public surface. `AddressPickerSheet` is a nested
 * modal hosted by whichever picker screen needs search — today the shared
 * `MapPinPickerScreen` (`features/attendance/offices`, both modes), not a
 * registered route.
 */
export { default as AddressPickerSheet } from './AddressPickerSheet';
export { ManualAddressForm, type ManualAddressEntry } from './ManualAddressForm';
export { useAddressAutosuggest } from './useAddressAutosuggest';
export type { AddressPickerPhase } from './useAddressAutosuggest';
