/**
 * MapPinPickerScreen services-off wiring (location-services-off feature,
 * 2026-10-17; sheet/map presentation redesigned per
 * ux-map-pin-picker-2026-10-18) — the screen-level half of the picker
 * matrix rows:
 *
 *  - Tapping "Use my current location" with the master switch off shows the
 *    services-off red card (shipped plain-English title + body) with
 *    [Turn on location] (no separate manual-search button — the top
 *    search bar owns that) and
 *    NEVER the generic "Could not get your location" failure text; the
 *    permission ask is never even attempted (probe-first).
 *  - [Turn on location] with an Android dialog success AUTO
 *    re-locates — one-tap recovery, no second tap (the
 *    useLocateMe.enableServices → handleEnableServices → handleLocate
 *    wiring) — and the sheet flips to the pinned state.
 *  - The top search bar opens the
 *    address sheet (the manual fallback).
 *  - The Nearby area row renders the settled-pin reverse geocode while
 *    services are OFF (manual drag placement is first-class) with a raw-
 *    coordinate fallback on geocode failure — never an error state.
 *  - The map state chip switches with the services state.
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

// Override the global maps mock so the map ref exposes a spy — the
// Nearby-area "Change" link re-centres through it.
const mockAnimateToRegion = jest.fn();
jest.mock('react-native-maps', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const MockComponent = (props: Record<string, unknown>) =>
    ReactLib.createElement(View, props);
  const MockMapView = ReactLib.forwardRef(
    (props: Record<string, unknown>, ref: unknown) => {
      ReactLib.useImperativeHandle(ref, () => ({
        animateToRegion: (...args: unknown[]) => mockAnimateToRegion(...args),
      }));
      return ReactLib.createElement(View, props);
    },
  );
  return { __esModule: true, default: MockMapView, Circle: MockComponent };
});

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

// The frozen services-off card copy (ux-map-pin-picker-2026-10-18) — the
// UX-corrected body names Settings, never "permission".
const SERVICES_OFF_TITLE = 'Your phone location is off';
const SERVICES_OFF_BODY =
  'Please turn on location in your phone settings. This helps us find the correct place.';
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

/** Presses a non-Button control (locate pill, search bar) by its
 *  accessibility label. */
async function pressByLabel(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const el = root
    .findAllByProps({ accessibilityLabel: label })
    .find(n => n.props.onPress);
  if (!el) throw new Error(`Pressable "${label}" not found`);
  await act(async () => {
    el.props.onPress();
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
  it('shows the EXACT shipped red-card copy + [Turn on location] and NO in-sheet manual-search button; NEVER the generic failed copy; no permission ask', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    // The mount probe surfaces the card — no locate tap needed. And the
    // locate pill is HIDDEN while services are off (user decision: it cannot
    // produce a fix, so it must not invite a dead tap).
    expect(root.findAllByProps({ accessibilityLabel: 'Use my current location' })).toHaveLength(0);

    expect(hasText(root, SERVICES_OFF_TITLE)).toBe(true);
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);
    expect(hasText(root, GENERIC_FAILED_COPY)).toBe(false);
    expectButton(root, 'Turn on location');
    expectButton(root, 'Confirm location'); // manual placement stays available
    // No separate manual-search button (user decision 2026-10-18): the top
    // search bar owns that action.
    expect(button(root, 'Search or enter address manually')).toBeUndefined();
    expect(
      root.findAllByProps({ accessibilityLabel: 'Search address, street, landmark' }).length,
    ).toBeGreaterThan(0);
    expect(hasText(root, 'LOCATION SET')).toBe(false); // the two sheet states are exclusive
    expect(permissionMock).not.toHaveBeenCalled();
    expect(fixMock).not.toHaveBeenCalled();
  });

  it('[Turn on location] with a dialog SUCCESS auto re-locates — no second tap on the locate pill — and flips the sheet to pinned', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);
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
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(false);
    expect(button(root, 'Turn on location')).toBeUndefined();
    expect(hasText(root, 'LOCATION SET')).toBe(true);
  });

  it('a DISMISSED dialog leaves the red card up (no capture, settings ladder owns the rest)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();

    dialogMock.mockResolvedValueOnce({ locationServicesEnabled: false });
    await press(root, 'Turn on location');

    expect(fixMock).not.toHaveBeenCalled();
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);
    expectButton(root, 'Turn on location');
  });

  it('the TOP SEARCH BAR opens the address sheet even while services are off (the manual path)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();

    await pressByLabel(root, 'Search address, street, landmark');

    const sheet = root.findByProps({ testID: 'address-picker-sheet' });
    expect(sheet.props.visible).toBe(true);
  });
});

