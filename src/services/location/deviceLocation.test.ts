/**
 * deviceLocation tests — the I/O-matrix corners for the shared device-state
 * helpers (location-services-off feature, 2026-10-17):
 *
 *  - classifyCaptureFailure: codes 2/4/5 re-probe services (the
 *    discriminator between a mid-capture services flip and a real
 *    transient); 1=permission, 3=timeout, anything else (incl. -1, codeless,
 *    null) is transient — never misclassified as a device state.
 *  - The enable-location ladder: Android dialog → GUARDED
 *    ACTION_LOCATION_SOURCE_SETTINGS intent → app settings, with try/catch
 *    per rung (an OEM skin that throws for the intent can never crash the
 *    tap); iOS is openSettings alone and NEVER attempts the dialog.
 *  - Probe fail-modes: services probe fails OPEN (true), permission probe
 *    fails CLOSED (false).
 *
 * `react-native` is mocked to just the surface deviceLocation uses
 * (Linking.openSettings/sendIntent + Platform.OS), so every rung is driven
 * with mocks; nitro is mocked at its module boundary.
 */
jest.mock('react-native', () => ({
  Linking: { openSettings: jest.fn(), sendIntent: jest.fn() },
  Platform: { OS: 'android' },
  PermissionsAndroid: {
    check: jest.fn(async () => true),
    PERMISSIONS: { ACCESS_FINE_LOCATION: 'access_fine_location' },
  },
}));

jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  checkPermission: jest.fn(async () => 'granted'),
  hasServicesEnabled: jest.fn(async () => true),
  requestLocationSettings: jest.fn(
    async () => ({ locationServicesEnabled: true }),
  ),
}));

import { Linking, PermissionsAndroid, Platform } from 'react-native';
import {
  checkPermission,
  hasServicesEnabled,
  requestLocationSettings,
} from 'react-native-nitro-geolocation';
import {
  classifyCaptureFailure,
  enableDeviceLocation,
  hasLocationPermission,
  isServicesEnabled,
  openDeviceLocationSettings,
  showEnableLocationDialog,
} from './deviceLocation';

const servicesMock = hasServicesEnabled as jest.Mock;
const dialogMock = requestLocationSettings as jest.Mock;
const fineCheckMock = PermissionsAndroid.check as jest.Mock;
const checkMock = checkPermission as jest.Mock;
const sendIntentMock = Linking.sendIntent as jest.Mock;
const openSettingsMock = Linking.openSettings as jest.Mock;

/** Platform.OS is consumed at call time — flipping it per test keeps one
 *  import graph. Saved/restored so the suite never leaks an OS. */
const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function withCode(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  jest.resetAllMocks();
  useOs('android');
  // Healthy defaults (re-seeded after resetAllMocks wipes the factory
  // implementations): services on, dialog succeeds, permission granted.
  servicesMock.mockResolvedValue(true);
  fineCheckMock.mockResolvedValue(true);
  dialogMock.mockResolvedValue({ locationServicesEnabled: true });
  checkMock.mockResolvedValue('granted');
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
});

describe('isServicesEnabled — the probe', () => {
  it('services on → true', async () => {
    servicesMock.mockResolvedValueOnce(true);
    await expect(isServicesEnabled()).resolves.toBe(true);
  });

  it('services off → false', async () => {
    servicesMock.mockResolvedValueOnce(false);
    await expect(isServicesEnabled()).resolves.toBe(false);
  });

  it('an UNDEFINED answer is not "off" (wiped mock / native hiccup) → true', async () => {
    servicesMock.mockResolvedValueOnce(undefined);
    await expect(isServicesEnabled()).resolves.toBe(true);
  });

  it('a THROWN probe fails OPEN → true (a failed probe must never block a flow)', async () => {
    servicesMock.mockRejectedValueOnce(new Error('bridge dead'));
    await expect(isServicesEnabled()).resolves.toBe(true);
  });
});

