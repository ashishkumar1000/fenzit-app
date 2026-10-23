/**
 * RootNavigator — the stacked `Customers` route contract (2026-10 footer
 * restructure): the customer list lives on the ROOT stack now, registered
 * under the load-bearing name `Customers` (the Account tab's row pushes it;
 * `AddCustomerReturnRouteName` returns to it). No other check renders the
 * navigator — deleting or renaming the route keeps every other suite green
 * (MoreScreen's navigate absorbs into a mock) — so this composition test
 * pins it: a `navigate('Customers')` must MOUNT the customers screen.
 *
 * All screen components are stubbed (their own suites pin them); the REAL
 * native stack renders so the route registry is the shipped one. Navigation
 * is driven through a container ref — the same imperative-handle pattern as
 * `navigationRef.ts`.
 */
const mockMounted: string[] = [];

jest.mock('./MainTabs', () => ({
  __esModule: true,
  default: function MainTabs() {
    return null;
  },
}));
jest.mock('../features/technicians', () => ({
  TechniciansScreen: function TechniciansScreen() {
    return null;
  },
}));
jest.mock('../features/newJob', () => ({
  NewJobScreen: function NewJobScreen() {
    return null;
  },
  SelectCustomersScreen: function SelectCustomersScreen() {
    return null;
  },
  SelectSkillsScreen: function SelectSkillsScreen() {
    return null;
  },
  SelectTechniciansScreen: function SelectTechniciansScreen() {
    return null;
  },
}));
jest.mock('../features/jobDetail', () => ({
  JobDetailScreen: function JobDetailScreen() {
    return null;
  },
}));
jest.mock('../features/notifications', () => ({
  NotificationsScreen: function NotificationsScreen() {
    return null;
  },
}));
jest.mock('../features/reports', () => ({
  ReportsScreen: function ReportsScreen() {
    return null;
  },
}));
jest.mock('../features/customerDetail', () => ({
  CustomerDetailScreen: function CustomerDetailScreen() {
    return null;
  },
}));
jest.mock('../features/customers', () => ({
  AddCustomerScreen: function AddCustomerScreen() {
    return null;
  },
  CustomersScreen: function CustomersScreen() {
    mockMounted.push('Customers');
    return null;
  },
}));
jest.mock('../features/attendance/offices', () => ({
  OfficesScreen: function OfficesScreen() {
    return null;
  },
  OfficeFormScreen: function OfficeFormScreen() {
    return null;
  },
  MapPinPickerScreen: function MapPinPickerScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/home', () => ({
  AttendanceHomeScreen: function AttendanceHomeScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/dashboard', () => ({
  AttendanceDashboardScreen: function AttendanceDashboardScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/monthly/AttendanceMonthlyScreen', () => ({
  __esModule: true,
  default: function AttendanceMonthlyScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/month-detail/AttendanceEmployeeMonthScreen', () => ({
  __esModule: true,
  default: function AttendanceEmployeeMonthScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/leave/OwnerLeaveScreen', () => ({
  __esModule: true,
  default: function OwnerLeaveScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/leave/ApplyOnBehalfScreen', () => ({
  __esModule: true,
  default: function ApplyOnBehalfScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/settings', () => ({
  SettingsScreen: function SettingsScreen() {
    return null;
  },
  WeeklyOffScreen: function WeeklyOffScreen() {
    return null;
  },
  HolidaysScreen: function HolidaysScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/setup', () => ({
  SetupWizardScreen: function SetupWizardScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/enrolments/RosterScreen', () => ({
  __esModule: true,
  default: function RosterScreen() {
    return null;
  },
}));
jest.mock('../features/attendance/enrolments/DatePickerScreen', () => ({
  __esModule: true,
  default: function DatePickerScreen() {
    return null;
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import RootNavigator from './RootNavigator';
import type { RootStackParamList } from './types';

describe('RootNavigator — the stacked Customers route', () => {
  beforeEach(() => {
    mockMounted.length = 0;
  });

  it('mounts the customers screen on navigate("Customers")', () => {
    const ref = createNavigationContainerRef<RootStackParamList>();
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = create(
        <NavigationContainer ref={ref}>
          <RootNavigator />
        </NavigationContainer>,
      );
    });
    expect(ref.isReady()).toBe(true);
    // Initial route is MainTabs (stubbed) — no customers screen mounted.
    expect(mockMounted).not.toContain('Customers');

    act(() => {
      ref.navigate('Customers');
    });

    expect(mockMounted).toContain('Customers');
    act(() => {
      r.unmount();
    });
  });
});
