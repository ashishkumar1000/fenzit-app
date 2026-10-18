/**
 * Targeted contract test for MapPinPickerScreen's Confirm return (the
 * producer side of SPEC-customer-map-pin-picker; the consumer side is
 * pinned in AddCustomerScreen.test.tsx, and the office consumer in
 * OfficeFormScreen.pickedLocation.test.tsx):
 * - customer mode never renders the radius UI (CAP-1),
 * - Confirm returns a reverse-geocoded snapshot with placeId always null
 *   (CAP-3), a resolved search place wins with its placeId while the pin
 *   stays on it (CAP-2), an in-flight reverse never blocks Confirm, and
 *   the manual fallback pops with a null snapshot,
 * - office mode still renders the stepper and returns pickedLocation.
 *
 * Full screen-level suites remain deferred (15-4 review, decision 3a);
 * this pins only the return-channel contract.
 */
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: () => null,
  Circle: () => null,
}));

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

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button } from '../../../components/ui';
import { placesService } from '../../../services';
import type { ResolvedPlace } from '../../../services';
import RadiusStepper from './RadiusStepper';
import MapPinPickerScreen from './MapPinPickerScreen';

const reverseMock = placesService.reverse as jest.Mock;

// react-test-renderer has no automatic cleanup — unmount everything after
// each test so the map-failed deadline timer can't outlive the suite.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderPicker(params: Record<string, unknown>) {
  const navigation = { goBack: jest.fn(), popTo: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <MapPinPickerScreen
        navigation={navigation as never}
        route={{ params } as never}
      />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, navigation };
}

function sheetProps(root: ReactTestRenderer.ReactTestInstance) {
  return root.findByProps({ testID: 'address-picker-sheet' }).props;
}

function confirmLocation(root: ReactTestRenderer.ReactTestInstance) {
  const button = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Confirm location');
  if (!button) throw new Error('Confirm button not found');
  act(() => {
    button.props.onPress?.();
  });
}

/** Flushes the settle-only reverse-geocode promise chain. */
async function flush() {
  await act(async () => {});
  await act(async () => {});
}

const REVERSE_HIT = {
  formattedAddress: 'Shop 4, Baner Road, Pune 411045',
  city: 'Pune',
  pincode: '411045',
};

const RESOLVED: ResolvedPlace = {
  placeId: 'place-1',
  formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001',
  city: 'Bengaluru',
  pincode: '560001',
  latitude: 12.9716,
  longitude: 77.5946,
};

// The no-initial-pin default (Bengaluru centre) — what Confirm returns
// when the user never moves the map.
const CENTRE = { latitude: 12.9716, longitude: 77.5946 };

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