describe('hasLocationPermission — the check-only probe (Android gates on FINE specifically)', () => {
  it('FINE granted → true; nitro checkPermission is never consulted on Android', async () => {
    fineCheckMock.mockResolvedValueOnce(true);
    await expect(hasLocationPermission()).resolves.toBe(true);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('FINE not granted → false even when nitro reports granted — a coarse-only user must still get the precise ask (parity with the old FINE gate)', async () => {
    fineCheckMock.mockResolvedValueOnce(false);
    checkMock.mockResolvedValueOnce('granted');
    await expect(hasLocationPermission()).resolves.toBe(false);
  });

  it('a thrown FINE check fails CLOSED → false (routes to the recoverable permission remediation)', async () => {
    fineCheckMock.mockRejectedValueOnce(new Error('bridge dead'));
    await expect(hasLocationPermission()).resolves.toBe(false);
  });

  it('iOS: nitro checkPermission decides — granted → true, denied → false', async () => {
    useOs('ios');
    checkMock.mockResolvedValueOnce('granted');
    await expect(hasLocationPermission()).resolves.toBe(true);

    checkMock.mockResolvedValueOnce('denied');
    await expect(hasLocationPermission()).resolves.toBe(false);
  });
});

describe('classifyCaptureFailure — the four-state vocabulary (matrix: capture fails codes 2/4/5 after a positive probe)', () => {
  it('code 2 + services re-probed ON → transient (no misclassification)', async () => {
    servicesMock.mockResolvedValueOnce(true);
    await expect(
      classifyCaptureFailure(withCode(2, 'position unavailable')),
    ).resolves.toBe('transient');
  });

  it('code 2 + services re-probed OFF → servicesOff (the mid-capture flip)', async () => {
    servicesMock.mockResolvedValueOnce(false);
    await expect(
      classifyCaptureFailure(withCode(2, 'position unavailable')),
    ).resolves.toBe('servicesOff');
  });

  it.each([4, 5])(
    'code %i obeys the same re-probe discriminator (on → transient, off → servicesOff)',
    async code => {
      servicesMock.mockResolvedValueOnce(true);
      await expect(classifyCaptureFailure(withCode(code, 'device'))).resolves.toBe(
        'transient',
      );

      servicesMock.mockResolvedValueOnce(false);
      await expect(classifyCaptureFailure(withCode(code, 'device'))).resolves.toBe(
        'servicesOff',
      );
    },
  );

  it('code 1 → permission WITHOUT consulting the services probe', async () => {
    await expect(
      classifyCaptureFailure(withCode(1, 'permission denied')),
    ).resolves.toBe('permission');
    expect(servicesMock).not.toHaveBeenCalled();
  });

  it('code 3 → timeout WITHOUT consulting the services probe', async () => {
    await expect(
      classifyCaptureFailure(withCode(3, 'timed out')),
    ).resolves.toBe('timeout');
    expect(servicesMock).not.toHaveBeenCalled();
  });

  it('code -1 (internal) → transient even with services OFF — unknown is never a device state', async () => {
    servicesMock.mockResolvedValue(false);
    await expect(
      classifyCaptureFailure(withCode(-1, 'internal error')),
    ).resolves.toBe('transient');
  });

  it('a codeless Error → transient (the caller message fallback owns it)', async () => {
    await expect(
      classifyCaptureFailure(new Error('Location request timed out')),
    ).resolves.toBe('transient');
  });

  it('a null/non-error throw → transient (never crashes the classifier)', async () => {
    await expect(classifyCaptureFailure(null)).resolves.toBe('transient');
    await expect(classifyCaptureFailure('string throw')).resolves.toBe(
      'transient',
    );
  });
});

describe('showEnableLocationDialog — the Android one-tap rung', () => {
  it('dialog reports services enabled → true (the caller auto-retries the flow)', async () => {
    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: true });
    await expect(showEnableLocationDialog()).resolves.toBe(true);
    expect(dialogMock).toHaveBeenCalledTimes(1);
  });

  it('dialog dismissed (services still off) → false — fall down the ladder', async () => {
    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    await expect(showEnableLocationDialog()).resolves.toBe(false);
  });

  it('dialog THROWS but services are actually ON → true (the Android 17 acceptance race: nitro re-checks its strict options and rejects even after the user enabled location — the device state wins, no settings trip)', async () => {
    dialogMock.mockRejectedValueOnce(new Error('settings do not satisfy'));
    servicesMock.mockResolvedValueOnce(true);
    await expect(showEnableLocationDialog()).resolves.toBe(true);
    expect(sendIntentMock).not.toHaveBeenCalled();
    expect(openSettingsMock).not.toHaveBeenCalled();
  });

  it('dialog THROWS and services are still OFF → false, never a rejection', async () => {
    dialogMock.mockRejectedValueOnce(new Error('no dialog here'));
    servicesMock.mockResolvedValueOnce(false);
    await expect(showEnableLocationDialog()).resolves.toBe(false);
  });

  it('iOS: no dialog exists — resolves true as a no-op and NEVER calls nitro', async () => {
    useOs('ios');
    await expect(showEnableLocationDialog()).resolves.toBe(true);
    expect(dialogMock).not.toHaveBeenCalled();
  });
});

