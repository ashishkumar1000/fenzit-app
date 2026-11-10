/**
 * AddTechnicianSheet — "Pick from contacts" behaviour (story 21-5).
 *
 * The native picker is mocked: Jest never touches the TurboModule. Each case
 * covers a requirement from the story, plus the failure and race paths a
 * tester would try first (cancel, bad number, picker crash, double tap,
 * picking while the invite is sending).
 */
jest.mock('../../skills', () => ({
  loadSkills: jest.fn().mockResolvedValue(undefined),
  useSkills: jest.fn(),
}));
jest.mock('react-native-pick-contact', () => ({ pickContact: jest.fn() }));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { pickContact } from 'react-native-pick-contact';
import { Button, Input, PickContactButton } from '../../../components/ui';
import { useSkills } from '../../skills';
import { AddTechnicianSheet } from './AddTechnicianSheet';

const pickContactMock = pickContact as jest.Mock;
const useSkillsMock = useSkills as jest.Mock;

const FROM_CONTACTS = 'From your contacts. Change it if needed.';
const NOT_MOBILE = "This number isn't a 10-digit mobile number. Type the number instead.";
const PICK_FAILED = "Couldn't open your contacts. Type the number instead.";
const LOCKED = "You can't change the number while the invite is sent.";

type SheetProps = {
  onClose?: () => void;
  onSubmit?: (input: unknown) => Promise<void>;
};

function renderSheet(props: SheetProps = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet
        visible
        onClose={props.onClose ?? (() => {})}
        onSubmit={props.onSubmit ?? (async () => {})}
      />,
    );
  });
  return renderer.root;
}

type Root = ReactTestRenderer.ReactTestInstance;

const nameField = (root: Root) => root.findAllByType(Input)[0];
const phoneField = (root: Root) => root.findAllByType(Input)[1];
const pickButton = (root: Root) => root.findByType(PickContactButton);
const sendButton = (root: Root) => root.findByType(Button);

function textShown(root: Root, copy: string) {
  return root.findAllByType(Text).some(t => [t.props.children].flat().join('') === copy);
}

async function tapPick(root: Root) {
  await act(async () => {
    pickButton(root).props.onPress();
  });
}

function typeName(root: Root, value: string) {
  act(() => nameField(root).props.onChangeText(value));
}

function typePhone(root: Root, value: string) {
  act(() => phoneField(root).props.onChangeText(value));
}

beforeEach(() => {
  jest.clearAllMocks();
  useSkillsMock.mockReturnValue({ skills: [], isLoading: false, error: null });
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

describe('pick fills the form', () => {
  it('sets the name and a cleaned 10-digit phone from the chosen contact', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '+91 98765 43210' });
    const root = renderSheet();
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Suresh Kumar');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('trims the picked name before filling it', async () => {
    pickContactMock.mockResolvedValueOnce({ name: '  Suresh Kumar  ', phone: '9876543210' });
    const root = renderSheet();
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Suresh Kumar');
  });

  it('shows the "from your contacts" caption under the name after a pick', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '9876543210' });
    const root = renderSheet();
    await tapPick(root);
    expect(nameField(root).props.helper).toBe(FROM_CONTACTS);
  });

  it('clears the caption as soon as the owner edits the name', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '9876543210' });
    const root = renderSheet();
    await tapPick(root);
    typeName(root, 'Suresh K');
    expect(nameField(root).props.helper).toBe('');
    expect(textShown(root, FROM_CONTACTS)).toBe(false);
  });

  it('keeps the typed name when the contact has a blank name, and shows no caption', async () => {
    pickContactMock.mockResolvedValueOnce({ name: '   ', phone: '9876543210' });
    const root = renderSheet();
    typeName(root, 'Typed Name');
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(nameField(root).props.helper).toBe('');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('enables Send invite once the pick and the skills are valid', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '9876543210' });
    const root = renderSheet();
    expect(sendButton(root).props.disabled).toBe(true);
    await tapPick(root);
    expect(sendButton(root).props.disabled).toBe(false);
  });

  it('announces the result to screen readers', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '9876543210' });
    const root = renderSheet();
    await tapPick(root);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Filled in from your contacts.');
  });
});

