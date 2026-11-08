/**
 * MoreScreen — the tile contracts this screen owns: each tile's subtitle
 * maps the shared stores' state (notifications unread, customers count with
 * a loading state), the focus refresh calls both stores' throttled loaders,
 * and each tile navigates to its own route. The stores themselves are
 * mocked — their internals are their own tests' job.
 */
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// Company admin by default; a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../auth', () => ({
  useAuth: () => ({ reset: jest.fn() }),
  useCanWrite: () => mockCanWrite,
}));

// The role the profile store reports — the delete-account copy switches on it.
let mockRole = 'company_admin';
jest.mock('../profile', () => ({
  useMyProfile: () => ({
    profile: {
      name: 'Ashish',
      role: mockRole,
      countryCode: '+91',
      phoneNumber: '9000000000',
      technicianCount: 0,
    },
    isLoading: false,
  }),
  EditNameSheet: () => null,
  formatRole: () => 'Admin',
  formatPhone: () => '+91 90000 00000',
}));

jest.mock('../notifications', () => ({
  useNotifications: jest.fn(),
  loadUnreadCount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../customers', () => ({
  useCustomers: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
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
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { ConfirmDialog } from '../../components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../../config';
import { loadCustomers, useCustomers } from '../customers';
import { loadUnreadCount, useNotifications } from '../notifications';
import { accountDeletionApi, runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { openWebPage } from '../../utils/linking';
import MoreScreen from './MoreScreen';
import { MoreRow } from './components/MoreRow';
import { MoreTile } from './components/MoreTile';

/** The ConfirmDialogs currently PRESENTED in the tree — a Modal keeps its
 *  children composed while invisible, so presence reads props.visible,
 *  never element existence. */
function dialogsUp(root: ReactTestRenderer.ReactTestRenderer['root']) {
  return root.findAllByType(ConfirmDialog).filter(d => d.props.visible === true);
}

const useNotificationsMock = useNotifications as jest.Mock;
const useCustomersMock = useCustomers as jest.Mock;
const useFocusEffectMock = useFocusEffect as jest.Mock;

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <MoreScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
  });
  mounted.push(renderer);
  return renderer.root;
}

// Unmount so no store subscription or timer outlives the suite.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

function subtitleTexts(root: ReactTestRenderer.ReactTestRenderer['root']): string[] {
  return root
    .findAllByType(Text)
    .map(t => t.props.children)
    .filter((c: unknown): c is string => typeof c === 'string');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanWrite = true;
  mockRole = 'company_admin';
  useNotificationsMock.mockReturnValue({ unreadCount: null });
  useCustomersMock.mockReturnValue({ count: 0, hasLoaded: true });
});

describe('MoreScreen tile subtitles', () => {
  it('shows a neutral notifications subtitle until the unread count lands', () => {
    expect(subtitleTexts(renderScreen())).toContain('Job & team updates');
  });

  it('reads the unread count once the store has it', () => {
    useNotificationsMock.mockReturnValue({ unreadCount: 3 });
    expect(subtitleTexts(renderScreen())).toContain('3 unread');

    useNotificationsMock.mockReturnValue({ unreadCount: 0 });
    expect(subtitleTexts(renderScreen())).toContain('All caught up');
  });

  it('does not invite adding a customer while the customers store is still loading', () => {
    useCustomersMock.mockReturnValue({ count: 0, hasLoaded: false });
    const texts = subtitleTexts(renderScreen());
    expect(texts).toContain('People you serve');
    expect(texts).not.toContain('Add your first customer');
  });

  it('distinguishes zero customers from a still-loading store', () => {
    useCustomersMock.mockReturnValue({ count: 0, hasLoaded: true });
    expect(subtitleTexts(renderScreen())).toContain('Add your first customer');

    useCustomersMock.mockReturnValue({ count: 2, hasLoaded: true });
    expect(subtitleTexts(renderScreen())).toContain('2 customers');
  });
});

