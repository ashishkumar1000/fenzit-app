/**
 * Tests for useLocateMe: the permission→fix pipeline and the distinct
 * failure shapes the map picker renders — denied (plus the Settings
 * deep-link only after a SECOND denial), a timeout message distinct from
 * denied, a generic fix failure, and the fresh fix resolving the
 * coordinates. `geolocation` is mocked at its module boundary; `Linking`
 * is mocked so `openSettings` never leaves the test runtime.
 *
 * Location-services-off additions (2026-10-17): the probe-first contract
 * (services BEFORE permission, and with the master switch off the
 * permission ask is never even attempted), the `servicesOff` state and its
 * exact copy, `.code`-primary capture classification (including the
 * mid-capture flip), the enableServices/refreshServices recovery loop, and
 * the legacy codeless /timed out/ message fallback kept deliberately.
 * nitro is mocked locally (the global shape plus `requestLocationSettings`,
 * which only the enable ladder needs) so the REAL deviceLocation helpers
 * run underneath the hook.
 */
jest.mock('react-native', () => ({
  Linking: { openSettings: jest.fn(), sendIntent: jest.fn() },
  Platform: { OS: 'android' },
}));

jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  requestPermission: jest.fn(async () => 'granted'),
  getCurrentPosition: jest.fn(),
  checkPermission: jest.fn(async () => 'granted'),
  hasServicesEnabled: jest.fn(async () => true),
  requestLocationSettings: jest.fn(
    async () => ({ locationServicesEnabled: true }),
  ),
}));

jest.mock('../../technicianApp/geolocation', () => ({
  requestLocationPermission: jest.fn(),
  getCurrentPosition: jest.fn(),
}));

import { Linking } from 'react-native';
import { hasServicesEnabled, requestLocationSettings } from 'react-native-nitro-geolocation';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../../technicianApp/geolocation';
import {
  LOCATE_DENIED_MESSAGE,
  LOCATE_FAILED_MESSAGE,
  LOCATE_SERVICES_OFF_MESSAGE,
  LOCATE_TIMEOUT_MESSAGE,
  useLocateMe,
} from './useLocateMe';

const requestPermissionMock = requestLocationPermission as jest.Mock;
const getCurrentPositionMock = getCurrentPosition as jest.Mock;
const openSettingsMock = Linking.openSettings as jest.Mock;
const servicesMock = hasServicesEnabled as jest.Mock;
const dialogMock = requestLocationSettings as jest.Mock;

let probe: ReturnType<typeof useLocateMe>;
function Probe() {
  probe = useLocateMe();
  return null;
}

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

function renderProbe() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

async function locateAndFlush() {
  let result: { latitude: number; longitude: number } | null = null;
  await act(async () => {
    result = await probe.locate();
  });
  return result;
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: locate()'s early returns (services
  // off, denials) can leave `mockResolvedValueOnce` queues UNCONSUMED, and
  // clearAllMocks keeps those queues — a leaked once-impl then poisons the
  // NEXT test's locate. Resetting gives every test a clean queue; each test
  // seeds exactly what it consumes. The services default is re-seeded
  // explicitly (healthy ON) instead of leaning on the fail-open rule.
  jest.resetAllMocks();
  servicesMock.mockResolvedValue(true);
  renderProbe();
});

describe('the happy path', () => {
  it('requests a FRESH fix and resolves the coordinates', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockResolvedValueOnce({
      latitude: 19.1364,
      longitude: 72.8296,
      accuracy: 12,
    });

    const result = await locateAndFlush();

    expect(result).toEqual({ latitude: 19.1364, longitude: 72.8296 });
    expect(getCurrentPositionMock).toHaveBeenCalledWith();
    expect(probe.error).toBeNull();
    expect(probe.errorMessage).toBeNull();
    expect(probe.locating).toBe(false);
  });
});

describe('permission denial', () => {
  it('maps a denial to the denied message and no fix attempt', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(probe.error).toBe('denied');
    expect(probe.errorMessage).toBe(LOCATE_DENIED_MESSAGE);
    expect(probe.canOpenSettings).toBe(false);
  });

  it('offers the Settings deep-link only after a SECOND denial', async () => {
    requestPermissionMock.mockResolvedValue({ status: 'denied' });

    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(false);

    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(true);
  });

  it('a grant after denials resets neither the flag nor the copy incorrectly', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    await locateAndFlush();
    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(true);

    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockResolvedValueOnce({ latitude: 1, longitude: 2, accuracy: 5 });
    const result = await locateAndFlush();

    expect(result).toEqual({ latitude: 1, longitude: 2 });
    expect(probe.error).toBeNull();
    expect(probe.errorMessage).toBeNull();
  });

  it('clearError resets the copy; openSettings delegates to Linking', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    await locateAndFlush();
    expect(probe.errorMessage).toBe(LOCATE_DENIED_MESSAGE);

    act(() => {
      probe.clearError();
    });
    expect(probe.errorMessage).toBeNull();

    act(() => {
      probe.openSettings();
    });
    expect(openSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe('fix failures', () => {
  it('maps a timeout error message to the distinct timeout copy', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(new Error('Location request timed out'));

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.error).toBe('timeout');
    expect(probe.errorMessage).toBe(LOCATE_TIMEOUT_MESSAGE);
  });

  it('maps any other fix failure to the generic failure copy', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(new Error('Location services unavailable'));

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.error).toBe('failed');
    expect(probe.errorMessage).toBe(LOCATE_FAILED_MESSAGE);
  });
});

