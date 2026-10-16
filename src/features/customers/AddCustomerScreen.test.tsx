/**
 * Tests for AddCustomerScreen: form bindings (enablement, phone
 * normalisation, the close-and-reset-on-success / stays-open-on-409
 * contract), the address field navigating to the `MapPinPicker` screen
 * (mode `customer` — the pick returns via navigate-back-with-params, read
 * once then cleared; SPEC-customer-map-pin-picker), populating from a
 * returned pick (resolved place, dropped pin, or manual entry), the
 * payload gating per pick origin, and the returnRouteName-based post-save
 * navigation (`goBack()` for Customers, `createdCustomerId` param for
 * NewJob).
 */
jest.mock('./useCustomers', () => ({
  upsertCustomer: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { Button } from '../../components/ui';
import { customerService } from '../../services';
import type { CreatedCustomer, ResolvedPlace } from '../../services';
import { upsertCustomer, loadCustomers } from './useCustomers';
import { runAllResets } from '../../services/resetRegistry';
import type { PickedAddress } from './types';
import AddCustomerScreen from './AddCustomerScreen';

const createSpy = jest.spyOn(customerService, 'create');
const upsertCustomerMock = upsertCustomer as jest.Mock;
const loadCustomersMock = loadCustomers as jest.Mock;

// `addListener` returns the unsubscribe function navigation effects rely on.
const noopNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
  popTo: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

// react-test-renderer has no automatic cleanup (unlike RTL's `render`), so
// every renderer is tracked here and unmounted in afterEach — a live screen
// whose `Animated` pulse is still running otherwise keeps rescheduling
// animation frames after the test environment tears down, crashing the
// Jest worker.
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderScreen(
  returnRouteName: 'Customers' | 'NewJob' = 'Customers',
  extraParams: Record<string, unknown> = {},
) {
  const navigation = {
    ...noopNavigation,
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
  };
  const route = { params: { returnRouteName, ...extraParams } };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddCustomerScreen navigation={navigation as never} route={route as never} />,
    );
  });
  mountedRenderers.push(renderer);
  return { root: renderer.root, navigation, renderer };
}

/** Re-renders with a fresh params object — how a MapPinPicker pick that
 *  REPLACES an earlier one arrives in real navigation (merge on popTo). */
function repick(
  renderer: ReactTestRenderer.ReactTestRenderer,
  returnRouteName: 'Customers' | 'NewJob',
  extraParams: Record<string, unknown>,
) {
  act(() => {
    renderer.update(
      <AddCustomerScreen
        navigation={noopNavigation as never}
        route={{ params: { returnRouteName, ...extraParams } } as never}
      />,
    );
  });
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

function inputByPlaceholder(
  root: ReactTestRenderer.ReactTestInstance,
  placeholder: string,
) {
  const input = root
    .findAllByType(TextInput)
    .find(t => t.props.placeholder === placeholder);
  if (!input) throw new Error(`Input "${placeholder}" not found`);
  return input;
}

function typeName(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    inputByPlaceholder(root, 'e.g. Ramesh Kumar').props.onChangeText(text);
  });
}

function typePhone(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    inputByPlaceholder(root, '98765 43210').props.onChangeText(text);
  });
}

function submit(root: ReactTestRenderer.ReactTestInstance) {
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add customer');
  if (!submitButton) throw new Error('Submit button not found');
  act(() => {
    void submitButton.props.onPress?.();
  });
}

function addressFieldTrigger(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityLabel: 'Set the customer\'s location' })
    .find(instance => typeof instance.props.onPress === 'function');
}

const RESOLVED: ResolvedPlace = {
  placeId: 'place-1',
  formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001',
  city: 'Bengaluru',
  pincode: '560001',
  latitude: 12.9716,
  longitude: 77.5946,
};

/** A `MapPinPicker` pick of a RESOLVED search place (placeId present). */
const RESOLVED_PICK: PickedAddress = {
  addressLine: RESOLVED.formattedAddress,
  city: RESOLVED.city ?? '',
  snapshot: {
    formattedAddress: RESOLVED.formattedAddress,
    pincode: RESOLVED.pincode,
    latitude: RESOLVED.latitude,
    longitude: RESOLVED.longitude,
    placeId: RESOLVED.placeId,
  },
};

