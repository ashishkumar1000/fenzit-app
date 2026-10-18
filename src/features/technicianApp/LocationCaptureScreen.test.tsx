/**
 * LocationCaptureScreen tests — the verify-location step's phased contract
 * (location-services-off feature, 2026-10-17; user decisions 1a/2a):
 *
 *  - BLOCKED states (services off, permission denied) NEVER fire the
 *    advance RPC — a user-fixable device state cannot post null coordinates.
 *  - Services-off copy names the device toggle; [Turn on location] runs the
 *    enable ladder and an Android dialog success auto-captures (one-tap
 *    recovery); the foreground return re-probes CHECK-ONLY (no re-prompt
 *    loops).
 *  - Permission-denied re-asks via [Allow location]; a SECOND denial adds
 *    the [Open settings] route; a granted re-ask proceeds to capture.
 *  - GPS timeout = [Try again]; only after a SECOND failed attempt does the
 *    explicit [Continue without location] appear, posting the null advance
 *    with the visible skip note — explicit, not silent.
 *  - An advance POST failure retries the SAME payload with the SAME
 *    idempotency key.
 *  - Regression guard: the healthy path advances once with real
 *    coordinates and goes back, exactly as before.
 *
 * Mocked at module boundaries (./geolocation, jobService, idempotency — the
 * SignatureScreen suite's idiom); deviceLocation runs REAL over a local
 * nitro mock (the global shape plus `requestLocationSettings`).
 */
jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  requestPermission: jest.fn(async () => 'granted'),
  getCurrentPosition: jest.fn(),
  checkPermission: jest.fn(async () => 'granted'),
  getAccuracyAuthorization: jest.fn(async () => 'full'),
  getProviderStatus: jest.fn(async () => ({
    locationServicesEnabled: true,
    backgroundModeEnabled: false,
  })),
  hasServicesEnabled: jest.fn(async () => true),
  requestLocationSettings: jest.fn(
    async () => ({ locationServicesEnabled: true }),
  ),
}));

jest.mock('./geolocation', () => ({
  getCurrentPosition: jest.fn(),
  requestLocationPermission: jest.fn(),
}));

jest.mock('../../services', () => ({
  jobService: { advanceWorkflow: jest.fn() },
}));

jest.mock('../../utils/idempotency', () => ({
  generateIdempotencyKey: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState, Linking, PermissionsAndroid, Platform, Text } from 'react-native';
import {
  checkPermission,
  hasServicesEnabled,
  requestLocationSettings,
} from 'react-native-nitro-geolocation';
import { Button } from '../../components/ui';
import { jobService } from '../../services';
import { generateIdempotencyKey } from '../../utils/idempotency';
import {
  getCurrentPosition,
  requestLocationPermission,
} from './geolocation';
import { LocationCaptureScreen } from './LocationCaptureScreen';

const servicesMock = hasServicesEnabled as jest.Mock;
const dialogMock = requestLocationSettings as jest.Mock;
const checkPermissionMock = checkPermission as jest.Mock;
const fixMock = getCurrentPosition as jest.Mock;
const permissionMock = requestLocationPermission as jest.Mock;
const advanceMock = jobService.advanceWorkflow as jest.Mock;
const keyMock = generateIdempotencyKey as jest.Mock;

// Contractual copy (I/O matrix) — asserted as literals so a copy drift
// fails the test even if the module constant moves.
const BLOCKED_SERVICES =
  "We couldn't verify your location because location services are off on this device.";
const BLOCKED_PERMISSION = 'Fenzit needs location access to verify this step.';
const TIMEOUT_COPY = 'Getting your location took too long. Try again.';
const FAILED_COPY = 'Could not get your location. Try again.';
const SKIP_NOTE = 'This step will be recorded without a location.';

// Platform.OS is consumed by the enable ladder at call time — pinned to
// android (the dialog path) and restored so the suite never leaks an OS.
const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

let openSettingsSpy: jest.SpyInstance;
let fineCheckSpy: jest.SpyInstance;
let appStateSpy: jest.SpyInstance;
let appStateListener: ((state: string) => void) | null = null;

// react-test-renderer has no automatic cleanup — unmount everything after
// each test so listeners can't outlive the suite.
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderCapture() {
  const navigation = { goBack: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <LocationCaptureScreen
        navigation={navigation as never}
        route={
          { params: { jobId: 'job-1', stepKey: 'verify_location' } } as never
        }
      />,
    );
  });
  renderers.push(renderer);
  return { root: renderer.root, navigation, renderer };
}

