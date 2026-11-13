/**
 * TechnicianTabs — the technician's bottom-tab group, pinned at the
 * NAVIGATION WIRING level: the screens themselves are stubs (each has its
 * own suite), and the bottom-tabs package is a prop-capturing stub.
 *
 * What's pinned here:
 *  - the tab set is Today / Jobs / Profile, and Attendance joins ONLY when
 *    the access store has resolved a non-`none` access (FR-3: an untracked
 *    technician never sees attendance UI, not even a tab);
 *  - a pushed instance mounts with `initialRouteName` from the `initialTab`
 *    param (2026-11-13 back-navigation fix: hardware back on the Rejected
 *    list must return to My jobs, not hop to Today first) — and the BOTTOM
 *    instance, which never carries the param, mounts on Today as always;
 *  - tab labels say "Jobs" while the route name stays `History` (internal
 *    identifiers don't ride copy changes).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// The navigation wiring under test.
let mockRouteParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
}));

// Prop-capturing bottom-tabs stub: Navigator records its props AND renders
// its children (otherwise Tab.Screen components are never mounted — they're
// plain JSX children, and only a rendering Navigator invokes them); Screen
// records its registration.
const navigatorProps: Array<Record<string, unknown>> = [];
const screens: Array<Record<string, unknown>> = [];
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: (props: Record<string, unknown>) => {
      navigatorProps.push(props);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const React = require('react');
      return React.createElement(React.Fragment, null, props.children);
    },
    Screen: (props: Record<string, unknown>) => {
      screens.push(props);
      return null;
    },
  }),
}));

jest.mock('../src/features/technicianApp', () => ({
  TodayScreen: () => null,
  TechJobsScreen: () => null,
  ProfileScreen: () => null,
}));

jest.mock('../src/features/attendance/me', () => ({
  AttendanceTabScreen: () => null,
  useAttendanceAccess: jest.fn(),
  useAttendanceAccessLifecycle: jest.fn(),
}));

jest.mock('../src/navigation/TabBar', () => ({
  TabBar: () => null,
}));

import TechnicianTabs from '../src/navigation/TechnicianTabs';
import { useAttendanceAccess } from '../src/features/attendance/me';

const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;

/** An attendance-enabled technician: the store resolved, access granted. */
function accessReady(attends = true) {
  useAttendanceAccessMock.mockReturnValue({
    status: 'ready',
    access: attends ? { attendanceAccess: 'upcoming' } : null,
  });
}

async function mount(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<TechnicianTabs />);
  });
  return renderer;
}

afterEach(() => {
  navigatorProps.length = 0;
  screens.length = 0;
  mockRouteParams = undefined;
  jest.clearAllMocks();
});

describe('TechnicianTabs — the tab set', () => {
  it('always registers Today, Jobs and Profile, with plain tab labels', async () => {
    accessReady();
    await mount();
    const names = screens.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(['Today', 'History', 'Profile']));
    // The route name stays `History` (internal identifiers don't ride copy
    // changes) but the label the user sees is "Jobs".
    const jobs = screens.find(s => s.name === 'History');
    expect(jobs?.options).toMatchObject({ tabBarLabel: 'Jobs' });
  });

  it('registers the Attendance tab only for a resolved non-`none` access', async () => {
    accessReady(true);
    await mount();
    expect(screens.map(s => s.name)).toContain('Attendance');

    // `none` — an untracked technician: no attendance UI anywhere.
    screens.length = 0;
    navigatorProps.length = 0;
    useAttendanceAccessMock.mockReturnValue({
      status: 'ready',
      access: { attendanceAccess: 'none' },
    });
    await mount();
    expect(screens.map(s => s.name)).not.toContain('Attendance');

    // Unresolved access state: the three-tab layout, never a flash of the
    // fourth tab while the first read is in flight.
    screens.length = 0;
    navigatorProps.length = 0;
    useAttendanceAccessMock.mockReturnValue({ status: 'unknown', access: null });
    await mount();
    expect(screens.map(s => s.name)).not.toContain('Attendance');
  });
});

describe('TechnicianTabs — the pushed instance initial tab', () => {
  it('mounts the pushed instance directly on the requested tab', async () => {
    // The My-jobs tiles' tap-through pushes a second tabs instance with
    // initialTab: 'History' — hardware back must pop straight back, not
    // switch to Today first.
    accessReady();
    mockRouteParams = { initialTab: 'History' };
    await mount();
    expect(navigatorProps[0].initialRouteName).toBe('History');
  });

  it('mounts the bottom instance on Today (no initialTab param)', async () => {
    accessReady();
    mockRouteParams = undefined;
    await mount();
    expect(navigatorProps[0].initialRouteName).toBeUndefined();
  });

  it('the initial tab is ignored as a value the control never sees (tab set unaffected)', async () => {
    accessReady();
    mockRouteParams = { initialTab: 'Today' };
    await mount();
    expect(navigatorProps[0].initialRouteName).toBe('Today');
    // Same three screens regardless — initialRouteName only picks the START.
    expect(screens.map(s => s.name)).toEqual(
      expect.arrayContaining(['Today', 'History', 'Profile']),
    );
  });
});
