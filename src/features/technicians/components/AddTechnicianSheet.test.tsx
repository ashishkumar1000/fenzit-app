/**
 * AddTechnicianSheet wiring tests.
 *
 * 1. Skill picker (story 5.1 review follow-up): the sheet must load from the
 *    shared `useSkills` store when it opens — never run a private fetch — and
 *    must not fetch while closed.
 *
 * 2. Submit contract (inline-add review follow-up): the sheet owns the
 *    submit UX — a resolved `onSubmit` closes and resets the form, a
 *    rejected one maps the error to copy and stays open. No screen suite
 *    exercises this path (both consumers stub the sheet), so this suite is
 *    the only place the real `handleSubmit` runs.
 */
jest.mock('../../skills', () => ({
  loadSkills: jest.fn().mockResolvedValue(undefined),
  useSkills: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, Input, MultiSelect } from '../../../components/ui';
import { loadSkills, useSkills } from '../../skills';
import { AddTechnicianSheet } from './AddTechnicianSheet';

const loadSkillsMock = loadSkills as jest.Mock;
const useSkillsMock = useSkills as jest.Mock;

function mockStore(overrides: Record<string, unknown> = {}) {
  useSkillsMock.mockReturnValue({
    skills: [],
    isLoading: false,
    error: null,
    ...overrides,
  });
}

type SheetProps = {
  visible?: boolean;
  onClose?: () => void;
  onSubmit?: (input: unknown) => Promise<void>;
};

function renderSheet(props: SheetProps = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet
        visible={props.visible ?? true}
        onClose={props.onClose ?? (() => {})}
        onSubmit={props.onSubmit ?? (async () => {})}
      />,
    );
  });
  return renderer.root;
}

/** Fills the form through the real inputs so `canSubmit` gates honestly. */
function fillValidForm(root: ReactTestRenderer.ReactTestInstance) {
  const inputs = root.findAllByType(Input);
  act(() => inputs[0].props.onChangeText('Vel Murugan'));
  act(() => inputs[1].props.onChangeText('9123456780'));
  act(() => root.findByType(MultiSelect).props.onChange(['s1']));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore();
});

it('loads skills from the shared store when the sheet opens, not while closed', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AddTechnicianSheet visible={false} onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  // The sheet stays mounted while hidden — the hook's own first-mount load
  // must be silenced (`autoLoad: false`) or merely rendering Technicians
  // would fire the GET before any sheet is opened.
  expect(useSkillsMock).toHaveBeenCalledWith({ autoLoad: false });
  expect(loadSkillsMock).not.toHaveBeenCalled();

  act(() => {
    renderer.update(
      <AddTechnicianSheet visible onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  expect(loadSkillsMock).toHaveBeenCalledTimes(1);

  act(() => {
    renderer.update(
      <AddTechnicianSheet visible={false} onClose={() => {}} onSubmit={async () => {}} />,
    );
  });
  expect(loadSkillsMock).toHaveBeenCalledTimes(1);
});

it('offers exactly the skills the shared store holds', () => {
  const options = [
    { value: 's1', label: 'AC repair' },
    { value: 's2', label: 'Wiring' },
  ];
  mockStore({
    skills: [
      { id: 's1', name: 'AC repair' },
      { id: 's2', name: 'Wiring' },
    ],
  });
  const root = renderSheet({ visible: true });
  const multiSelect = root.findByType(MultiSelect);
  expect(multiSelect.props.options).toEqual(options);
  expect(multiSelect.props.disabled).toBe(false);
});

// --- Submit contract ---------------------------------------------------------

it('closes and resets after a successful submit', async () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const root = renderSheet({ visible: true, onClose, onSubmit });

  fillValidForm(root);
  const button = root.findByType(Button);
  expect(button.props.disabled).toBe(false);

  await act(async () => {
    button.props.onPress();
  });

  expect(onSubmit).toHaveBeenCalledWith({
    name: 'Vel Murugan',
    phone: '9123456780',
    skillIds: ['s1'],
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  // Reset on success — reopening shows a blank form, not the sent values.
  expect(root.findAllByType(Input)[0].props.value).toBe('');
});

it('stays open with the mapped error when the invite fails', async () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const onClose = jest.fn();
  const onSubmit = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('conflict'), { code: 'ALREADY_IN_TEAM' }),
      );
  const root = renderSheet({ visible: true, onClose, onSubmit });

  fillValidForm(root);
  await act(async () => {
    root.findByType(Button).props.onPress();
  });

  expect(onClose).not.toHaveBeenCalled();
  const hasErrorText = root
    .findAllByType(Text)
    .some(t => t.props.children === 'This person is already in your team.');
  expect(hasErrorText).toBe(true);
  // The failed submit must not wipe the form — the owner only fixes what's
  // wrong (the phone), not retypes everything.
  expect(root.findAllByType(Input)[0].props.value).toBe('Vel Murugan');
});

