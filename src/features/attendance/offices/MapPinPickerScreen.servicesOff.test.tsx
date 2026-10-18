/**
 * MapPinPickerScreen services-off wiring (location-services-off feature,
 * 2026-10-17) — the screen-level half of the picker matrix rows:
 *
 *  - Tapping "Use my current location" with the master switch off shows the
 *    services-off recovery block (warning notice with the EXACT matrix
 *    copy, [Turn on location], [Search address instead]) and NEVER the
 *    generic "Could not get your location" failure text; the permission ask
 *    is never even attempted (probe-first).
 *  - [Turn on location] with an Android dialog success AUTO re-locates —
 *    one-tap recovery, no second tap (the useLocateMe.enableServices →
 *    handleEnableServices → handleLocate wiring).
 *  - [Search address instead] opens the address sheet (the manual fallback
 *    the hint promises).
 *
 * The Confirm/return channel is pinned separately
 * (MapPinPickerScreen.customerPin.test.tsx); deviceLocation's ladder rungs
 * are pinned in deviceLocation.test.ts.
 */
jest.mock('../../../services', () => ({
  placesService: {
    reverse: jest.fn(),
  },
}));

jest.mock('../../addressPicker/AddressPickerSheet', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'address-picker-sheet', ...props }),
  };
});

jest.mock('../../technicianApp/geolocation', () => ({
  requestLocationPermission: jest.fn(),
  getCurrentPosition: jest.fn(),
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

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState, Platform, Text } from 'react-native';
import { hasServicesEnabled, requestLocationSettings } from 'react-native-nitro-geolocation';
import { Button } from '../../../components/ui';
import { placesService } from '../../../services';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../../technicianApp/geolocation';
import MapPinPickerScreen from './MapPinPickerScreen';

const servicesMock = hasServicesEnabled as jest.Mock;
const dialogMock = requestLocationSettings as jest.Mock;
const fixMock = getCurrentPosition as jest.Mock;
const permissionMock = requestLocationPermission as jest.Mock;
const reverseMock = placesService.reverse as jest.Mock;

const SERVICES_OFF_COPY =
  'Location services are turned off on your device. Turn them on to place the pin.';
const GENERIC_FAILED_COPY = 'Could not get your location. Try again.';

const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderPicker() {
  const navigation = { goBack: jest.fn(), popTo: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <MapPinPickerScreen
        navigation={navigation as never}
        route={
          {
            params: {
              mode: 'office',
              initialLatitude: 12.9716,
              initialLongitude: 77.5946,
            },
          } as never
        }
      />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, navigation };
}

function button(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAllByType(Button).find(b => b.props.children === label);
}

function expectButton(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const b = button(root, label);
  if (!b) throw new Error(`Button "${label}" not found`);
  return b;
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Text).some(t => t.props.children === text);
}

async function settle(ticks = 10) {
  await act(async () => {
    for (let i = 0; i < ticks; i++) await Promise.resolve();
  });
}

async function press(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const b = expectButton(root, label);
  await act(async () => {
    b.props.onPress?.();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  useOs('android');
  // resetAllMocks wipes the mock factory's impls — re-seed the healthy
  // dialog answer; tests override per case.
  dialogMock.mockResolvedValue({ locationServicesEnabled: true });
  reverseMock.mockResolvedValue({ formattedAddress: 'Baner Road, Pune' });
});

let appStateListener: ((state: string) => void) | null = null;
let appStateSpy: jest.SpyInstance;

afterEach(() => {
  while (mountedRenderers.length > 0) {
    const renderer = mountedRenderers.pop()!;
    act(() => renderer.unmount());
  }
});

beforeEach(() => {
  appStateListener = null;
  appStateSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_type: string, listener: never) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    }) as never);
});


afterAll(() => {
  appStateSpy?.mockRestore();
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
});

describe('MapPinPickerScreen — locate with services OFF (matrix row: named cause, never the generic failure)', () => {
  it('shows the EXACT services-off notice + [Turn on location] + [Search address instead]; NEVER the generic failed copy; no permission ask', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();

    await press(root, 'Use my current location');

    expect(hasText(root, SERVICES_OFF_COPY)).toBe(true);
    expect(hasText(root, GENERIC_FAILED_COPY)).toBe(false);
    expectButton(root, 'Turn on location');
    expectButton(root, 'Search address instead');
    expectButton(root, 'Confirm location'); // manual placement stays available
    expect(permissionMock).not.toHaveBeenCalled();
    expect(fixMock).not.toHaveBeenCalled();
  });

  it('[Turn on location] with a dialog SUCCESS auto re-locates — no second tap on the locate button', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    await press(root, 'Use my current location');
    expect(fixMock).not.toHaveBeenCalled(); // blocked before any capture

    // The user enables location in the native dialog; the screen re-locates
    // on its own.
    servicesMock.mockResolvedValue(true);
    permissionMock.mockResolvedValue({ status: 'granted' });
    fixMock.mockResolvedValueOnce({ latitude: 19.07, longitude: 72.87, accuracy: 10 });
    await press(root, 'Turn on location');

    expect(dialogMock).toHaveBeenCalledTimes(1);
    // Exactly ONE locate button tap happened; the capture ran anyway.
    expect(fixMock).toHaveBeenCalledTimes(1);
    expect(permissionMock).toHaveBeenCalledTimes(1);
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(false);
    expect(button(root, 'Turn on location')).toBeUndefined();
  });

  it('a DISMISSED dialog leaves the recovery block up (no capture, settings ladder owns the rest)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    await press(root, 'Use my current location');

    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    await press(root, 'Turn on location');

    expect(fixMock).not.toHaveBeenCalled();
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(true);
    expectButton(root, 'Turn on location');
  });

  it('[Search address instead] opens the address sheet (the promised fallback)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    await press(root, 'Use my current location');

    await press(root, 'Search address instead');

    const sheet = root.findByProps({ testID: 'address-picker-sheet' });
    expect(sheet.props.visible).toBe(true);
  });
});

describe('the mount/AppState services re-probe (the settings-rung recovery)', () => {
  it('services off at MOUNT → the recovery block shows before any tap; services restored + foreground → it clears', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    // The mount probe names the cause proactively — the owner never has to
    // tap locate to find out.
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(true);

    servicesMock.mockResolvedValue(true);
    await act(async () => {
      appStateListener!('active');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(false);
    expect(fixMock).not.toHaveBeenCalled(); // a re-probe never captures
  });

  it('a BACKGROUND event changes nothing (active is the only return signal)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(true);

    await act(async () => {
      appStateListener!('background');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, SERVICES_OFF_COPY)).toBe(true);
  });
});
