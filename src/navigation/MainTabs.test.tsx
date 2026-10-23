/**
 * MainTabs — the footer composition contract (CAP-1): exactly four tabs —
 * Home, Jobs, Attendance, Account — in that order. No other automated check
 * renders the tab GROUP, so a fifth tab, a renamed label, a reorder or a
 * Customers regression fails here. The four tab screens are stubbed (their
 * own suites pin them); the REAL TabBar renders so the labels/keys are the
 * shipped ones. (Safe-area context comes from the global jest.setup mock —
 * the bottom-tab navigator needs its full surface, not a View stub.)
 */
jest.mock('../screens/HomeScreen', () => ({
  __esModule: true,
  // Named function expressions — an arrow infers the name "default" and
  // React Navigation warns about lowercase screen component names.
  default: function HomeScreen() {
    return null;
  },
}));
jest.mock('../features/jobs', () => ({
  JobsScreen: function JobsScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/home', () => ({
  AttendanceTabHomeScreen: function AttendanceTabHomeScreen() {
    return null;
  },
}));
jest.mock('../features/more', () => ({
  MoreScreen: function MoreScreen() {
    return null;
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import MainTabs from './MainTabs';

describe('MainTabs — the owner footer (CAP-1)', () => {
  it('renders exactly Home, Jobs, Attendance, Account — in that order', () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = create(
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>,
      );
    });

    // RTR mirrors Pressables through host Views, so each tab appears more
    // than once — dedupe keeping first-occurrence order.
    const labels = r.root
      .findAll(node => node.props.accessibilityRole === 'button')
      .map(node => node.props.accessibilityLabel as string)
      .filter(Boolean);
    expect([...new Set(labels)]).toEqual(['Home', 'Jobs', 'Attendance', 'Account']);

    act(() => {
      r.unmount();
    });
  });

  it('registers no Customers tab (it stacks on the root stack now)', () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = create(
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>,
      );
    });

    expect(
      r.root.findAll(node => node.props.accessibilityLabel === 'Customers'),
    ).toHaveLength(0);

    act(() => {
      r.unmount();
    });
  });
});
