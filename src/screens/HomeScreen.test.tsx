/**
 * HomeScreen — the Attendance entry contract (2026-09-30, split targets
 * 2026-10): the attendance surfaces render ONLY while the profile's
 * `attendance` mirror says the tenant module is enabled (an absent mirror —
 * older backend, pre-onboarding — fails HIDDEN, never crashes). The
 * today-pulse card opens the Today dashboard; the plain tile opens the
 * Attendance TAB page with its "Today, monthly & leave" subtitle — neither
 * lands on the setup-only hub. The stores are mocked — their internals are
 * their own tests' job.
 */
const mockNavigate = jest.fn();

const mockProfileState: { profile: unknown } = { profile: null };

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../features/profile', () => ({
  useMyProfile: () => ({
    profile: mockProfileState.profile,
    isLoading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
    dismissError: jest.fn(),
    clear: jest.fn(),
  }),
  firstName: (name: string | null) => (name ? name.split(' ')[0] : null),
  loadMyProfile: jest.fn().mockResolvedValue(undefined),
}));

// Today's Pulse has its own request; the hook is mocked so each test picks
// the posture (loading / error / ready) and can see the `enabled` argument.
const mockPulse: { value: unknown } = { value: { status: 'error' } };
const mockUseTodayPulse = jest.fn((_enabled: boolean) => mockPulse.value);
jest.mock('../features/home/useTodayPulse', () => ({
  useTodayPulse: (enabled: boolean) => mockUseTodayPulse(enabled),
}));

const mockNotifications: { unreadCount: number | null } = { unreadCount: null };
jest.mock('../features/notifications', () => ({
  useNotifications: () => ({
    unreadCount: mockNotifications.unreadCount,
    loadUnreadCount: jest.fn().mockResolvedValue(undefined),
  }),
}));

// The real session is empty in this test, so the role hooks are pinned:
// a company admin by default, a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../features/auth/useRole', () => ({
  ...jest.requireActual('../features/auth/useRole'),
  useCanWrite: () => mockCanWrite,
  useSessionRole: () => (mockCanWrite ? 'company_admin' : 'viewer'),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import HomeScreen from './HomeScreen';

/** Minimal owner profile that renders the new-user branch (no technicians,
 * no jobs) — the lightest full-fidelity render of the real payload shape. */
function ownerProfile(attendance?: Record<string, unknown>): unknown {
  return {
    id: 'owner-1',
    name: 'Ashish',
    role: 'company_admin',
    countryCode: '+91',
    phoneNumber: '9000000000',
    status: 'active',
    tenant: { id: 't1', companyName: 'Acme Services' },
    technicianCount: 0,
    customers: { data: [], nextCursor: null, hasMore: false },
    jobs: { data: [], nextCursor: null, hasMore: false },
    jobCounts: {
      today: 0,
      upcoming: 0,
      overdue: 0,
      completed: 0,
      cancelled: 0,
    },
    ...(attendance === undefined ? {} : { attendance }),
  };
}

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <HomeScreen
        navigation={{ navigate: mockNavigate } as never}
        route={{} as never}
      />,
    );
  });
  mounted.push(renderer);
  return renderer.root;
}

// Unmount so no store subscription outlives the suite.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

function texts(root: ReactTestRenderer.ReactTestRenderer['root']): string[] {
  return root
    .findAllByType(Text)
    .map(t => t.props.children)
    .filter((c: unknown): c is string => typeof c === 'string');
}

