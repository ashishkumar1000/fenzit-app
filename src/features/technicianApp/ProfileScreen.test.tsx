/**
 * ProfileScreen — the technician tab's contracts: the identity header and
 * the Play-mandated rows. The legal rows open the configured fenzit.com
 * pages, Delete account opens the shared role-specific dialog (an employee
 * gets the personal-data copy) and a confirmed request runs the shared
 * forced-logout flow. The profile store is mocked — its internals are its
 * own tests' job. These tests exist because the rows were originally added
 * only to the admin's More tab and this surface shipped without them.
 */
const mockReset = jest.fn();

jest.mock('../auth', () => ({
  useAuth: () => ({ reset: mockReset }),
}));

let mockRole = 'employee';
jest.mock('../profile', () => ({
  useMyProfile: () => ({
    profile: {
      name: 'QA Technician',
      role: mockRole,
      countryCode: '+91',
      phoneNumber: '9999900002',
    },
    isLoading: false,
  }),
  EditNameSheet: () => null,
  formatRole: () => 'Employee',
  formatPhone: () => '+91 99999 00002',
}));

jest.mock('../../services', () => ({
  runAllResets: jest.fn(),
  accountDeletionApi: { requestAccountDeletion: jest.fn() },
}));

jest.mock('../../services/authToken', () => ({
  clearAuthToken: jest.fn(),
}));

jest.mock('../../utils/linking', () => ({
  openWebPage: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ConfirmDialog } from '../../components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../../config';
import { accountDeletionApi, runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { openWebPage } from '../../utils/linking';
import ProfileScreen from './ProfileScreen';

function dialogsUp(root: ReactTestRenderer.ReactTestRenderer['root']) {
  return root.findAllByType(ConfirmDialog).filter(d => d.props.visible === true);
}

/** A row's visible texts — the action rows are Cards keyed by their label. */
function rowTexts(card: ReactTestInstance): string[] {
  return card
    .findAll(n => n.type === Text)
    .map(t => (typeof t.props.children === 'string' ? t.props.children : ''))
    .filter(Boolean);
}

function pressRow(root: ReactTestRenderer.ReactTestRenderer['root'], label: string) {
  const card = root
    .findAll(n => typeof n.type === 'function' && typeof n.props.onPress === 'function')
    .find(n => rowTexts(n).includes(label));
  if (!card) throw new Error(`row not found: ${label}`);
  act(() => {
    card.props.onPress();
  });
}

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<ProfileScreen />);
  });
  return renderer.root;
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'employee';
});

describe('ProfileScreen — identity + the Play rows', () => {
  it('shows the technician identity and all four rows', () => {
    const root = renderScreen();
    const labels = root
      .findAll(n => n.type === Text && typeof n.props.children === 'string')
      .map(t => t.props.children as string);
    for (const expected of ['QA Technician', 'Privacy policy', 'Terms of service', 'Delete account', 'Log out']) {
      expect(labels).toContain(expected);
    }
  });

  it('the legal rows open the configured fenzit.com pages', () => {
    const root = renderScreen();
    pressRow(root, 'Privacy policy');
    expect(openWebPage).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    pressRow(root, 'Terms of service');
    expect(openWebPage).toHaveBeenCalledWith(TERMS_URL);
    expect(openWebPage).toHaveBeenCalledTimes(2);
  });

  it('Delete account opens the shared dialog with the employee consequences copy', () => {
    const root = renderScreen();
    pressRow(root, 'Delete account');
    const dialog = dialogsUp(root)[0];
    expect(dialog.props.title).toBe('Delete your account?');
    expect(dialog.props.message).toContain('Your name, mobile number and sign-in details');
    expect(dialog.props.message).not.toContain("All of your company's data");
    expect(accountDeletionApi.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('a confirmed request files once, then runs the shared forced-logout flow', async () => {
    (accountDeletionApi.requestAccountDeletion as jest.Mock).mockResolvedValueOnce({
      message: 'ok',
    });
    const root = renderScreen();
    pressRow(root, 'Delete account');
    act(() => {
      dialogsUp(root)[0].props.onConfirm();
    });
    await act(async () => {});
    expect(accountDeletionApi.requestAccountDeletion).toHaveBeenCalledTimes(1);
    expect(clearAuthToken).toHaveBeenCalled();
    expect(runAllResets).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('cancel runs nothing — the session stays intact', () => {
    const root = renderScreen();
    pressRow(root, 'Delete account');
    act(() => {
      dialogsUp(root)[0].props.onCancel();
    });
    expect(accountDeletionApi.requestAccountDeletion).not.toHaveBeenCalled();
    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(dialogsUp(root)).toHaveLength(0);
  });
});