/** Drains the probe→capture→advance promise chain (all native promises —
 *  microtask ticks suffice; no timers involved). */
async function settle(ticks = 10) {
  await act(async () => {
    for (let i = 0; i < ticks; i++) await Promise.resolve();
  });
}

function findButton(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAllByType(Button).find(b => b.props.children === label);
}

function expectButton(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const button = findButton(root, label);
  if (!button) throw new Error(`Button "${label}" not found`);
  return button;
}

function expectNoButton(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  expect(findButton(root, label)).toBeUndefined();
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Text).some(t => t.props.children === text);
}

async function press(label: string, root: ReactTestRenderer.ReactTestInstance) {
  const button = expectButton(root, label);
  await act(async () => {
    button.props.onPress?.();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

function withCode(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  jest.resetAllMocks();
  useOs('android');
  // Healthy defaults (re-seeded after resetAllMocks wipes factory impls):
  // services on, permission granted, advance succeeds, one idempotency key.
  servicesMock.mockResolvedValue(true);
  dialogMock.mockResolvedValue({ locationServicesEnabled: true });
  checkPermissionMock.mockResolvedValue('granted');
  keyMock.mockReturnValue('key-1');
  advanceMock.mockResolvedValue({});
  appStateListener = null;
  appStateSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_type: string, listener: never) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    }) as never);
  openSettingsSpy = jest
    .spyOn(Linking, 'openSettings')
    .mockImplementation(async () => {});
  fineCheckSpy = jest
    .spyOn(PermissionsAndroid, 'check')
    .mockResolvedValue(true as never);
});

afterEach(() => {
  while (renderers.length > 0) {
    const renderer = renderers.pop()!;
    act(() => renderer.unmount());
  }
  appStateSpy.mockRestore();
  openSettingsSpy.mockRestore();
  fineCheckSpy.mockRestore();
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
});