describe('MoreScreen wiring', () => {
  it('refreshes both tile stores on focus through the throttled loaders', () => {
    renderScreen();
    // The useFocusEffect callback is the refresh — invoke what focus would.
    const focusCallback = useFocusEffectMock.mock.calls.at(-1)?.[0] as () => void;
    act(() => {
      focusCallback();
    });
    expect(loadUnreadCount).toHaveBeenCalled();
    expect(loadCustomers).toHaveBeenCalled();
  });

  it('navigates each tile and row to its own route', () => {
    const root = renderScreen();
    // The tile says "Employees"; its route name stays "Technicians".
    for (const [title, route] of [
      ['Employees', 'Technicians'],
      ['Notifications', 'Notifications'],
    ] as const) {
      const tile = root
        .findAllByType(MoreTile)
        .find(t => t.props.title === title);
      act(() => {
        tile?.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith(route);
    }

    const customersRow = root
      .findAllByType(MoreRow)
      .find(t => t.props.title === 'Customers');
    act(() => {
      customersRow?.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Customers');

    // The Attendance row is the entry point for the attendance SETUP hub
    // (the daily reads live on the Attendance tab since 2026-10). It must
    // navigate to the hub route, not a dead-end, and its subtitle must
    // promise only the setup surfaces the hub actually holds.
    const attendanceRow = root
      .findAllByType(MoreRow)
      .find(t => t.props.title === 'Attendance');
    expect(subtitleTexts(renderScreen())).toContain(
      'Offices, team, weekly off & holidays',
    );
    act(() => {
      attendanceRow?.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('AttendanceHome');
  });

  it('logs out only through the ConfirmDialog, running the forced-logout flow after the confirm', () => {
    const root = renderScreen();
    const logoutRow = root.findAllByType(MoreRow).find(t => t.props.title === 'Log out');

    // Pressing the row opens the shared ConfirmDialog — nothing resets yet.
    act(() => {
      logoutRow?.props.onPress();
    });
    const dialog = dialogsUp(root)[0];
    expect(dialog.props.title).toBe('Log out');
    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(runAllResets).not.toHaveBeenCalled();

    // CANCEL runs nothing (a confirmation default — Log out never fires
    // through the secondary).
    act(() => {
      dialog.props.onCancel();
    });
    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(runAllResets).not.toHaveBeenCalled();
    expect(dialogsUp(root)).toHaveLength(0);

    // Re-open, then CONFIRM: the flow runs after the dialog closes.
    act(() => {
      logoutRow?.props.onPress();
    });
    const confirm = dialogsUp(root)[0];
    act(() => {
      confirm.props.onConfirm();
    });
    expect(clearAuthToken).toHaveBeenCalled();
    expect(runAllResets).toHaveBeenCalled();
    expect(dialogsUp(root)).toHaveLength(0);
  });
});

describe('MoreScreen — a viewer (read-only)', () => {
  beforeEach(() => {
    mockCanWrite = false;
  });

  it('is never invited to add customers or a team', () => {
    useCustomersMock.mockReturnValue({ count: 0, hasLoaded: true });
    const texts = subtitleTexts(renderScreen());

    expect(texts).toContain('No customers yet');
    expect(texts).toContain('No team members yet');
    expect(texts).not.toContain('Add your first customer');
    expect(texts).not.toContain('Add your team');
  });

  it('still reaches Technicians, Customers, Reports, Attendance and Notifications (reads and report requests)', () => {
    const root = renderScreen();
    const titles = [...root.findAllByType(MoreTile), ...root.findAllByType(MoreRow)].map(n => n.props.title);

    for (const expected of ['Employees', 'Notifications', 'Customers', 'Reports', 'Attendance', 'Log out']) {
      expect(titles).toContain(expected);
    }
  });
});

describe('MoreScreen — the Play legal rows', () => {
  it('the privacy and terms rows open the configured fenzit.com pages', () => {
    const root = renderScreen();
    for (const [title, url] of [
      ['Privacy policy', PRIVACY_POLICY_URL],
      ['Terms of service', TERMS_URL],
    ] as const) {
      const row = root.findAllByType(MoreRow).find(t => t.props.title === title);
      act(() => {
        row?.props.onPress();
      });
      expect(openWebPage).toHaveBeenCalledWith(url);
    }
    expect(openWebPage).toHaveBeenCalledTimes(2);
  });
});

describe('MoreScreen — the delete-account flow (Play in-app path)', () => {
  function pressDeleteRow(root: ReactTestRenderer.ReactTestRenderer['root']) {
    const row = root.findAllByType(MoreRow).find(t => t.props.title === 'Delete account');
    act(() => {
      row?.props.onPress();
    });
  }

  it('the admin sees the company-wipe consequences before anything is filed', () => {
    const root = renderScreen();
    pressDeleteRow(root);
    const dialog = dialogsUp(root)[0];
    expect(dialog.props.title).toBe('Delete your account?');
    expect(dialog.props.message).toContain("All of your company's data");
    expect(accountDeletionApi.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('an employee sees the personal-data copy, not the company wipe', () => {
    mockRole = 'employee';
    const root = renderScreen();
    pressDeleteRow(root);
    const dialog = dialogsUp(root)[0];
    expect(dialog.props.message).toContain('Your name, mobile number and sign-in details');
    expect(dialog.props.message).not.toContain("All of your company's data");
  });

  it('a confirmed request files once, then runs the forced-logout flow', async () => {
    (accountDeletionApi.requestAccountDeletion as jest.Mock).mockResolvedValueOnce({
      message: 'ok',
    });
    const root = renderScreen();
    pressDeleteRow(root);
    act(() => {
      dialogsUp(root)[0].props.onConfirm();
    });
    await act(async () => {});
    expect(accountDeletionApi.requestAccountDeletion).toHaveBeenCalledTimes(1);
    expect(clearAuthToken).toHaveBeenCalled();
    expect(runAllResets).toHaveBeenCalled();
  });

  it('a failed request keeps the dialog up with the retry line and signs nobody out', async () => {
    (accountDeletionApi.requestAccountDeletion as jest.Mock).mockRejectedValueOnce(
      new Error('offline'),
    );
    const root = renderScreen();
    pressDeleteRow(root);
    act(() => {
      dialogsUp(root)[0].props.onConfirm();
    });
    await act(async () => {});
    const dialog = dialogsUp(root)[0];
    expect(dialogsUp(root)).toHaveLength(1);
    expect(dialog.props.message).toContain('We could not send your request');
    expect(clearAuthToken).not.toHaveBeenCalled();
    expect(runAllResets).not.toHaveBeenCalled();
  });
});
