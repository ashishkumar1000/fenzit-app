import { PermissionsAndroid, Platform } from 'react-native';
import {
  getCurrentPosition as nativeGetCurrentPosition,
  requestPermission,
} from 'react-native-nitro-geolocation';

export interface LocationPermissionOutcome {
  status: 'granted' | 'denied' | 'undetermined';
  error?: string;
}

export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export const LOCATION_PERMISSION_MESSAGE = 'Allow Fenzit to access your location to verify step completion';

const PLATFORM_MESSAGES = {
  android: {
    denied: 'Location permission denied. Go to Settings to enable location access.',
    other: 'Location permission is needed to verify step completion.',
  },
  ios: {
    denied: 'Location access was denied. Go to Settings and select "Allow While Using App".',
    other: 'Location access is needed to verify step completion.',
  },
} as const;

export async function requestLocationPermission(): Promise<LocationPermissionOutcome> {
  if (Platform.OS === 'android') {
    try {
      const status = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (status) {
        return { status: 'granted' };
      }

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: LOCATION_PERMISSION_MESSAGE,
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );

      return {
        status: granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
        ...(granted !== PermissionsAndroid.RESULTS.GRANTED && {
          error: PLATFORM_MESSAGES.android.denied,
        }),
      };
    } catch (err) {
      console.error('[geolocation] permission error:', err);
      throw err;
    }
  }

  try {
    // nitro-geolocation 1.4.x: the /compat `requestAuthorization` is
    // callback-based (the old promise + 'whenInUse' call resolved to
    // undefined and read as "denied"); use the main API instead.
    const status = await requestPermission();
    return {
      status: status === 'granted' ? 'granted' : 'denied',
      ...(status !== 'granted' && { error: PLATFORM_MESSAGES.ios.denied }),
    };
  } catch (err) {
    console.error('[geolocation] authorization error:', err);
    throw err;
  }
}

/** Main-API capture (user-directed migration, 2026-10-16 — every job-step
 *  verify timed out on the Pixel 6 while the attendance flow, already on
 *  the main API, worked in the same offices). The /compat API this module
 *  used before maps accuracy straight onto raw LocationManager providers:
 *  high accuracy = the GPS provider ALONE (first enabled in [gps, network]),
 *  which can never produce a fix indoors — and Play Services' fused engine,
 *  the thing Google Maps uses to locate "instantly" at a desk, is never
 *  consulted on the compat path at all. The main API routes to the fused
 *  engine (auto = fused when GMS is available) and honors maximumAge on a
 *  cached fused fix, so attempt 1 below is the indoor-capable capture:
 *  balanced priority over WiFi/network with a 15 s cache window. Only a
 *  TIMEOUT earns attempt 2 — the strict never-cached high-accuracy fix for
 *  the outdoors case where WiFi fails but satellites exist. Permission and
 *  services-off failures fail fast: deterministic, a retry cannot succeed.
 *  Same strategy as attendanceLocation.ts (story 16-3); messages are the
 *  consumer contract (useLocateMe matches /timed out/). */
const FALLBACK_TIMEOUT_MS = 25_000;

/** Nitro LocationError codes: -1 internal, 1 permission, 2 unavailable,
 *  3 timeout, 4 Play Services missing, 5 settings not satisfied. */
type NativeErrorCode = 1 | 2 | 3 | 4 | 5;

function errorCode(err: unknown): NativeErrorCode | null {
  const code = (err as { code?: number } | null)?.code;
  return typeof code === 'number' ? (code as NativeErrorCode) : null;
}

function classification(err: unknown): 'permission' | 'unavailable' | 'timeout' | 'unknown' {
  switch (errorCode(err)) {
    case 1:
      return 'permission';
    case 2:
    case 4:
    case 5:
      return 'unavailable';
    case 3:
      return 'timeout';
    default:
      return 'unknown';
  }
}

/** Errors are rethrown as plain Errors with stable messages — consumers
 *  branch on the message text, never the raw native shape. */
function toConsumerError(err: unknown): Error {
  switch (classification(err)) {
    case 'permission':
      return new Error('Location permission denied');
    case 'unavailable':
      return new Error('Location services unavailable');
    case 'timeout':
      return new Error('Location request timed out');
    default: {
      const message =
        (err as { message?: string } | null)?.message ?? String(err);
      return new Error('Failed to get location: ' + message);
    }
  }
}

async function capture(options: {
  android: 'balanced' | 'high';
  ios: 'best';
  maximumAge: number;
  timeout: number;
  label: string;
}): Promise<GeolocationCoordinates> {
  const position = await nativeGetCurrentPosition({
    accuracy: { android: options.android, ios: options.ios },
    maximumAge: options.maximumAge,
    timeout: options.timeout,
  });

  const { latitude, longitude, accuracy } = position.coords;
  if (latitude === undefined || longitude === undefined || accuracy === undefined) {
    throw new Error('Invalid location data: missing coordinates');
  }

  console.log(
    `[geolocation] fix via ${options.label}: provider=${position.provider ?? 'unknown'}`,
    `accuracy=${Math.round(accuracy)}m`,
  );
  return { latitude, longitude, accuracy };
}

export async function getCurrentPosition(timeout: number = 15000): Promise<GeolocationCoordinates> {
  try {
    // Attempt 1 — fused balanced priority over the cached-or-network fix
    // (see the module comment for why this leads instead of GPS).
    return await capture({
      android: 'balanced',
      ios: 'best',
      maximumAge: 15_000,
      timeout,
      label: 'balanced',
    });
  } catch (err) {
    if (classification(err) !== 'timeout') throw toConsumerError(err);

    console.error('[geolocation] balanced capture timed out; retrying high accuracy');
    try {
      return await capture({
        android: 'high',
        ios: 'best',
        maximumAge: 0,
        timeout: FALLBACK_TIMEOUT_MS,
        label: 'high-accuracy',
      });
    } catch (retryErr) {
      console.error('[geolocation] high-accuracy fallback error:', retryErr);
      throw toConsumerError(retryErr);
    }
  }
}