/** A `MapPinPicker` PIN DROP: coordinates always, `placeId` never, and the
 *  reverse-geocoded text nullable per field. */
const PINNED_PICK: PickedAddress = {
  addressLine: 'Shop 4, Baner Road, Pune 411045',
  city: 'Pune',
  snapshot: {
    formattedAddress: 'Shop 4, Baner Road, Pune 411045',
    pincode: '411045',
    latitude: 18.559,
    longitude: 73.7868,
    placeId: null,
  },
};

/** A pin dropped on a point Google has no address for (open water etc.) —
 *  every text field null; the address line falls back to the coordinates. */
const PINNED_NO_ADDRESS_PICK: PickedAddress = {
  addressLine: '18.55900, 73.78680',
  city: '',
  snapshot: {
    formattedAddress: null,
    pincode: null,
    latitude: 18.559,
    longitude: 73.7868,
    placeId: null,
  },
};

/** A manual entry — no coordinates, no snapshot. */
const MANUAL_PICK: PickedAddress = {
  addressLine: 'Flat 302, Sunrise Apartments, Andheri West',
  city: 'Mumbai',
  snapshot: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('disables submit until a name and a 10-digit phone are entered', () => {
  const { root } = renderScreen();
  const submitButton = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Add customer');
  expect(submitButton?.props.disabled).toBe(true);

  typeName(root, 'Ramesh Kumar');
  typePhone(root, '98765');
  expect(submitButton?.props.disabled).toBe(true);

  typePhone(root, '9876543210');
  expect(submitButton?.props.disabled).toBe(false);
});

it('strips non-digits from the phone and caps it at 10', () => {
  const { root } = renderScreen();
  typePhone(root, '98-76a54!32109999');
  expect(inputByPlaceholder(root, '98765 43210').props.value).toBe('9876543210');
});

it('shows the duplicate-phone copy and stays open on a 409', async () => {
  createSpy.mockRejectedValueOnce({ status: 409, message: 'Conflict' });
  const { root, navigation } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  expect(navigation.goBack).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('A customer with this phone number already exists.');
});

it('navigates to the map pin picker when the address field is tapped', () => {
  const { root, navigation } = renderScreen();

  act(() => {
    addressFieldTrigger(root)?.props.onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('MapPinPicker', {
    mode: 'customer',
  });
});

it('populates the address field and city from a returned pin pick, then clears the param', () => {
  const { root, navigation } = renderScreen('Customers', {
    pickedAddress: PINNED_PICK,
  });

  expect(inputByPlaceholder(root, 'Tap to pin the location on a map').props.value).toBe(
    PINNED_PICK.addressLine,
  );
  expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe('Pune');
  // Read once then cleared — a stale pick must not re-fire on re-focus.
  expect(navigation.setParams).toHaveBeenCalledWith({ pickedAddress: undefined });
});

it('the address field is not directly editable — only the picker sets it', () => {
  const { root } = renderScreen();
  const addressInput = inputByPlaceholder(root, 'Tap to pin the location on a map');
  expect(addressInput.props.editable).toBe(false);
  // Long pinned addresses must render in full (multiline textarea variant),
  // not scroll to the tail inside a single-line field.
  expect(addressInput.props.multiline).toBe(true);
});

describe('pick application (search resolve / pin drop / manual)', () => {
  it('keeps the City field untouched when the pick carries no city', () => {
    const { root, renderer } = renderScreen('Customers', {
      pickedAddress: PINNED_PICK,
    });
    act(() => {
      inputByPlaceholder(root, 'Mumbai').props.onChangeText('Pune');
    });

    repick(renderer, 'Customers', { pickedAddress: PINNED_NO_ADDRESS_PICK });

    expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe('Pune');
    // The address line itself still lands (raw-coordinate fallback).
    expect(
      inputByPlaceholder(root, 'Tap to pin the location on a map').props.value,
    ).toBe(PINNED_NO_ADDRESS_PICK.addressLine);
  });

  it('drops a previously resolved snapshot when a manual entry replaces it', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-7',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: MANUAL_PICK.addressLine,
      city: MANUAL_PICK.city,
    });
    const { root, renderer } = renderScreen('Customers', {
      pickedAddress: RESOLVED_PICK,
    });
    typeName(root, 'Ramesh Kumar');
    typePhone(root, '9876543210');

    repick(renderer, 'Customers', { pickedAddress: MANUAL_PICK });

    await act(async () => {
      submit(root);
    });

    // The OLD pick's placeId/coordinates must not ride along with the NEW
    // text — the map pin would silently point at the abandoned place.
    const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(payload.address).toBe(MANUAL_PICK.addressLine);
    expect(payload).not.toHaveProperty('formattedAddress');
    expect(payload).not.toHaveProperty('pincode');
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).not.toHaveProperty('placeId');
  });
});

