/**
 * Map-pin status for a customer. A customer "has a pin" when it has saved
 * coordinates — the same rule the job timeline uses to measure a distance
 * (`jobSiteCoords`), so the warning and the distance can never disagree.
 * Pure functions, no React.
 */
import { jobSiteCoords } from '../jobDetail/locationMetadata';

export function hasMapPin(customer: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  return jobSiteCoords({
    latitude: customer.latitude ?? null,
    longitude: customer.longitude ?? null,
  }) !== null;
}

/** Shown on the customer card and the customer detail screen. */
export const NO_PIN_NOTICE = 'No map pin';

/** Save-time confirm, shown when a save would leave the customer without a pin. */
export const NO_PIN_DIALOG_TITLE = 'Save without a pin?';
export const NO_PIN_DIALOG_BODY =
  'The app will only know the typed address. Pin the exact location on the map so your employee can find it easily.';
/** Blue primary: go and pin the exact location. */
export const NO_PIN_DIALOG_CONFIRM = 'Pin on map';
/** White secondary: save with only the typed address. */
export const NO_PIN_DIALOG_SAVE_ANYWAY = 'Save anyway';