describe('Verify step, services OFF (matrix row: BLOCKED, advance RPC never fires)', () => {
  it('shows the named-cause copy + [Turn on location]; NO permission prompt, NO capture, advance NEVER fires', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderCapture();
    await settle();

    expect(hasText(root, BLOCKED_SERVICES)).toBe(true);
    expectButton(root, 'Turn on location');
    expectButton(root, 'Cancel');
    expect(permissionMock).not.toHaveBeenCalled();
    expect(fixMock).not.toHaveBeenCalled();
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('Cancel goes back without advancing', async () => {
    servicesMock.mockResolvedValue(false);
    const { root, navigation } = renderCapture();
    await settle();

    await press('Cancel', root);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('[Turn on location] with an Android dialog SUCCESS auto-captures (one-tap recovery) and advances with real coords', async () => {
    servicesMock.mockResolvedValue(false);
    const { root, navigation } = renderCapture();
    await settle();
    fixMock.mockResolvedValueOnce({ latitude: 12.9716, longitude: 77.5946, accuracy: 9 });

    await press('Turn on location', root);

    expect(dialogMock).toHaveBeenCalledTimes(1);
    expect(fixMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'verify_location', 'key-1', {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 9,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('the foreground RETURN re-probes check-only: services back on → capture proceeds WITHOUT a second permission prompt', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderCapture();
    await settle();
    expect(hasText(root, BLOCKED_SERVICES)).toBe(true);

    servicesMock.mockResolvedValue(true);
    fixMock.mockResolvedValueOnce({ latitude: 1, longitude: 2, accuracy: 5 });
    await act(async () => {
      appStateListener!('active');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(fixMock).toHaveBeenCalledTimes(1);
    expect(permissionMock).not.toHaveBeenCalled();
    expect(advanceMock).toHaveBeenCalledTimes(1);
  });

  it('a BACKGROUND event changes nothing while blocked (active is the only return signal)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderCapture();
    await settle();

    await act(async () => {
      appStateListener!('background');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(hasText(root, BLOCKED_SERVICES)).toBe(true);
    expect(fixMock).not.toHaveBeenCalled();
    expect(advanceMock).not.toHaveBeenCalled();
  });
});

describe('Verify step, permission DENIED (matrix row: BLOCKED, user decision 1a)', () => {
  function renderDenied() {
    servicesMock.mockResolvedValue(true);
    fineCheckSpy.mockResolvedValue(false as never); // the FINE probe gates the entry ask (patch F)
    checkPermissionMock.mockResolvedValue('denied' as never);
    permissionMock.mockResolvedValue({ status: 'denied' });
    return renderCapture();
  }

  it('denied at the entry ask → blockedPermission copy + [Allow location]; NO [Open settings] yet; advance NEVER fires', async () => {
    const { root } = renderDenied();
    await settle();

    expect(hasText(root, BLOCKED_PERMISSION)).toBe(true);
    expectButton(root, 'Allow location');
    expectButton(root, 'Cancel');
    expectNoButton(root, 'Open settings');
    expect(fixMock).not.toHaveBeenCalled();
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('a SECOND denial adds [Open settings]; pressing it opens app settings (the never-ask-again route)', async () => {
    const { root } = renderDenied();
    await settle();

    await press('Allow location', root);

    expectButton(root, 'Open settings');
    expect(openSettingsSpy).not.toHaveBeenCalled();

    await press('Open settings', root);
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('[Allow location] GRANTED → capture proceeds and advances with real coords', async () => {
    const { root, navigation } = renderDenied();
    await settle();

    permissionMock.mockResolvedValueOnce({ status: 'granted' });
    fixMock.mockResolvedValueOnce({ latitude: 19.07, longitude: 72.87, accuracy: 11 });
    await press('Allow location', root);

    expect(fixMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'verify_location', 'key-1', {
      latitude: 19.07,
      longitude: 72.87,
      accuracy: 11,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('the foreground re-probe while blocked is CHECK-ONLY — no permission re-prompt loop, still blocked', async () => {
    const { root } = renderDenied();
    await settle();
    expect(permissionMock).toHaveBeenCalledTimes(1); // the one entry ask

    await act(async () => {
      appStateListener!('active');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(permissionMock).toHaveBeenCalledTimes(1); // never re-prompted
    expect(hasText(root, BLOCKED_PERMISSION)).toBe(true);
    expect(advanceMock).not.toHaveBeenCalled();
  });
});

describe('Verify step, GPS timeout (matrix row: retry then explicit Continue without location, decision 2a)', () => {
  it('FIRST timeout → timeout copy + [Try again]; NO [Continue without location], NO skip note', async () => {
    fixMock.mockRejectedValueOnce(withCode(3, 'Location request timed out'));
    const { root } = renderCapture();
    await settle();

    expect(hasText(root, TIMEOUT_COPY)).toBe(true);
    expect(hasText(root, FAILED_COPY)).toBe(false);
    expectButton(root, 'Try again');
    expectNoButton(root, 'Continue without location');
    expect(hasText(root, SKIP_NOTE)).toBe(false);
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('a non-timeout transient (code 2, services still on) shows the generic failed copy — never the timeout copy', async () => {
    fixMock.mockRejectedValueOnce(withCode(2, 'position unavailable'));
    const { root } = renderCapture();
    await settle();

    expect(hasText(root, FAILED_COPY)).toBe(true);
    expect(hasText(root, TIMEOUT_COPY)).toBe(false);
    expectNoButton(root, 'Continue without location');
  });

  it('after the SECOND failure → skip note + [Continue without location]; pressing it posts the NULL advance once and goes back', async () => {
    fixMock.mockRejectedValue(withCode(3, 'Location request timed out'));
    const { root, navigation } = renderCapture();
    await settle();
    expectNoButton(root, 'Continue without location');

    await press('Try again', root);

    expect(hasText(root, SKIP_NOTE)).toBe(true);
    expectButton(root, 'Continue without location');

    await press('Continue without location', root);

    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'verify_location', 'key-1', {
      latitude: null,
      longitude: null,
      accuracy: null,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('a retried capture that SUCCEEDS clears the failure and advances with the real fix', async () => {
    fixMock.mockRejectedValueOnce(withCode(3, 'Location request timed out'));
    const { root, navigation } = renderCapture();
    await settle();

    fixMock.mockResolvedValueOnce({ latitude: 5, longitude: 6, accuracy: 7 });
    await press('Try again', root);

    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'verify_location', 'key-1', {
      latitude: 5,
      longitude: 6,
      accuracy: 7,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('advance POST failure (the advanceFailed phase)', () => {
  it('retry posts the SAME payload with the SAME idempotency key, then goes back on success', async () => {
    fixMock.mockResolvedValue({ latitude: 12.9, longitude: 77.5, accuracy: 8 });
    advanceMock.mockRejectedValueOnce(new Error('network down'));
    const { root, navigation } = renderCapture();
    await settle();

    expect(hasText(root, 'network down')).toBe(true);
    expectButton(root, 'Try again');
    expect(navigation.goBack).not.toHaveBeenCalled();

    await press('Try again', root);

    expect(advanceMock).toHaveBeenCalledTimes(2);
    const [first, second] = advanceMock.mock.calls;
    expect(second).toEqual(first); // same step, SAME key, same payload
    expect(first).toEqual(['job-1', 'verify_location', 'key-1', {
      latitude: 12.9,
      longitude: 77.5,
      accuracy: 8,
    }]);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('Cancel from advanceFailed goes back WITHOUT posting anything else', async () => {
    fixMock.mockResolvedValue({ latitude: 12.9, longitude: 77.5, accuracy: 8 });
    advanceMock.mockRejectedValue(new Error('network down'));
    const { root, navigation } = renderCapture();
    await settle();

    expect(advanceMock).toHaveBeenCalledTimes(1);
    await press('Cancel', root);

    expect(advanceMock).toHaveBeenCalledTimes(1); // no surprise second submit
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('healthy verify (regression guard — behave exactly as today)', () => {
  it('services on + permission granted + fix → ONE advance with real coords, then goBack; no blocked copy ever shows', async () => {
    fixMock.mockResolvedValueOnce({ latitude: 13.01, longitude: 80.22, accuracy: 14 });
    const { root, navigation } = renderCapture();
    await settle();

    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'verify_location', 'key-1', {
      latitude: 13.01,
      longitude: 80.22,
      accuracy: 14,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(permissionMock).not.toHaveBeenCalled(); // already granted — no prompt
    expect(hasText(root, BLOCKED_SERVICES)).toBe(false);
    expect(hasText(root, BLOCKED_PERMISSION)).toBe(false);
  });
});

describe('review patches (2026-10-18 triage)', () => {
  it('a mid-capture back-out NEVER advances — resolving the fix after unmount posts nothing', async () => {
    servicesMock.mockResolvedValue(true);
    let resolveFix!: (v: {
      latitude: number;
      longitude: number;
      accuracy: number;
    }) => void;
    fixMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveFix = resolve;
      }),
    );
    const { renderer } = renderCapture();
    await settle();
    expect(advanceMock).not.toHaveBeenCalled();

    // The back-out unmounts the screen while the fix is in flight…
    act(() => renderer.unmount());
    // …and the fix landing afterwards must not surprise-post the step.
    resolveFix({ latitude: 1, longitude: 2, accuracy: 5 });
    await settle();
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('an entry permission-ask THROW lands in blockedPermission — never a stuck spinner, never an advance; busy resets', async () => {
    servicesMock.mockResolvedValue(true);
    fineCheckSpy.mockResolvedValue(false as never);
    permissionMock.mockRejectedValueOnce(new Error('bridge died mid-ask'));
    const { root } = renderCapture();
    await settle();

    expect(hasText(root, BLOCKED_PERMISSION)).toBe(true);
    expect(advanceMock).not.toHaveBeenCalled();
    // Patch A: the failed ask must not leave [Allow location] stuck disabled.
    const allow = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Allow location');
    expect(allow).toBeDefined();
    expect(allow!.props.disabled).toBeFalsy();
  });
});