describe('HomeScreen — the Attendance entry tile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPulse.value = { status: 'error' };
  });

  it('falls back to the plain tile when the Pulse request fails, and it opens the Attendance tab page', () => {
    mockProfileState.profile = ownerProfile({
      attendanceEnabled: true,
      attendanceAccess: 'none',
      attendanceStartDate: null,
      onboardedAt: null,
    });
    const root = renderScreen();

    expect(texts(root)).toContain('Attendance');
    expect(texts(root)).toContain('Today, monthly & leave');

    // The label query alone matches jest's wrapper duplicates (the store
    // mock's known RTR gotcha) — pin the one PRESSABLE via predicate.
    const tile = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        node.props?.accessibilityLabel === 'Attendance' &&
        typeof node.props.onPress === 'function',
    );
    expect(tile).toHaveLength(1);
    act(() => {
      tile[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Attendance');
  });

  it('renders nothing when the module is disabled', () => {
    mockProfileState.profile = ownerProfile({
      attendanceEnabled: false,
      attendanceAccess: 'none',
      attendanceStartDate: null,
      onboardedAt: null,
    });
    const root = renderScreen();

    expect(texts(root)).not.toContain('Attendance');
    expect(root.findAllByProps({ accessibilityLabel: 'Attendance' })).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('fails HIDDEN without a mirror (older backend, pre-onboarding)', () => {
    mockProfileState.profile = ownerProfile();
    const root = renderScreen();

    expect(texts(root)).not.toContain('Attendance');
    expect(root.findAllByProps({ accessibilityLabel: 'Attendance' })).toHaveLength(0);
  });

  it('renders the tile on the ESTABLISHED dashboard too (the branch most owners live in)', () => {
    // technicianCount > 0 AND any job bucket > 0 → the full dashboard
    // branch renders (HomeScreen's isSetupComplete conjunct).
    const base = ownerProfile({
      attendanceEnabled: true,
      attendanceAccess: 'none',
      attendanceStartDate: null,
      onboardedAt: null,
    }) as Record<string, unknown>;
    mockProfileState.profile = {
      ...base,
      technicianCount: 2,
      jobCounts: {
        today: 1,
        upcoming: 0,
        overdue: 0,
        completed: 3,
        cancelled: 0,
      },
    };
    const root = renderScreen();

    // The exact same tile contract as the first-run branch, now in the
    // dashboard's slot between QuickActions and Today's jobs.
    const tile = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        node.props?.accessibilityLabel === 'Attendance' &&
        typeof node.props.onPress === 'function',
    );
    expect(tile).toHaveLength(1);
  });

  const enabledProfile = () =>
    ownerProfile({
      attendanceEnabled: true,
      attendanceAccess: 'none',
      attendanceStartDate: null,
      onboardedAt: null,
    });

  it('shows Today\'s Pulse (not the plain tile) once the numbers load, and it opens the Today dashboard', () => {
    mockProfileState.profile = enabledProfile();
    mockPulse.value = {
      status: 'ready',
      date: '2026-10-24',
      counts: { tracked: 50, checkedIn: 42, notCheckedIn: 2, shortDay: 0, late: 2, onLeave: 4 },
    };
    const root = renderScreen();

    expect(texts(root)).toContain("Attendance today");
    expect(texts(root)).toContain('Saturday, Oct 24');
    expect(texts(root)).toContain('84%');
    expect(texts(root)).not.toContain('Today, monthly & leave');
    const card = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        String(node.props?.accessibilityLabel ?? '').startsWith("Attendance today") &&
        typeof node.props.onPress === 'function',
    );
    expect(card).toHaveLength(1);
    act(() => {
      card[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('AttendanceDashboard');
  });

  it('shimmers while the Pulse request is in flight — no tile, no numbers', () => {
    mockProfileState.profile = enabledProfile();
    mockPulse.value = { status: 'loading' };
    const root = renderScreen();

    expect(
      root.findAll(
        (n: ReactTestRenderer.ReactTestInstance) =>
          n.props?.accessibilityLabel === "Loading today's attendance",
      ).length,
    ).toBeGreaterThan(0);
    expect(texts(root)).not.toContain("Attendance today");
    expect(texts(root)).not.toContain('Attendance');
  });

  it('asks for the Pulse only while attendance is enabled', () => {
    mockProfileState.profile = ownerProfile(undefined);
    renderScreen();
    expect(mockUseTodayPulse).toHaveBeenCalledWith(false);
    expect(mockUseTodayPulse).not.toHaveBeenCalledWith(true);

    mockUseTodayPulse.mockClear();
    mockProfileState.profile = enabledProfile();
    renderScreen();
    expect(mockUseTodayPulse).toHaveBeenCalledWith(true);
  });
});

describe('HomeScreen — the bell on the first-run Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPulse.value = { status: 'error' };
    mockNotifications.unreadCount = null;
  });

  it('shows the bell on the first-run Home, with no unread dot yet', () => {
    mockProfileState.profile = ownerProfile();
    const root = renderScreen();

    const bell = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        node.props?.accessibilityLabel === 'Notifications' &&
        typeof node.props.onPress === 'function',
    );
    expect(bell).toHaveLength(1);
  });

  it('treats zero unread as read: plain label, no count', () => {
    mockNotifications.unreadCount = 0;
    mockProfileState.profile = ownerProfile();
    const root = renderScreen();

    const bell = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        node.props?.accessibilityLabel === 'Notifications' &&
        typeof node.props.onPress === 'function',
    );
    expect(bell).toHaveLength(1);
  });

  it('labels the bell with the unread count and opens Notifications on tap', () => {
    mockNotifications.unreadCount = 3;
    mockProfileState.profile = ownerProfile();
    const root = renderScreen();

    const bell = root.findAll(
      (node: ReactTestRenderer.ReactTestInstance) =>
        node.props?.accessibilityLabel === 'Notifications, 3 unread' &&
        typeof node.props.onPress === 'function',
    );
    expect(bell).toHaveLength(1);
    act(() => {
      bell[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Notifications');
  });
});

beforeEach(() => {
  mockCanWrite = true;
});