describe('the mount/AppState services re-probe (the settings-rung recovery)', () => {
  it('services off at MOUNT → the red card shows before any tap; services restored + foreground → the pinned sheet clears it', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    // The mount probe names the cause proactively — the owner never has to
    // tap locate to find out.
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);

    servicesMock.mockResolvedValue(true);
    await act(async () => {
      appStateListener!('active');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(false);
    expect(hasText(root, 'LOCATION SET')).toBe(true);
    // And the locate pill returns with the healthy state (hidden while off).
    // findAllByProps matches host nodes that forward the prop too — presence
    // is the assertion.
    expect(
      root.findAllByProps({ accessibilityLabel: 'Use my current location' }).length,
    ).toBeGreaterThan(0);
    expect(fixMock).not.toHaveBeenCalled(); // a re-probe never captures
  });

  it('a BACKGROUND event changes nothing (active is the only return signal)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);

    await act(async () => {
      appStateListener!('background');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);
  });
});

describe('the redesigned presentation (ux-map-pin-picker-2026-10-18)', () => {
  it('renders the Nearby area row from the settled-pin reverse geocode while services are OFF', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();

    expect(hasText(root, 'Nearby area: Baner Road, Pune')).toBe(true);
  });

  it('falls back to the raw coordinates — never an error state — when the reverse geocode fails while services are off', async () => {
    servicesMock.mockResolvedValue(false);
    reverseMock.mockRejectedValue(new Error('offline'));
    const { root } = renderPicker();
    await settle();

    expect(hasText(root, 'Nearby area: 12.97160, 77.59460')).toBe(true);
    // The red card, not a failure row.
    expect(hasText(root, SERVICES_OFF_BODY)).toBe(true);
    expect(hasText(root, GENERIC_FAILED_COPY)).toBe(false);
  });

  it('the map state chip switches with the services state (drag-to-set ↔ exact pin)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    expect(hasText(root, 'Move the map to set the pin')).toBe(true);
    expect(hasText(root, 'Exact location')).toBe(false);

    servicesMock.mockResolvedValue(true);
    await act(async () => {
      appStateListener!('active');
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, 'Exact location')).toBe(true);
    expect(hasText(root, 'Move the map to set the pin')).toBe(false);
  });

  it('the top search bar opens the address sheet', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();

    await pressByLabel(root, 'Search address, street, landmark');

    const sheet = root.findByProps({ testID: 'address-picker-sheet' });
    expect(sheet.props.visible).toBe(true);
  });

  it('the Nearby area "Change" link re-centres the map on the CURRENT pin (screen wiring, not just the card callback)', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    mockAnimateToRegion.mockClear();

    await pressByLabel(root, 'Change area');

    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    expect(mockAnimateToRegion.mock.calls[0][0]).toMatchObject({
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });

  it('the state chip hides while the map is being dragged and returns on settle', async () => {
    servicesMock.mockResolvedValue(false);
    const { root } = renderPicker();
    await settle();
    expect(hasText(root, 'Move the map to set the pin')).toBe(true);

    const map = () =>
      root.findAll(n => typeof n.props?.onRegionChange === 'function')[0];
    const region = { latitude: 12.98, longitude: 77.6, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    await act(async () => {
      map().props.onRegionChange(region);
    });
    expect(hasText(root, 'Move the map to set the pin')).toBe(false);

    await act(async () => {
      map().props.onRegionChangeComplete(region);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(hasText(root, 'Move the map to set the pin')).toBe(true);
  });

  it('an EMPTY reverse-geocode address falls back to the raw coordinates, not a blank row', async () => {
    servicesMock.mockResolvedValue(false);
    reverseMock.mockResolvedValue({ formattedAddress: '' });
    const { root } = renderPicker();
    await settle();

    expect(hasText(root, 'Nearby area: 12.97160, 77.59460')).toBe(true);
  });

  it('the locate pill ignores a second tap while a locate is already in flight (no concurrent captures)', async () => {
    servicesMock.mockResolvedValue(true);
    permissionMock.mockResolvedValue({ status: 'granted' });
    fixMock.mockReturnValue(new Promise(() => undefined)); // never resolves
    const { root } = renderPicker();
    await settle();

    await pressByLabel(root, 'Use my current location');

    const pill = root
      .findAllByProps({ accessibilityLabel: 'Use my current location' })
      .find(n => n.props.onPress);
    expect(pill).toBeUndefined();
    expect(fixMock).toHaveBeenCalledTimes(1);
  });
});