describe('numbers that are not a 10-digit mobile', () => {
  it('shows the message and keeps the previous name and phone', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Foreign Contact', phone: '+1 415 555 0100' });
    const root = renderSheet();
    typeName(root, 'Typed Name');
    typePhone(root, '9123456780');
    await tapPick(root);
    expect(phoneField(root).props.error).toBe(NOT_MOBILE);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(phoneField(root).props.value).toBe('9123456780');
    expect(nameField(root).props.helper).toBe('');
  });

  it('a short number does not write the number into the field', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Short', phone: '98765' });
    const root = renderSheet();
    await tapPick(root);
    expect(phoneField(root).props.value).toBe('');
    expect(phoneField(root).props.error).toBe(NOT_MOBILE);
  });

  it('clears the message once the owner types in the phone field', async () => {
    pickContactMock.mockResolvedValueOnce({ name: 'Foreign', phone: '+1 415 555 0100' });
    const root = renderSheet();
    await tapPick(root);
    typePhone(root, '9');
    expect(phoneField(root).props.error).toBe('');
  });
});

describe('cancel and failure', () => {
  it('a cancelled picker changes nothing and shows no message', async () => {
    pickContactMock.mockResolvedValueOnce(null);
    const root = renderSheet();
    typeName(root, 'Typed Name');
    typePhone(root, '9123456780');
    await tapPick(root);
    expect(nameField(root).props.value).toBe('Typed Name');
    expect(phoneField(root).props.value).toBe('9123456780');
    expect(phoneField(root).props.error).toBe('');
    expect(textShown(root, NOT_MOBILE)).toBe(false);
  });

  it('a picker that fails shows the failure copy and keeps the sheet open', async () => {
    pickContactMock.mockRejectedValueOnce(new Error('picker crashed'));
    const onClose = jest.fn();
    const root = renderSheet({ onClose });
    await tapPick(root);
    expect(phoneField(root).props.error).toBe(PICK_FAILED);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('typing still works after the picker fails', async () => {
    pickContactMock.mockRejectedValueOnce(new Error('picker crashed'));
    const root = renderSheet();
    await tapPick(root);
    typePhone(root, '9876543210');
    expect(phoneField(root).props.value).toBe('9876543210');
  });

  it('announces the failure to screen readers', async () => {
    pickContactMock.mockRejectedValueOnce(new Error('picker crashed'));
    const root = renderSheet();
    await tapPick(root);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(PICK_FAILED);
  });
});

describe('race and ordering', () => {
  it('a double tap while the picker is open opens it once', async () => {
    let finish!: (v: null) => void;
    pickContactMock.mockImplementationOnce(() => new Promise<null>(r => (finish = r)));
    const root = renderSheet();
    act(() => {
      pickButton(root).props.onPress();
      pickButton(root).props.onPress();
    });
    expect(pickContactMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
  });

  it('the picker button is disabled while the invite is being sent, and says why', async () => {
    const onSubmit = jest.fn(() => new Promise<void>(() => {}));
    const root = renderSheet({ onSubmit });
    typeName(root, 'Vel Murugan');
    typePhone(root, '9123456780');
    await act(async () => {
      root.findByType(Button).props.onPress();
    });
    expect(pickButton(root).props.disabled).toBe(true);
    expect(textShown(root, LOCKED)).toBe(true);
  });

  it('a pick clears a stale server error from the last invite attempt', async () => {
    const onSubmit = jest.fn(() => Promise.reject({ code: 'ALREADY_IN_TEAM', status: 409, message: 'x' }));
    pickContactMock.mockResolvedValueOnce({ name: 'Suresh Kumar', phone: '9876543210' });
    const root = renderSheet({ onSubmit });
    typeName(root, 'Vel Murugan');
    typePhone(root, '9123456780');
    await act(async () => {
      await root.findByType(Button).props.onPress();
    });
    expect(textShown(root, 'This person is already in your team.')).toBe(true);
    await tapPick(root);
    expect(textShown(root, 'This person is already in your team.')).toBe(false);
  });
});
