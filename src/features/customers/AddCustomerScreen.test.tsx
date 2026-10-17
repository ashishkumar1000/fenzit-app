/**
 * Tests for AddCustomerScreen (design v2): form bindings (enablement incl.
 * the required location signal, phone normalisation, the
 * stays-open-on-409 contract), the service-location preview box navigating
 * to the `MapPinPicker` screen (mode `customer` — the pick returns via
 * navigate-back-with-params, read once then cleared;
 * SPEC-customer-map-pin-picker), the field→column mapping (Flat/House →
 * addressDetails, Street/Landmark → free-text address, resolved line NEVER
 * copied into it), manual-entry prefill, and the returnRouteName-based
 * post-save navigation (`goBack()` for Customers, `createdCustomerId` for
 * NewJob).
 */
jest.mock('./useCustomers', () => ({
  upsertCustomer: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text, TextInput } from 'react-native';
import { Button, ConfirmDialog, Input } from '../../components/ui';
import { customerService } from '../../services';
import type { CreatedCustomer, CustomerDetail, ResolvedPlace } from '../../services';
import { upsertCustomer, loadCustomers } from './useCustomers';
import { runAllResets } from '../../services/resetRegistry';
import type { PickedAddress } from './types';
import AddCustomerScreen from './AddCustomerScreen';

const createSpy = jest.spyOn(customerService, 'create');
const getByIdSpy = jest.spyOn(customerService, 'getById');
const updateSpy = jest.spyOn(customerService, 'update');
// Standing default so an edit-mode save never reaches the real apiClient —
// individual tests override with mockRejectedValueOnce as needed.
updateSpy.mockResolvedValue({
  id: 'cust-77',
  name: 'saved',
  countryCode: '+91',
  phoneNumber: '9876543210',
  address: null,
  city: null,
});
const upsertCustomerMock = upsertCustomer as jest.Mock;
const loadCustomersMock = loadCustomers as jest.Mock;

// `addListener` returns the unsubscribe function navigation effects rely on.
const noopNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
  popTo: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

// react-test-renderer has no automatic cleanup (unlike RTL's `render`), so
// every renderer is tracked here and unmounted in afterEach — a live screen
// with running animations would otherwise keep rescheduling frames past the
// test environment teardown, crashing the Jest worker.
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

function typeStreet(root: ReactTestRenderer.ReactTestInstance, text: string) {
  act(() => {
    inputByPlaceholder(
      root,
      'e.g. Opposite Metro Station',
    ).props.onChangeText(text);
  });
}

function submitButton(root: ReactTestRenderer.ReactTestInstance) {
  const button = root
    .findAllByType(Button)
    .find(b => b.props.children === 'Save customer');
  if (!button) throw new Error('Save button not found');
  return button;
}

function submit(root: ReactTestRenderer.ReactTestInstance) {
  act(() => {
    void submitButton(root).props.onPress?.();
  });
}

function locationBoxTrigger(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({
      accessibilityLabel: "Open the map to set the customer's location",
    })
    .find(instance => typeof instance.props.onPress === 'function');
}

const RESOLVED: ResolvedPlace = {
  placeId: 'place-1',
  formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
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

it('disables submit until a name, a 10-digit phone AND a location signal are entered', () => {
  const { root } = renderScreen();
  expect(submitButton(root).props.disabled).toBe(true);

  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');
  // The Required* badge on the service-location card is enforced — a
  // contact-only customer still can't save.
  expect(submitButton(root).props.disabled).toBe(true);

  typeStreet(root, 'Opposite Metro Station');
  expect(submitButton(root).props.disabled).toBe(false);
});

it('a picked location alone satisfies the required location signal', () => {
  const { root } = renderScreen('Customers', { pickedAddress: PINNED_PICK });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');
  expect(submitButton(root).props.disabled).toBe(false);
});

it('strips non-digits from the phone and caps it at 10', () => {
  const { root } = renderScreen();
  typePhone(root, '98-76a54!32109999');
  expect(inputByPlaceholder(root, '98765 43210').props.value).toBe('9876543210');
});

it('shows the duplicate-phone copy and stays open on a 409', async () => {
  createSpy.mockRejectedValueOnce({ status: 409, message: 'Conflict' });
  const { root, navigation } = renderScreen('Customers', {
    pickedAddress: PINNED_PICK,
  });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  await act(async () => {
    submit(root);
  });

  expect(navigation.goBack).not.toHaveBeenCalled();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('A customer with this phone number already exists.');
});

it('navigates to the map pin picker when the preview box is tapped', () => {
  const { root, navigation } = renderScreen();

  act(() => {
    locationBoxTrigger(root)?.props.onPress();
  });

  expect(navigation.navigate).toHaveBeenCalledWith('MapPinPicker', {
    mode: 'customer',
  });
});

it('shows the picked line in the preview box, auto-fills City, then clears the param', () => {
  const { root, navigation } = renderScreen('Customers', {
    pickedAddress: PINNED_PICK,
  });

  expect(
    root.findAllByProps({ children: PINNED_PICK.addressLine }).length,
  ).toBeGreaterThan(0);
  expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe('Pune');
  // Read once then cleared — a stale pick must not re-fire on re-focus.
  expect(navigation.setParams).toHaveBeenCalledWith({ pickedAddress: undefined });
});

it('a resolved pick does NOT copy the resolved line into the Street field', () => {
  const { root } = renderScreen('Customers', { pickedAddress: RESOLVED_PICK });

  expect(
    inputByPlaceholder(root, 'e.g. Opposite Metro Station').props.value,
  ).toBe('');
});

it('a manual entry prefills Street with its line (no snapshot to carry it)', () => {
  const { root } = renderScreen('Customers', { pickedAddress: MANUAL_PICK });

  expect(
    inputByPlaceholder(root, 'e.g. Opposite Metro Station').props.value,
  ).toBe(MANUAL_PICK.addressLine);
  expect(
    root.findAllByProps({ children: MANUAL_PICK.addressLine }).length,
  ).toBeGreaterThan(0);
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
    // The preview box still lands (raw-coordinate fallback).
    expect(
      root.findAllByProps({ children: PINNED_NO_ADDRESS_PICK.addressLine }).length,
    ).toBeGreaterThan(0);
  });

  it('keeps the Street text a user already typed when a manual entry lands', () => {
    const { root, renderer } = renderScreen();
    typeStreet(root, 'Beside the water tank');

    repick(renderer, 'Customers', { pickedAddress: MANUAL_PICK });

    expect(
      inputByPlaceholder(root, 'e.g. Opposite Metro Station').props.value,
    ).toBe('Beside the water tank');
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
    expect(payload.formattedAddress).toBeUndefined();
    expect(payload.latitude).toBeUndefined();
    expect(payload.placeId).toBeUndefined();
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
    const { root, navigation } = renderScreen('Customers', {
      pickedAddress: PINNED_PICK,
    });
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
    const { root, navigation } = renderScreen('NewJob', {
      pickedAddress: PINNED_PICK,
    });
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
  const { root, navigation } = renderScreen('Customers', {
    pickedAddress: PINNED_PICK,
  });
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');

  // While the form is idle only the discard guard is armed — the submit
  // hook's in-flight blocker registers on submit (next assertion).
  const idleCalls = (navigation.addListener as jest.Mock).mock.calls.filter(
    ([event]: [string, unknown]) => event === 'beforeRemove',
  );
  expect(idleCalls).toHaveLength(1);

  act(() => {
    void submit(root);
  });

  const listenerCalls = (
    navigation.addListener as jest.Mock
  ).mock.calls.filter(
    ([event]: [string, unknown]) => event === 'beforeRemove',
  );
  // Two guards arm: the discard guard (mount) and the submit hook's
  // in-flight blocker (re-registered on submit). Both see the event; the
  // blocker vetoed the removal, and the discard guard deferred to it —
  // no dialog mid-save.
  expect(listenerCalls).toHaveLength(2);
  const event = { preventDefault: jest.fn() };
  listenerCalls.forEach(([, fn]) => fn(event));
  expect(event.preventDefault).toHaveBeenCalled();
  expect(visibleDialog(root)).toBeUndefined();

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
  const { root, navigation } = renderScreen('Customers', {
    pickedAddress: PINNED_PICK,
  });
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

it('sends the structured snapshot for a resolved search pick; street stays free of it', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-3',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
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
      city: RESOLVED.city,
    }),
  );
  const [payload] = createSpy.mock.calls[0] as unknown as [Record<string, unknown>];
  // The resolved line is not duplicated into the free-text address.
  expect(payload.address).toBeUndefined();
});

it('sends coordinates for a pin drop but never a placeId', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-9',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: null,
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

it('merges Street and Area/Pincode into the address line; details travel separately', async () => {
  createSpy.mockResolvedValueOnce({
    id: 'cust-12',
    name: 'Ramesh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: 'Opposite Metro Station, Link Road, Andheri West',
    city: 'Mumbai',
  });
  const { root } = renderScreen('Customers');
  typeName(root, 'Ramesh Kumar');
  typePhone(root, '9876543210');
  typeStreet(root, 'Opposite Metro Station, Link Road');
  act(() => {
    inputByPlaceholder(root, 'Mumbai').props.onChangeText('Mumbai');
  });
  act(() => {
    inputByPlaceholder(root, 'Andheri West').props.onChangeText('Andheri West');
  });
  act(() => {
    inputByPlaceholder(
      root,
      'e.g. Flat 402, Sunshine Towers',
    ).props.onChangeText('Flat 402, Sunshine Towers, Wing B');
  });

  await act(async () => {
    submit(root);
  });

  // requestMapping's existing merge: "<address>, <area>". The details field
  // is its own column — never folded into the address line (CAP-5).
  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      address: 'Opposite Metro Station, Link Road, Andheri West',
      addressDetails: 'Flat 402, Sunshine Towers, Wing B',
      city: 'Mumbai',
    }),
  );
});

