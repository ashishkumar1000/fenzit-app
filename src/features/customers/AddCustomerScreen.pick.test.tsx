/**
 * AddCustomerScreen — "Pick from contacts" on the phone field (create mode).
 *
 * Same contract as the employee invite: the owner's chosen contact fills the
 * name and phone; a cancel changes nothing; a number that is not a 10-digit
 * mobile is refused and the form keeps what it had; a picker that fails keeps
 * the sheet open and typing still works. The native picker is mocked.
 */
jest.mock('./useCustomers', () => ({
  upsertCustomer: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-pick-contact', () => ({ pickContact: jest.fn() }));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { pickContact } from 'react-native-pick-contact';
import { Input, PickContactButton } from '../../components/ui';
import AddCustomerScreen from './AddCustomerScreen';

const pickContactMock = pickContact as jest.Mock;

const NOT_MOBILE = "This number isn't a 10-digit mobile number. Type the number instead.";
const PICK_FAILED = "Couldn't open your contacts. Type the number instead.";

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
  popTo: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddCustomerScreen
        navigation={navigation as never}
        route={{ params: { returnRouteName: 'Customers' } } as never}
      />,
    );
  });
  mounted.push(renderer);
  return renderer.root;
}

type Root = ReturnType<typeof renderScreen>;

const nameField = (root: Root) => root.findAllByType(Input).find(i => i.props.label === 'Customer name')!;
const phoneField = (root: Root) => root.findAllByType(Input).find(i => i.props.label === 'Phone number')!;

async function tapPick(root: Root) {
  await act(async () => {
    root.findByType(PickContactButton).props.onPress();
  });
}

function typePhone(root: Root, value: string) {
  act(() => phoneField(root).props.onChangeText(value));
}

function typeName(root: Root, value: string) {
  act(() => nameField(root).props.onChangeText(value));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.forEach(r => r.unmount());
  });
  mounted.length = 0;
});

describe('pick on the customer form', () => {
  it('fills the name and a cleaned phone from the chosen contact', async () => {
    pickContactMock.mockResolvedValueOnce({ name: '  Ramesh Kumar ', phone: '+91 98765 43210' });
    const root = renderScreen();
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Ramesh Kumar');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('keeps the typed name when the contact has a blank name', async () => {
    pickContactMock.mockResolvedValueOnce({ name: '   ', phone: '9876543210' });
    const root = renderScreen();
    typeName(root, 'Typed Name');
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('a number that is not a 10-digit mobile shows the message and changes nothing', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Overseas', phone: '+1 415 555 0100' });
    const root = renderScreen();
    typeName(root, 'Typed Name');
    typePhone(root, '9123456780');
    await tapPick(root);
    expect(phoneField(root).props.error).toBe(NOT_MOBILE);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(phoneField(root).props.value).toBe('9123456780');
  });

  it('a cancelled picker changes nothing and shows no message', async () => {
    pickContactMock.mockResolvedValueOnce(null);
    const root = renderScreen();
    typeName(root, 'Typed Name');
    typePhone(root, '9123456780');
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(phoneField(root).props.value).toBe('9123456780');
    expect(phoneField(root).props.error).toBe('');
  });

  it('a picker that fails shows the failure copy, and typing still works', async () => {
    pickContactMock.mockRejectedValueOnce(new Error('picker crashed'));
    const root = renderScreen();
    await tapPick(root);
    expect(phoneField(root).props.error).toBe(PICK_FAILED);
    typePhone(root, '9876543210');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('a double tap while the picker is open opens it once', async () => {
    let finish!: (v: null) => void;
    pickContactMock.mockImplementationOnce(() => new Promise<null>(r => (finish = r)));
    const root = renderScreen();
    act(() => {
      root.findByType(PickContactButton).props.onPress();
      root.findByType(PickContactButton).props.onPress();
    });
    expect(pickContactMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
  });

  it('a pick clears the field error from an earlier failed pick', async () => {
    pickContactMock
      .mockRejectedValueOnce(new Error('picker crashed'))
      .mockResolvedValueOnce({ name: 'Ramesh', phone: '9876543210' });
    const root = renderScreen();
    await tapPick(root);
    expect(phoneField(root).props.error).toBe(PICK_FAILED);
    await tapPick(root);
    expect(phoneField(root).props.error).toBe('');
    expect(phoneField(root).props.value).toBe('9876543210');
  });
});