describe('services-off probe (the named-cause state, 2026-10-17)', () => {
  it('services OFF → servicesOff state with the EXACT matrix copy; the permission ask and capture NEVER run', async () => {
    servicesMock.mockResolvedValueOnce(false);

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.errorKind).toBe('servicesOff');
    expect(probe.error).toBe('servicesOff');
    expect(probe.errorMessage).toBe(
      'Location services are turned off on your device. Turn them on to place the pin.',
    );
    expect(probe.errorMessage).toBe(LOCATE_SERVICES_OFF_MESSAGE);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
  });

  it('the services probe beats the permission ask (probe-first ordering)', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockResolvedValueOnce({ latitude: 1, longitude: 2, accuracy: 5 });

    await locateAndFlush();

    expect(servicesMock).toHaveBeenCalled();
    expect(requestPermissionMock).toHaveBeenCalled();
    expect(servicesMock.mock.invocationCallOrder[0]).toBeLessThan(
      requestPermissionMock.mock.invocationCallOrder[0],
    );
  });

  it('mid-capture flip: a code-2 fix failure with services re-probed OFF lands in servicesOff, never "failed"', async () => {
    servicesMock.mockResolvedValueOnce(true); // the start-of-locate probe
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(
      Object.assign(new Error('Location services unavailable'), { code: 2 }),
    );
    servicesMock.mockResolvedValueOnce(false); // the re-probe after the failure

    const result = await locateAndFlush();

    expect(result).toBeNull();
    expect(probe.errorKind).toBe('servicesOff');
    expect(probe.errorMessage).toBe(LOCATE_SERVICES_OFF_MESSAGE);
  });

  it('a code-1 (permission) capture failure counts as a denial — the Settings deep-link still opens after the second one', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(
      Object.assign(new Error('Location permission denied'), { code: 1 }),
    );
    await locateAndFlush();
    expect(probe.errorKind).toBe('denied');
    expect(probe.errorMessage).toBe(LOCATE_DENIED_MESSAGE);
    expect(probe.canOpenSettings).toBe(false);

    requestPermissionMock.mockResolvedValueOnce({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(
      Object.assign(new Error('Location permission denied'), { code: 1 }),
    );
    await locateAndFlush();
    expect(probe.canOpenSettings).toBe(true);
  });

  it('a successful locate clears a PRIOR error at start (timeout → success leaves no stale copy)', async () => {
    requestPermissionMock.mockResolvedValue({ status: 'granted' });
    getCurrentPositionMock.mockRejectedValueOnce(new Error('Location request timed out'));
    await locateAndFlush();
    expect(probe.errorKind).toBe('timeout');

    getCurrentPositionMock.mockResolvedValueOnce({ latitude: 3, longitude: 4, accuracy: 6 });
    const result = await locateAndFlush();

    expect(result).toEqual({ latitude: 3, longitude: 4 });
    expect(probe.errorKind).toBeNull();
    expect(probe.errorMessage).toBeNull();
    expect(probe.locating).toBe(false);
  });
});

describe('enableServices / refreshServices — the recovery loop', () => {
  it('enableServices: dialog success clears the services-off state and resolves true', async () => {
    servicesMock.mockResolvedValueOnce(false);
    await locateAndFlush();
    expect(probe.errorKind).toBe('servicesOff');

    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: true });
    let enabled: boolean | null = null;
    await act(async () => {
      enabled = await probe.enableServices();
    });

    expect(enabled).toBe(true);
    expect(probe.errorKind).toBeNull();
    expect(probe.errorMessage).toBeNull();
  });

  it('enableServices: dialog dismissed → resolves false and the services-off copy STAYS', async () => {
    servicesMock.mockResolvedValueOnce(false);
    await locateAndFlush();

    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    let enabled: boolean | null = null;
    await act(async () => {
      enabled = await probe.enableServices();
    });

    expect(enabled).toBe(false);
    expect(probe.errorKind).toBe('servicesOff');
    expect(probe.errorMessage).toBe(LOCATE_SERVICES_OFF_MESSAGE);
  });

  it('refreshServices: services return → servicesOff clears', async () => {
    servicesMock.mockResolvedValueOnce(false);
    await locateAndFlush();
    expect(probe.errorKind).toBe('servicesOff');

    servicesMock.mockResolvedValueOnce(true);
    let enabled: boolean | null = null;
    await act(async () => {
      enabled = await probe.refreshServices();
    });

    expect(enabled).toBe(true);
    expect(probe.errorKind).toBeNull();
  });

  it('refreshServices: services go off → servicesOff appears; a NON-services error (denied) is left alone while services stay healthy', async () => {
    requestPermissionMock.mockResolvedValueOnce({ status: 'denied' });
    await locateAndFlush();
    expect(probe.errorKind).toBe('denied');

    servicesMock.mockResolvedValueOnce(true);
    let enabled: boolean | null = null;
    await act(async () => {
      enabled = await probe.refreshServices();
    });
    expect(enabled).toBe(true);
    expect(probe.errorKind).toBe('denied');

    servicesMock.mockResolvedValueOnce(false);
    await act(async () => {
      enabled = await probe.refreshServices();
    });
    expect(enabled).toBe(false);
    expect(probe.errorKind).toBe('servicesOff');
    expect(probe.errorMessage).toBe(LOCATE_SERVICES_OFF_MESSAGE);
  });
});
