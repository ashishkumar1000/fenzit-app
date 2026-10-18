/**
 * deviceLocation.ts — the shared device-location state helpers (the
 * location-services-off feature, 2026-10-17).
 *
 * The single owner of device-side location remediation for every GPS
 * touchpoint (map picker, technician verify step). Deliberately separate
 * from the attendance probe (`attendanceLocationPermission.ts`) and the job
 * capture (`features/technicianApp/geolocation.ts`) — those stacks keep
 * their own capture strategies; this module only answers the four-state
 * model's device questions and owns the "turn it back on" ladder.
 *
 * Why probe-first: nitro-geolocation 1.4.3 has NO dedicated services-off
 * error code — codes 2 (unavailable), 4 (Play Services) and 5 (settings not
 * satisfied) all mean "no fix for device-level reasons". A positive
 * pre-check plus a re-probe on failure converts that ambiguity into a
 * certain state: codes 2/4/5 with services OFF = services-off; with
 * services ON = transient.
 *
 * The remediation ladder (Android):
 *   [Turn on location] → showEnableLocationDialog()   // native one-tap dialog
 *     → dismissed/unavailable → openDeviceLocationSettings()
 *       // guarded ACTION_LOCATION_SOURCE_SETTINGS intent → app settings
 *   → return/foreground → re-probe (the screen owns that)
 * iOS has no in-app enable dialog — the ladder is openSettings alone, where
 * the master Location Services switch lives; the screen re-probes on return.
 */
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import {
  checkPermission,
  hasServicesEnabled,
  requestLocationSettings,
} from 'react-native-nitro-geolocation';

/** Why a capture produced no fix — the shared four-state vocabulary. */
export type CaptureFailureKind =
  | 'permission'   // code 1 — the OS denied the capture
  | 'servicesOff'  // codes 2/4/5 AND a fresh probe says the master switch is off
  | 'timeout'      // code 3 — no fix in the requested window
  | 'transient';   // codes 2/4/5 with services ON, or anything unrecognized

// Nitro LocationError codes: -1 internal, 1 permission, 2 unavailable,
// 3 timeout, 4 Play Services missing, 5 settings not satisfied.
const CODE_PERMISSION = 1;
const CODE_UNAVAILABLE = 2;
const CODE_TIMEOUT = 3;
const CODE_PLAY_SERVICES = 4;
const CODE_SETTINGS_NOT_SATISFIED = 5;

/**
 * Whether device-level location services are ON. Fail-open TRUE: a probe
 * failure must never block a flow the OS gave no signal about.
 */
export async function isServicesEnabled(): Promise<boolean> {
  try {
    // `!== false` — an undefined answer (a wiped jest mock, a native
    // hiccup) must not read as "off".
    return (await hasServicesEnabled()) !== false;
  } catch (err) {
    console.error('[deviceLocation] services probe failed:', err);
    return true;
  }
}

/**
 * Check-only permission probe — NEVER prompts (the focus/foreground
 * re-probes run this; prompting happens only from an explicit user action
 * or a flow's one-time entry ask). Fail-closed false: an unknown state
 * routes to the permission remediation, which is always recoverable.
 *
 * Android deliberately checks ACCESS_FINE_LOCATION, not nitro's
 * `checkPermission` — nitro reports granted for COARSE too, and a
 * coarse-only user must still get the precise-location ask the entry
 * request makes (the verify step's contract is a precise fix, and the old
 * flow always gated on FINE).
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    }
    return (await checkPermission()) === 'granted';
  } catch (err) {
    console.error('[deviceLocation] permission probe failed:', err);
    return false;
  }
}

/**
 * Classify a capture failure into the four-state vocabulary. Codes 2/4/5
 * re-probe services before answering — a mid-capture flip (the user
 * toggled services off) and a real transient share those codes, so the
 * probe is the discriminator (never misclassify).
 */
export async function classifyCaptureFailure(
  err: unknown,
): Promise<CaptureFailureKind> {
  const code = (err as { code?: number } | null)?.code;
  switch (code) {
    case CODE_PERMISSION:
      return 'permission';
    case CODE_TIMEOUT:
      return 'timeout';
    case CODE_UNAVAILABLE:
    case CODE_PLAY_SERVICES:
    case CODE_SETTINGS_NOT_SATISFIED:
      return (await isServicesEnabled()) ? 'transient' : 'servicesOff';
    default:
      // Codeless (-1 or a raw Error): unknown, not device-level — the
      // caller's transient path owns it.
      return 'transient';
  }
}

/**
 * Android's native one-tap "enable location" resolution dialog
 * (`requestLocationSettings`). Resolves true only when the result reports
 * services actually enabled — the caller may then retry the flow
 * immediately (the one-tap recovery). A dismissal, an unavailable dialog,
 * or a throw resolves false and the caller falls down the settings ladder.
 * iOS has no equivalent dialog — this is a no-op resolving true ("nothing
 * to do here"); callers route iOS to `openDeviceLocationSettings` directly.
 */
export async function showEnableLocationDialog(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const status = await requestLocationSettings({ enableHighAccuracy: true });
    return status.locationServicesEnabled === true;
  } catch (err) {
    // Nitro re-checks its strict options (high accuracy, alwaysShow, BLE)
    // the instant the user accepts; on some devices that re-check fails even
    // though the master switch is genuinely on (observed on a Pixel 6 /
    // Android 17: the dialog resolves OK, location turns on, the re-check
    // still rejects with SETTINGS_NOT_SATISFIED). This is a known, handled
    // race — not an error: the re-probe below settles the real state, so it
    // logs quiet (console.error would raise a LogBox banner every time).
    console.log('[deviceLocation] enable-location dialog rejected by nitro re-check; re-probing device state:', err);
    return isServicesEnabled();
  }
}

/**
 * The settings rungs of the ladder. Android first tries the OS
 * location-source panel (the exact screen with the master switch) via a
 * GUARDED intent — some OEM skins throw ActivityNotFoundException for it,
 * and the catch falls to the app's own Settings page, so the tap can never
 * crash. iOS goes straight to the app's Settings page (Location Services
 * lives there). Always resolves false: confirming the flip happens on the
 * screen's focus/foreground re-probe, not here.
 */
export async function openDeviceLocationSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.error('[deviceLocation] openSettings failed:', err);
    }
    return false;
  }
  try {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
    return false;
  } catch {
    // Intent unsupported on this skin — fall through to app settings.
  }
  try {
    await Linking.openSettings();
  } catch (err) {
    console.error('[deviceLocation] openSettings failed:', err);
  }
  return false;
}

/**
 * The full [Turn on location] remediation — the composed ladder every
 * touchpoint calls. Resolves true only when services are confirmed ON
 * right now (the Android dialog path), so the caller can retry the flow
 * immediately; otherwise the user is in the OS Settings app and the
 * screen's focus/foreground re-probe finishes the recovery.
 */
export async function enableDeviceLocation(): Promise<boolean> {
  // iOS: no in-app dialog exists — straight to Settings.
  if (Platform.OS !== 'android') {
    await openDeviceLocationSettings();
    return false;
  }
  if (await showEnableLocationDialog()) return true;
  await openDeviceLocationSettings();
  return false;
}