describe('MapPinPickerScreen customer mode', () => {
  it('renders no radius stepper and confirms with a reverse-geocoded snapshot (placeId null)', async () => {
    reverseMock.mockResolvedValue(REVERSE_HIT);
    const { root, navigation } = renderPicker({ mode: 'customer' });
    await flush();

    expect(root.findAllByType(RadiusStepper)).toHaveLength(0);

    confirmLocation(root);
    expect(navigation.popTo).toHaveBeenCalledWith(
      'AddCustomer',
      {
        pickedAddress: {
          addressLine: REVERSE_HIT.formattedAddress,
          city: 'Pune',
          snapshot: {
            formattedAddress: REVERSE_HIT.formattedAddress,
            pincode: REVERSE_HIT.pincode,
            latitude: CENTRE.latitude,
            longitude: CENTRE.longitude,
            placeId: null,
          },
        },
      },
      { merge: true },
    );
  });

  it('prefers a resolved search place (placeId present) while the pin stays on it', async () => {
    reverseMock.mockResolvedValue(REVERSE_HIT);
    const { root, navigation } = renderPicker({ mode: 'customer' });
    await flush();

    // Search moves the pin onto the resolved place; the reverse geocode
    // refires for those coordinates, but the resolve must win.
    act(() => {
      sheetProps(root).onResolved(RESOLVED);
    });
    await flush();

    confirmLocation(root);
    const [, params] = navigation.popTo.mock.calls[0] as [
      string,
      { pickedAddress: { city: string; snapshot: { placeId: string | null; formattedAddress: string } } },
    ];
    expect(params.pickedAddress.snapshot.placeId).toBe(RESOLVED.placeId);
    expect(params.pickedAddress.snapshot.formattedAddress).toBe(
      RESOLVED.formattedAddress,
    );
    expect(params.pickedAddress.city).toBe(RESOLVED.city);
    // Customer mode enables the manual-entry fallback in the sheet.
    expect(typeof sheetProps(root).onManualAddress).toBe('function');
  });

  it('manual entry pops with a null snapshot (no coordinates)', () => {
    reverseMock.mockResolvedValue(REVERSE_HIT);
    const { root, navigation } = renderPicker({ mode: 'customer' });

    act(() => {
      sheetProps(root).onManualAddress({
        addressLine: 'Flat 302, Sunrise Apartments',
        city: null,
      });
    });

    expect(navigation.popTo).toHaveBeenCalledWith(
      'AddCustomer',
      {
        pickedAddress: {
          addressLine: 'Flat 302, Sunrise Apartments',
          city: '',
          snapshot: null,
        },
      },
      { merge: true },
    );
  });

  it('an in-flight reverse never blocks Confirm — coordinates return either way', () => {
    reverseMock.mockReturnValue(new Promise(() => {}));
    const { root, navigation } = renderPicker({ mode: 'customer' });

    confirmLocation(root);
    expect(navigation.popTo).toHaveBeenCalledWith(
      'AddCustomer',
      {
        pickedAddress: {
          // Raw-coordinate fallback: no address text arrived in time.
          addressLine: '12.97160, 77.59460',
          city: '',
          snapshot: {
            formattedAddress: null,
            pincode: null,
            latitude: CENTRE.latitude,
            longitude: CENTRE.longitude,
            placeId: null,
          },
        },
      },
      { merge: true },
    );
  });
});

describe('MapPinPickerScreen office mode (unchanged)', () => {
  it('renders the radius stepper, hides the manual fallback, and returns pickedLocation', async () => {
    reverseMock.mockResolvedValue(REVERSE_HIT);
    const { root, navigation } = renderPicker({ mode: 'office', radiusM: 250 });
    await flush();

    expect(root.findAllByType(RadiusStepper)).toHaveLength(1);
    expect(sheetProps(root).onManualAddress).toBeUndefined();

    confirmLocation(root);
    expect(navigation.popTo).toHaveBeenCalledWith(
      'OfficeForm',
      {
        pickedLocation: {
          latitude: CENTRE.latitude,
          longitude: CENTRE.longitude,
          radiusM: 250,
          gpsVerified: false,
        },
      },
      { merge: true },
    );
  });

  it('the stepper renders BETWEEN the address area and Confirm (frozen sheet order, ux-map-pin-picker-2026-10-18)', async () => {
    reverseMock.mockResolvedValue(REVERSE_HIT);
    const { root } = renderPicker({ mode: 'office', radiusM: 250 });
    await flush();

    // One document-order traversal; the stepper must sit after the pinned
    // address area and before the Confirm button.
    const order = root.findAll(() => true);
    const pinnedIdx = order.findIndex(
      n => n.type === Text && n.props.children === 'LOCATION SET',
    );
    const stepperIdx = order.findIndex(n => n.type === RadiusStepper);
    const confirmIdx = order.findIndex(
      n => n.type === Button && n.props.children === 'Confirm location',
    );
    expect(pinnedIdx).toBeGreaterThan(-1);
    expect(stepperIdx).toBeGreaterThan(pinnedIdx);
    expect(confirmIdx).toBeGreaterThan(stepperIdx);
  });
});