describe('openDeviceLocationSettings — the guarded settings rungs (matrix: Picker [Turn on location])', () => {
  it('Android: fires the exact location-source intent; app settings untouched', async () => {
    sendIntentMock.mockResolvedValueOnce(undefined);
    await expect(openDeviceLocationSettings()).resolves.toBe(false);
    expect(sendIntentMock).toHaveBeenCalledWith(
      'android.settings.LOCATION_SOURCE_SETTINGS',
    );
    expect(openSettingsMock).not.toHaveBeenCalled();
  });

  it('Android: intent THROWS (OEM skin) → falls through to Linking.openSettings — the crash guard', async () => {
    sendIntentMock.mockRejectedValueOnce(new Error('ActivityNotFoundException'));
    await expect(openDeviceLocationSettings()).resolves.toBe(false);
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('Android: intent throws AND openSettings throws → still resolves false (a settings tap can never crash)', async () => {
    sendIntentMock.mockRejectedValueOnce(new Error('no intent'));
    openSettingsMock.mockRejectedValueOnce(new Error('no settings'));
    await expect(openDeviceLocationSettings()).resolves.toBe(false);
  });

  it('iOS: straight to openSettings; the Android intent is NEVER attempted', async () => {
    useOs('ios');
    await expect(openDeviceLocationSettings()).resolves.toBe(false);
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(sendIntentMock).not.toHaveBeenCalled();
  });

  it('iOS: openSettings throwing still resolves false (no-op safe)', async () => {
    useOs('ios');
    openSettingsMock.mockRejectedValueOnce(new Error('no settings'));
    await expect(openDeviceLocationSettings()).resolves.toBe(false);
  });
});

describe('enableDeviceLocation — the composed ladder', () => {
  it('Android: dialog success → true, and the settings rungs are NEVER touched', async () => {
    await expect(enableDeviceLocation()).resolves.toBe(true);
    expect(dialogMock).toHaveBeenCalledTimes(1);
    expect(sendIntentMock).not.toHaveBeenCalled();
    expect(openSettingsMock).not.toHaveBeenCalled();
  });

  it('Android: dialog resolved false → the guarded settings intent fires', async () => {
    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    await expect(enableDeviceLocation()).resolves.toBe(false);
    expect(sendIntentMock).toHaveBeenCalledTimes(1);
  });

  it('Android: dialog THROWS on a still-off device → the ladder still falls to the settings intent (try/catch per rung)', async () => {
    dialogMock.mockRejectedValueOnce(new Error('dialog exploded'));
    servicesMock.mockResolvedValueOnce(false);
    await expect(enableDeviceLocation()).resolves.toBe(false);
    expect(sendIntentMock).toHaveBeenCalledTimes(1);
  });

  it('Android: dialog rejects but the device actually turned ON → true; the settings rungs are NEVER touched (the observed Pixel 6 / Android 17 race)', async () => {
    dialogMock.mockRejectedValueOnce(new Error('settings do not satisfy'));
    servicesMock.mockResolvedValueOnce(true);
    await expect(enableDeviceLocation()).resolves.toBe(true);
    expect(sendIntentMock).not.toHaveBeenCalled();
    expect(openSettingsMock).not.toHaveBeenCalled();
  });

  it('Android: dialog false + intent throws → the LAST rung (openSettings) catches the fall', async () => {
    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    sendIntentMock.mockRejectedValueOnce(new Error('no intent'));
    await expect(enableDeviceLocation()).resolves.toBe(false);
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('iOS: openSettings alone — the native dialog is NEVER attempted and it resolves false', async () => {
    useOs('ios');
    await expect(enableDeviceLocation()).resolves.toBe(false);
    expect(dialogMock).not.toHaveBeenCalled();
    expect(sendIntentMock).not.toHaveBeenCalled();
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });
});