// --- Invite error copy -------------------------------------------------------

/** Submits a valid form whose `onSubmit` rejects with the given error. */
async function submitRejectingWith(err: unknown) {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const onSubmit = jest.fn().mockRejectedValue(err);
  const root = renderSheet({ visible: true, onSubmit });
  fillValidForm(root);
  await act(async () => {
    root.findByType(Button).props.onPress();
  });
  return root;
}

/** Every text node on screen, so a test can assert the exact copy shown. */
function visibleText(root: ReactTestRenderer.ReactTestInstance): unknown[] {
  return root.findAllByType(Text).map(t => t.props.children);
}

it.each([
  [
    'a number already in another company',
    { code: 'DUPLICATE_RESOURCE', message: 'x' },
    'This number already belongs to a company.',
  ],
  [
    'a Fenzit staff number',
    { code: 'PLATFORM_STAFF_NOT_MEMBER', message: 'x' },
    'This number belongs to Fenzit staff and cannot join a company.',
  ],
  [
    'an invalid phone or skill',
    { code: 'VALIDATION_ERROR', message: 'x' },
    'Check the phone number and skills — one of them looks invalid.',
  ],
  [
    'a caller without invite rights',
    { status: 403, code: 'FORBIDDEN', message: 'x' },
    "You don't have permission to invite technicians.",
  ],
])('shows the right copy for %s', async (_label, err, copy) => {
  const root = await submitRejectingWith(Object.assign(new Error('x'), err));
  expect(visibleText(root)).toContain(copy);
});

it('shows the server message for an unknown error, never a raw code', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('Network request failed'), { code: 'SOMETHING_NEW' }),
  );
  expect(visibleText(root)).toContain('Network request failed');
  expect(visibleText(root)).not.toContain('SOMETHING_NEW');
});

it('keeps the team message for a same-company duplicate, not the company one', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('x'), { code: 'ALREADY_IN_TEAM' }),
  );
  expect(visibleText(root)).toContain('This person is already in your team.');
  expect(visibleText(root)).not.toContain('This number already belongs to a company.');
});

// --- Why Send invite is off --------------------------------------------------

/** The one-line reason under the button, or null when none is shown. */
function inviteHint(root: ReactTestRenderer.ReactTestInstance): unknown {
  const copy = [
    "Enter the person's name to continue",
    'Enter a 10-digit phone number to continue',
    'Pick at least one skill to continue',
  ];
  return visibleText(root).find(c => copy.includes(c as string)) ?? null;
}

it('names the first missing field, in on-screen order', () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const root = renderSheet({ visible: true });
  // Nothing filled: name comes first.
  expect(inviteHint(root)).toBe("Enter the person's name to continue");

  // Name only: phone is next.
  const inputs = root.findAllByType(Input);
  act(() => inputs[0].props.onChangeText('Vel Murugan'));
  expect(inviteHint(root)).toBe('Enter a 10-digit phone number to continue');

  // Name and phone: skill is last.
  act(() => inputs[1].props.onChangeText('9123456780'));
  expect(inviteHint(root)).toBe('Pick at least one skill to continue');

  // Everything filled: no hint.
  act(() => root.findByType(MultiSelect).props.onChange(['s1']));
  expect(inviteHint(root)).toBeNull();
});