it('omits the structured fields entirely when only City carries the location signal', async () => {
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
  // Location signal via City only.
  act(() => {
    inputByPlaceholder(root, 'Mumbai').props.onChangeText('Mumbai');
  });

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

function visibleDialog(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByType(ConfirmDialog)
    .find(d => d.props.visible === true);
}

function fireBeforeRemove(
  navigation: { addListener: jest.Mock },
  event: { data: { action: { type: string } }; preventDefault: jest.Mock },
) {
  const listeners = (navigation.addListener as jest.Mock)
    .mock.calls.filter(([e]: [string]) => e === 'beforeRemove')
    .map(([, fn]) => fn);
  // setDiscardVisible inside the guard needs act() to flush.
  act(() => {
    listeners.forEach(fn => fn(event));
  });
}

describe('discard guard (CAP-6)', () => {
  const removeEvent = () => ({
    data: { action: { type: 'GO_BACK' } },
    preventDefault: jest.fn(),
  });

  it('asks before discarding when the form has unsaved input', () => {
    const { root, navigation } = renderScreen();
    typeName(root, 'Ramesh Kumar');
    const event = removeEvent();
    fireBeforeRemove(navigation, event);

    expect(event.preventDefault).toHaveBeenCalled();
    const dialog = visibleDialog(root);
    expect(dialog).toBeDefined();
    expect(dialog?.props.title).toBe('Leave without saving?');
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('a clean form leaves without asking', () => {
    const { root, navigation } = renderScreen();
    const event = removeEvent();
    fireBeforeRemove(navigation, event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(visibleDialog(root)).toBeUndefined();
  });

  it('a picked location alone counts as unsaved work', () => {
    const { root, navigation } = renderScreen('Customers', {
      pickedAddress: PINNED_PICK,
    });
    const event = removeEvent();
    fireBeforeRemove(navigation, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(visibleDialog(root)).toBeDefined();
  });

  it('Discard leaves the screen', () => {
    const { root, navigation } = renderScreen();
    typeName(root, 'Ramesh Kumar');
    const event = removeEvent();
    fireBeforeRemove(navigation, event);

    const discard = root
      .findAllByType(Button)
      .find(b => b.props.children === "Don't save");
    act(() => {
      void discard?.props.onPress?.();
    });

    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('Keep editing stays on the form with the input intact', () => {
    const { root, navigation } = renderScreen();
    typeName(root, 'Ramesh Kumar');
    const event = removeEvent();
    fireBeforeRemove(navigation, event);

    const keep = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Keep editing');
    act(() => {
      void keep?.props.onPress?.();
    });

    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(visibleDialog(root)).toBeUndefined();
    expect(inputByPlaceholder(root, 'e.g. Ramesh Kumar').props.value).toBe('Ramesh Kumar');
  });
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

describe('edit mode (customerId param — SPEC-edit-customer)', () => {
  /** A pinned customer with every field populated — the richest seed. */
  const EDIT_DETAIL: CustomerDetail = {
    id: 'cust-77',
    name: 'Priya Sharma',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: '12 MG Road',
    city: 'Bengaluru',
    formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
    pincode: '560001',
    latitude: 12.9716,
    longitude: 77.5946,
    placeId: 'place-9',
    addressDetails: 'Flat 302, Tower B',
    createdVia: 'manual',
    createdAt: '2026-06-21T00:00:00Z',
    tenantId: 't-1',
    jobHistory: { data: [], nextCursor: null, hasMore: false },
  };

  const NO_LOCATION_DETAIL: CustomerDetail = {
    ...EDIT_DETAIL,
    address: null,
    city: null,
    formattedAddress: null,
    pincode: null,
    latitude: null,
    longitude: null,
    placeId: null,
    addressDetails: null,
  };

  function editSubmitButton(root: ReactTestRenderer.ReactTestInstance) {
    const button = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Save changes');
    if (!button) throw new Error('Save-changes button not found');
    return button;
  }

  function editSubmit(root: ReactTestRenderer.ReactTestInstance) {
    act(() => {
      void editSubmitButton(root).props.onPress?.();
    });
  }

  async function renderEditScreen(
    detail: CustomerDetail = EDIT_DETAIL,
    extraParams: Record<string, unknown> = {},
  ) {
    getByIdSpy.mockResolvedValueOnce(detail);
    const rendered = renderScreen('Customers', {
      customerId: 'cust-77',
      ...extraParams,
    });
    // Flush the load-and-seed promise.
    await act(async () => {});
    return rendered;
  }

  function textChildren(root: ReactTestRenderer.ReactTestInstance): unknown[] {
    return root.findAllByType(Text).map(t => t.props.children);
  }

  it('load-and-seeds from getById — copy switches, read-only phone, CAP-2 helper', async () => {
    const { root, navigation } = await renderEditScreen();

    expect(getByIdSpy).toHaveBeenCalledWith('cust-77');
    expect(inputByPlaceholder(root, 'e.g. Ramesh Kumar').props.value).toBe(
      'Priya Sharma',
    );
    // The stored merged line round-trips into Street (un-merging is lossy).
    expect(inputByPlaceholder(root, 'e.g. Opposite Metro Station').props.value).toBe(
      '12 MG Road',
    );
    expect(inputByPlaceholder(root, 'Mumbai').props.value).toBe('Bengaluru');
    expect(inputByPlaceholder(root, 'e.g. Flat 402, Sunshine Towers').props.value).toBe(
      'Flat 302, Tower B',
    );
    expect(textChildren(root)).toContain('Edit customer');
    expect(editSubmitButton(root)).toBeDefined();

    const phone = inputByPlaceholder(root, '98765 43210');
    expect(phone.props.editable).toBe(false);
    // `disabled` is consumed by the Input wrapper (greyed styling), not
    // forwarded to the raw TextInput — assert it there.
    const phoneField = root
      .findAllByType(Input)
      .find(i => i.props.label === 'Phone number');
    expect(phoneField?.props.disabled).toBe(true);
    expect(textChildren(root)).toContain("Phone numbers can't be changed");

    // No pick landed — the screen must not have cleared params.
    expect(navigation.setParams).not.toHaveBeenCalled();
  });

  it('a removed/cross-tenant customer (404) shows the dedicated notice, not a form', async () => {
    getByIdSpy.mockRejectedValueOnce({ status: 404 });
    const { root } = renderScreen('Customers', { customerId: 'cust-77' });
    await act(async () => {});

    expect(textChildren(root)).toContain(
      'This customer is no longer available. It may have been removed.',
    );
    expect(root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('a non-404 load failure keeps the form with the go-back-and-retry banner', async () => {
    getByIdSpy.mockRejectedValueOnce({ status: 500 });
    const { root } = renderScreen('Customers', { customerId: 'cust-77' });
    await act(async () => {});

    expect(textChildren(root)).toContain(
      'Could not load this customer. Go back and try again.',
    );
    // The form is there but unseeded — Save stays disabled (nothing to diff).
    expect(editSubmitButton(root).props.disabled).toBe(true);
  });

  it('an untouched seeded form saves as a no-op — no request, plain back', async () => {
    const { root, navigation } = await renderEditScreen();

    await act(async () => {
      editSubmit(root);
    });

    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('a name change PATCHes exactly the diff and never rides the create path', async () => {
    const { root, navigation } = await renderEditScreen();
    typeName(root, 'Priya Sharma-Fernandes');

    await act(async () => {
      editSubmit(root);
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith('cust-77', { name: 'Priya Sharma-Fernandes' });
    expect(createSpy).not.toHaveBeenCalled();
    // Edit skips upsertCustomer: the PATCH response carries no jobCount/
    // lastJobDate, and upserting would zero the row's stats in the list.
    expect(upsertCustomerMock).not.toHaveBeenCalled();
    expect(loadCustomersMock).toHaveBeenCalledWith({ force: true });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('a customer that vanished mid-edit shows the 404 copy and stays for retry/back', async () => {
    const { root, navigation } = await renderEditScreen();
    updateSpy.mockRejectedValueOnce({ status: 404 });
    typeName(root, 'Renamed');

    await act(async () => {
      editSubmit(root);
    });

    expect(textChildren(root)).toContain(
      'This customer is no longer available. It may have been removed.',
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('a re-pin replaces the location block as a unit and never touches the Flat field', async () => {
    const { root, renderer } = await renderEditScreen();

    repick(renderer, 'Customers', {
      customerId: 'cust-77',
      pickedAddress: PINNED_NO_ADDRESS_PICK,
    });
    // handlePick clears the read-once param (on the CURRENT navigation —
    // repick re-renders with the shared noop mock).
    expect(noopNavigation.setParams).toHaveBeenCalledWith({
      pickedAddress: undefined,
    });

    await act(async () => {
      editSubmit(root);
    });

    expect(updateSpy).toHaveBeenCalledWith('cust-77', {
      formattedAddress: null,
      pincode: null,
      latitude: 18.559,
      longitude: 73.7868,
      placeId: null,
    });
  });

  it('a manual-entry pick over a pinned customer nulls all five block keys', async () => {
    const { root, renderer } = await renderEditScreen();

    repick(renderer, 'Customers', {
      customerId: 'cust-77',
      pickedAddress: MANUAL_PICK,
    });

    await act(async () => {
      editSubmit(root);
    });

    // The pick's city lands in the City field (same convention as add) —
    // the diff honestly carries it alongside the five nulled block keys.
    expect(updateSpy).toHaveBeenCalledWith('cust-77', {
      city: 'Mumbai',
      formattedAddress: null,
      pincode: null,
      latitude: null,
      longitude: null,
      placeId: null,
    });
  });

  it('emptying the Flat field is the explicit CAP-5 clear', async () => {
    const { root } = await renderEditScreen();
    act(() => {
      inputByPlaceholder(root, 'e.g. Flat 402, Sunshine Towers').props.onChangeText('');
    });

    await act(async () => {
      editSubmit(root);
    });

    expect(updateSpy).toHaveBeenCalledWith('cust-77', { addressDetails: null });
  });

  it('a customer with no saved location can still save an unrelated edit (no location demand)', async () => {
    const { root } = await renderEditScreen(NO_LOCATION_DETAIL);

    // The create flow's Required* location gate does not dead-end edits of a
    // customer that legitimately has no location on file.
    expect(editSubmitButton(root).props.disabled).toBe(false);

    typeName(root, 'Renamed No-Loc');
    await act(async () => {
      editSubmit(root);
    });

    expect(updateSpy).toHaveBeenCalledWith('cust-77', { name: 'Renamed No-Loc' });
  });

  it('the picker opens centred on the current snapshot (CAP-2)', async () => {
    const { root, navigation } = await renderEditScreen();

    act(() => {
      locationBoxTrigger(root)?.props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MapPinPicker', {
      mode: 'customer',
      initialLatitude: 12.9716,
      initialLongitude: 77.5946,
    });
  });

  it('a legacy short phone never dead-ends Save — the immutable field is not re-validated in edit', async () => {
    const { root } = await renderEditScreen({
      ...EDIT_DETAIL,
      phoneNumber: '12345',
    });

    // Save is enabled on the seeded form itself: the phone is server truth.
    expect(editSubmitButton(root).props.disabled).toBe(false);

    typeName(root, 'Short Phone');
    await act(async () => {
      editSubmit(root);
    });
    expect(updateSpy).toHaveBeenCalledWith('cust-77', { name: 'Short Phone' });
  });

  it('a 403 on seed load lands on the same not-found notice as a 404', async () => {
    getByIdSpy.mockRejectedValueOnce({ status: 403 });
    const { root } = renderScreen('Customers', { customerId: 'cust-77' });
    await act(async () => {});

    expect(textChildren(root)).toContain(
      'This customer is no longer available. It may have been removed.',
    );
    expect(root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('shows the spinner while the seed is in flight, before any view settles', () => {
    getByIdSpy.mockReturnValueOnce(new Promise(() => {}));
    const { root } = renderScreen('Customers', { customerId: 'cust-77' });

    // Unsettled load: the spinner view replaces the form entirely.
    expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(root.findAllByType(TextInput)).toHaveLength(0);
  });

  describe('edit error copy (updateErrorMessage)', () => {
    async function saveFailingWith(err: Record<string, unknown>) {
      const { root, navigation } = await renderEditScreen();
      updateSpy.mockRejectedValueOnce(err);
      typeName(root, 'Renamed');
      await act(async () => {
        editSubmit(root);
      });
      return { root, navigation };
    }

    it('403 — owner-only copy', async () => {
      const { root, navigation } = await saveFailingWith({ status: 403 });
      expect(textChildren(root)).toContain(
        'Only the business owner can edit customers.',
      );
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('422 — check-the-fields copy', async () => {
      const { root } = await saveFailingWith({
        status: 422,
        code: 'VALIDATION_ERROR',
      });
      expect(textChildren(root)).toContain(
        'Check the fields — one of the values looks invalid.',
      );
    });

    it('400 — company-setup copy', async () => {
      const { root } = await saveFailingWith({ status: 400 });
      expect(textChildren(root)).toContain(
        'Finish setting up your company before editing customers.',
      );
    });

    it('an unmapped error falls through to the server message', async () => {
      const { root } = await saveFailingWith({
        status: 500,
        message: 'Something odd happened',
      });
      expect(textChildren(root)).toContain('Something odd happened');
    });
  });

  describe('discard guard in edit mode', () => {
    const removeEvent = () => ({
      data: { action: { type: 'GO_BACK' } },
      preventDefault: jest.fn(),
    });

    it('an untouched seeded form leaves without the dialog', async () => {
      const { root, navigation } = await renderEditScreen();
      const event = removeEvent();
      fireBeforeRemove(navigation, event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(visibleDialog(root)).toBeUndefined();
    });

    it('a changed form asks first, with the edit-flavoured copy', async () => {
      const { root, navigation } = await renderEditScreen();
      typeName(root, 'Renamed');
      const event = removeEvent();
      fireBeforeRemove(navigation, event);

      expect(event.preventDefault).toHaveBeenCalled();
      const dialog = visibleDialog(root);
      expect(dialog).toBeDefined();
      expect(dialog?.props.message).toBe("Your changes haven't been saved yet.");
      expect(navigation.dispatch).not.toHaveBeenCalled();
    });
  });
});