describe('submitting with returnRouteName: Customers', () => {
  it('creates the customer, updates the shared store, and goes back — no params needed', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-1',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: null,
      city: null,
    });
    const { root, navigation } = renderScreen('Customers');
    typeName(root, 'Ramesh Kumar');
    typePhone(root, '9876543210');

    await act(async () => {
      submit(root);
    });

    expect(upsertCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cust-1' }),
    );
    expect(loadCustomersMock).toHaveBeenCalledWith({ force: true });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('submitting with returnRouteName: NewJob', () => {
  it('returns the created customer id via navigation params instead of going back', async () => {
    createSpy.mockResolvedValueOnce({
      id: 'cust-2',
      name: 'Suresh Rao',
      countryCode: '+91',
      phoneNumber: '9876500000',
      address: null,
      city: null,
    });
    const { root, navigation } = renderScreen('NewJob');
    typeName(root, 'Suresh Rao');
    typePhone(root, '9876500000');

    await act(async () => {
      submit(root);
    });

    // popTo, not navigate — React Navigation 7's plain `navigate` pushes a
    // duplicate NewJob instead of going back to the one beneath this screen.
    expect(navigation.popTo).toHaveBeenCalledWith(
      'NewJob',
      { createdCustomerId: 'cust-2' },
      { merge: true },
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

it('blocks hardware/gesture back while the save is in flight, then frees it', async () => {
  let resolveCreate!: (customer: CreatedCustomer) => void;
  createSpy.mockReturnValueOnce(
    new Promise(resolve => {
      resolveCreate = resolve;
    }),
  );
  const { root, navigation } = renderScreen('Customers');
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  // No guard while the form is idle — leaving the screen is allowed.
  expect(navigation.addListener).not.toHaveBeenCalledWith(
    'beforeRemove',
    expect.any(Function),
  );

  act(() => {
    void submit(root);
  });

  const listenerCalls = (
    navigation.addListener as jest.Mock
  ).mock.calls.filter(
    ([event]: [string, unknown]) => event === 'beforeRemove',
  );
  expect(listenerCalls).toHaveLength(1);
  const beforeRemove = listenerCalls[0][1];
  const event = { preventDefault: jest.fn() };
  beforeRemove(event);
  expect(event.preventDefault).toHaveBeenCalled();

  // Once the save settles, the guard is removed — navigation is free again.
  await act(async () => {
    resolveCreate({
      id: 'cust-4',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: null,
      city: null,
    });
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('skips the store write and navigation when the session resets mid-POST', async () => {
  let resolveCreate!: (customer: CreatedCustomer) => void;
  createSpy.mockReturnValueOnce(
    new Promise(resolve => {
      resolveCreate = resolve;
    }),
  );
  const { root, navigation } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  act(() => {
    void submit(root);
  });
  // A concurrent request's 401 fires the global reset while the POST is
  // still in flight — the customer exists server-side, but committing it
  // here would repopulate the just-cleared (previous session's) store.
  runAllResets();

  await act(async () => {
    resolveCreate({
      id: 'cust-8',
      name: 'Ramesh Kumar',
      countryCode: '+91',
      phoneNumber: '9876543210',
      address: null,
      city: null,
    });
  });

  expect(upsertCustomerMock).not.toHaveBeenCalled();
  expect(loadCustomersMock).not.toHaveBeenCalled();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('sends the 5 resolved fields alongside existing fields for a resolved search pick', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-3',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: RESOLVED.formattedAddress,
    city: RESOLVED.city,
  });
  const { root } = renderScreen('Customers', { pickedAddress: RESOLVED_PICK });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      formattedAddress: RESOLVED.formattedAddress,
      pincode: RESOLVED.pincode,
      latitude: RESOLVED.latitude,
      longitude: RESOLVED.longitude,
      placeId: RESOLVED.placeId,
    }),
  );
});

it('sends coordinates for a pin drop but never a placeId', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-9',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: PINNED_PICK.addressLine,
    city: PINNED_PICK.city,
  });
  const { root } = renderScreen('Customers', { pickedAddress: PINNED_PICK });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  // A reverse-geocoded pin has coordinates and text but no place id — the
  // structured block rides on the coordinates, each text field its own gate.
  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      formattedAddress: PINNED_PICK.snapshot?.formattedAddress,
      pincode: PINNED_PICK.snapshot?.pincode,
      latitude: PINNED_PICK.snapshot?.latitude,
      longitude: PINNED_PICK.snapshot?.longitude,
    }),
  );
  const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload).not.toHaveProperty('placeId');
});