it('treats a whitespace-only name as missing, and a 9-digit phone as incomplete', () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const root = renderSheet({ visible: true });
  const inputs = root.findAllByType(Input);

  act(() => inputs[0].props.onChangeText('   '));
  expect(inviteHint(root)).toBe("Enter the person's name to continue");

  act(() => inputs[0].props.onChangeText('Vel Murugan'));
  act(() => inputs[1].props.onChangeText('912345678'));
  expect(inviteHint(root)).toBe('Enter a 10-digit phone number to continue');
});

it('hides the hint while a server error is showing', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('x'), { code: 'DUPLICATE_RESOURCE' }),
  );
  expect(inviteHint(root)).toBeNull();
  expect(visibleText(root)).toContain('This number already belongs to a company.');
});
// --- A stale server error clears on the next edit ----------------------------

it('clears a server error when the name is emptied, and shows the name reason again', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('x'), { code: 'DUPLICATE_RESOURCE' }),
  );
  expect(visibleText(root)).toContain('This number already belongs to a company.');

  act(() => root.findAllByType(Input)[0].props.onChangeText(''));
  expect(visibleText(root)).not.toContain('This number already belongs to a company.');
  expect(inviteHint(root)).toBe("Enter the person's name to continue");
});

it('clears a server error when the skills change, and shows the skill reason again', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('x'), { code: 'VALIDATION_ERROR' }),
  );
  expect(visibleText(root)).toContain('Check the phone number and skills — one of them looks invalid.');

  act(() => root.findByType(MultiSelect).props.onChange([]));
  expect(visibleText(root)).not.toContain('Check the phone number and skills — one of them looks invalid.');
  expect(inviteHint(root)).toBe('Pick at least one skill to continue');
});

it('clears a server error when the phone is edited', async () => {
  const root = await submitRejectingWith(
    Object.assign(new Error('x'), { code: 'DUPLICATE_RESOURCE' }),
  );
  act(() => root.findAllByType(Input)[1].props.onChangeText('912345678'));
  expect(visibleText(root)).not.toContain('This number already belongs to a company.');
  expect(inviteHint(root)).toBe('Enter a 10-digit phone number to continue');
});

it('drops an invite error that arrives after the owner changed the form', async () => {
  let rejectInvite!: (err: unknown) => void;
  const onSubmit = jest.fn(
    () => new Promise<void>((_resolve, reject) => (rejectInvite = reject)),
  );
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const root = renderSheet({ visible: true, onSubmit });
  fillValidForm(root);

  let pending!: Promise<void>;
  act(() => {
    pending = root.findByType(Button).props.onPress();
  });
  // The owner edits the name while the invite is still running.
  act(() => root.findAllByType(Input)[0].props.onChangeText('Vel M'));
  await act(async () => {
    rejectInvite(Object.assign(new Error('x'), { code: 'DUPLICATE_RESOURCE' }));
    await pending;
  });

  // That error describes the old form, so it must not show.
  expect(visibleText(root)).not.toContain('This number already belongs to a company.');
});

it('keeps only the digits of the phone, capped at 10, whatever is typed', () => {
  mockStore({ skills: [{ id: 's1', name: 'AC repair' }] });
  const root = renderSheet({ visible: true });
  act(() => root.findAllByType(Input)[1].props.onChangeText('ab 91234-56780 99'));
  expect(root.findAllByType(Input)[1].props.value).toBe('9123456780');
});

it('allows 20 skills and blocks the 21st', () => {
  const skills = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}` }));
  mockStore({ skills });
  const root = renderSheet({ visible: true });
  const inputs = root.findAllByType(Input);
  act(() => inputs[0].props.onChangeText('Vel Murugan'));
  act(() => inputs[1].props.onChangeText('9123456780'));

  act(() => root.findByType(MultiSelect).props.onChange(skills.slice(0, 20).map(s => s.id)));
  expect(root.findByType(Button).props.disabled).toBe(false);

  act(() => root.findByType(MultiSelect).props.onChange(skills.map(s => s.id)));
  expect(root.findByType(Button).props.disabled).toBe(true);
});
