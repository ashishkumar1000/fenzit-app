/**
 * useLocateMe — "Use current location" for the Office map picker
 * (Story 15-4), behind the permission patterns from Stories 7-5/7-6.
 *
 * Requests a FRESH high-accuracy fix (never a cached one) — the owner is
 * placing an office pin, so a stale location would silently misplace it.
 * Device services are probed BEFORE the permission ask (with the master
 * switch off, a permission prompt is noise), and capture failures are
 * classified via the numeric `.code` (deviceLocation.classifyCaptureFailure
 * — codes 2/4/5 re-probe services, so a mid-capture flip lands in
 * `servicesOff`, not `failed`). The distinct shapes map to distinct copy:
 *
 *   - denied            → "Turn on location to place the pin"
 *   - denied twice      → adds an OS Settings deep-link action
 *   - servicesOff       → the named-cause notice + [Turn on location]
 *   - fix timeout       → its own message, distinct from denied
 *   - other fix failure → generic location failure
 *
 * Codeless errors (only possible from raw Error sources — geolocation.ts
 * now always attaches `.code`) keep the legacy /timed out/ message check.
 */
import { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../../technicianApp/geolocation';
import {
  classifyCaptureFailure,
  enableDeviceLocation,
  isServicesEnabled,
} from '../../../services/location/deviceLocation';

export type LocateErrorKind = 'denied' | 'servicesOff' | 'timeout' | 'failed';

export interface UseLocateMeResult {
  /** Resolves the fresh fix, or null when permission/services/fix failed
   *  (the screen reads `errorMessage` for the copy). */
  locate: () => Promise<{ latitude: number; longitude: number } | null>;
  locating: boolean;
  error: LocateErrorKind | null;
  /** The failure kind under its UI-facing name — the screen branches on
   *  the kind (services-off renders its own recovery block), never the
   *  message text. Same state as `error`. */
  errorKind: LocateErrorKind | null;
  errorMessage: string | null;
  /** True once permission has been denied twice — the screen then offers
   *  the OS Settings deep-link. */
  canOpenSettings: boolean;
  clearError: () => void;
  openSettings: () => void;
  /** [Turn on location] — the enable-services remediation ladder (Android:
   *  native dialog → guarded settings intent → app settings; iOS: app
   *  settings). Resolves true only when services are confirmed ON right
   *  now (the Android dialog path) — the caller then re-locates without a
   *  second tap; otherwise the screen re-probes on focus/foreground. */
  enableServices: () => Promise<boolean>;
  /** The focus/foreground re-probe: re-checks services and updates the
   *  services-off state in place (a user back from the OS location panel
   *  must never stay stuck). Resolves whether services are ON. */
  refreshServices: () => Promise<boolean>;
}

export const LOCATE_DENIED_MESSAGE = 'Turn on location to place the pin';
export const LOCATE_SERVICES_OFF_MESSAGE =
  'Location services are turned off on your device. Turn them on to place the pin.';
export const LOCATE_TIMEOUT_MESSAGE = 'Getting your location took too long. Try again.';
export const LOCATE_FAILED_MESSAGE = 'Could not get your location. Try again.';

export function useLocateMe(): UseLocateMeResult {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateErrorKind | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const denialCountRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const refreshServices = useCallback(async (): Promise<boolean> => {
    const enabled = await isServicesEnabled();
    setError(prev =>
      enabled ? (prev === 'servicesOff' ? null : prev) : 'servicesOff',
    );
    return enabled;
  }, []);

  const enableServices = useCallback(async (): Promise<boolean> => {
    const enabled = await enableDeviceLocation();
    if (!enabled) return false;
    // Dialog success — the stale services-off copy is already wrong.
    setError(prev => (prev === 'servicesOff' ? null : prev));
    return true;
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      // Services BEFORE permission: with the master switch off the
      // permission ask is noise — name the real problem instead.
      if (!(await isServicesEnabled())) {
        setError('servicesOff');
        return null;
      }
      let perm;
      try {
        perm = await requestLocationPermission();
      } catch {
        // The permission call itself failed (geolocation rethrows plumbing
        // errors) — the same user-facing shape as a failed fix, never an
        // unhandled rejection.
        setError('failed');
        return null;
      }
      if (perm.status !== 'granted') {
        denialCountRef.current += 1;
        setCanOpenSettings(denialCountRef.current >= 2);
        setError('denied');
        return null;
      }
      try {
        const coords = await getCurrentPosition();
        // A mid-capture refreshServices could have set servicesOff after the
        // initial clear — a fresh fix always wins, never a stale block.
        setError(null);
        return { latitude: coords.latitude, longitude: coords.longitude };
      } catch (err) {
        const kind = await classifyCaptureFailure(err);
        if (kind === 'permission') {
          denialCountRef.current += 1;
          setCanOpenSettings(denialCountRef.current >= 2);
          setError('denied');
        } else if (kind === 'servicesOff') {
          setError('servicesOff');
        } else if (kind === 'timeout') {
          setError('timeout');
        } else {
          // Codeless sources keep the legacy message fallback so a raw
          // Error('… timed out') still lands in `timeout`.
          const message = err instanceof Error ? err.message : String(err);
          setError(message.includes('timed out') ? 'timeout' : 'failed');
        }
        return null;
      }
    } finally {
      setLocating(false);
    }
  }, []);

  const errorMessage =
    error === 'denied'
      ? LOCATE_DENIED_MESSAGE
      : error === 'servicesOff'
        ? LOCATE_SERVICES_OFF_MESSAGE
        : error === 'timeout'
          ? LOCATE_TIMEOUT_MESSAGE
          : error === 'failed'
            ? LOCATE_FAILED_MESSAGE
            : null;

  return {
    locate,
    locating,
    error,
    errorKind: error,
    errorMessage,
    canOpenSettings,
    clearError,
    openSettings,
    enableServices,
    refreshServices,
  };
}