it('omits every structured field when the pin has no address text at all', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-10',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: PINNED_NO_ADDRESS_PICK.addressLine,
    city: null,
  });
  const { root } = renderScreen('Customers', {
    pickedAddress: PINNED_NO_ADDRESS_PICK,
  });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  // Coordinates always survive; the null text fields must be OMITTED, not
  // sent as empty strings (the backend stores null).
  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      latitude: PINNED_NO_ADDRESS_PICK.snapshot?.latitude,
      longitude: PINNED_NO_ADDRESS_PICK.snapshot?.longitude,
      address: PINNED_NO_ADDRESS_PICK.addressLine,
    }),
  );
  const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload).not.toHaveProperty('formattedAddress');
  expect(payload).not.toHaveProperty('pincode');
  expect(payload).not.toHaveProperty('placeId');
});

it('reveals the optional details input and sends addressDetails alongside a pin pick', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-11',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: PINNED_PICK.addressLine,
    city: PINNED_PICK.city,
  });
  const { root } = renderScreen('Customers', { pickedAddress: PINNED_PICK });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  // Baymard reveal: the details input only exists after the link is tapped.
  expect(() =>
    inputByPlaceholder(root, 'e.g. Flat 302, Tower B, near the main lift'),
  ).toThrow();
  act(() => {
    root
      .findAllByProps({ accessibilityLabel: 'Add flat or building details' })
      .find(instance => typeof instance.props.onPress === 'function')
      ?.props.onPress();
  });
  act(() => {
    inputByPlaceholder(
      root,
      'e.g. Flat 302, Tower B, near the main lift',
    ).props.onChangeText('Flat 302, Tower B');
  });

  await act(async () => {
    submit(root);
  });

  // Own field, untouched snapshot — the user text and the geocoded text
  // travel separately (CAP-5).
  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      addressDetails: 'Flat 302, Tower B',
      formattedAddress: PINNED_PICK.snapshot?.formattedAddress,
      latitude: PINNED_PICK.snapshot?.latitude,
    }),
  );
});

it('omits the 5 resolved fields entirely when the picker was never used', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-4',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
    city: null,
  });
  const { root } = renderScreen();
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
  expect(payload).not.toHaveProperty('formattedAddress');
  expect(payload).not.toHaveProperty('pincode');
  expect(payload).not.toHaveProperty('latitude');
  expect(payload).not.toHaveProperty('longitude');
  expect(payload).not.toHaveProperty('placeId');
  expect(payload).not.toHaveProperty('addressDetails');
});

it('trims leading/trailing whitespace from name and city on submit', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-5',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
    city: 'Mumbai',
  });
  const { root } = renderScreen();
  typeName(root, '  Ramesh Kumar  ');
  typePhone(root, '9876543210');
  act(() => {
    inputByPlaceholder(root, 'Mumbai').props.onChangeText('  Mumbai  ');
  });

  await act(async () => {
    submit(root);
  });

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Ramesh Kumar', city: 'Mumbai' }),
  );
});
