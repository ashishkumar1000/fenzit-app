/**
 * TechnicianRootNavigator — the technician side's stack, wrapping
 * `TechnicianTabs` so full-screen routes can push over the tab group
 * (mirrors the owner side's `RootNavigator` around `MainTabs`).
 *
 * `TechJobDetail` is the job's one-screen view (Story 3.2); `Signature`
 * pushes over it for the customer-signature capture (Story 3.5).
 * `Notifications` is the shared inbox (Story 14-3) — same component as the
 * owner's, role-routed inside.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TechnicianTabs from './TechnicianTabs';
import TechJobDetailScreen from '../features/technicianApp/TechJobDetailScreen';
import MyJobsScreen from '../features/technicianApp/MyJobsScreen';
import TechNewJobScreen from '../features/technicianApp/TechNewJobScreen';
import SignatureScreen from '../features/technicianApp/SignatureScreen';
import { LocationCaptureScreen } from '../features/technicianApp/LocationCaptureScreen';
import { NotificationsScreen } from '../features/notifications';
import { AttendanceIntroScreen } from '../features/attendance/me';
import { AttendanceMyMonthScreen } from '../features/attendance/me';
import DatePickerScreen from '../features/attendance/enrolments/DatePickerScreen';
import LeaveApplyScreen from '../features/attendance/leave/LeaveApplyScreen';
import SelectSkillsScreen from '../features/newJob/SelectSkillsScreen';
import SelectCustomersScreen from '../features/newJob/SelectCustomersScreen';
import { AddCustomerScreen } from '../features/customers';
import { MapPinPickerScreen } from '../features/attendance/offices';
import type { TechnicianRootStackParamList } from './types';

const Stack = createNativeStackNavigator<TechnicianRootStackParamList>();

export default function TechnicianRootNavigator() {
  return (
    <Stack.Navigator initialRouteName="TechnicianTabs">
      <Stack.Screen name="TechnicianTabs" component={TechnicianTabs} options={{ headerShown: false }} />
      <Stack.Screen name="TechJobDetail" component={TechJobDetailScreen} options={{ headerShown: false }} />
      {/* Epic 22 — the employee's "My jobs" record (the Profile tab's entry card
          opens it) — keeps the Profile page uncluttered. */}
      <Stack.Screen name="TechMyJobs" component={MyJobsScreen} options={{ headerShown: false }} />
      {/* Epic 22 — the employee's create-job form (entry: the Jobs tab's
          "Add job" button, gated on the profile's canCreateJobs flag). */}
      <Stack.Screen name="TechNewJob" component={TechNewJobScreen} options={{ headerShown: false }} />
      {/* Epic 22 — the pickers' Browse-all browsers, dual-registered (the
          Notifications precedent); they pop back to `returnTo` ('TechNewJob'
          here). */}
      <Stack.Screen name="SelectSkills" component={SelectSkillsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectCustomers" component={SelectCustomersScreen} options={{ headerShown: false }} />
      {/* Epic 22 — the owner's full add-customer form, dual-registered so
          TechNewJob's "New customer" mode opens it; here it runs in draft
          mode (collect and return, never POST — employees lack
          `customer.write`). */}
      <Stack.Screen name="AddCustomer" component={AddCustomerScreen} options={{ headerShown: false }} />
      {/* Epic 22 — the shared map pin picker's second registration, so the
          technician-stack AddCustomer's location box can open it. */}
      <Stack.Screen name="MapPinPicker" component={MapPinPickerScreen} options={{ headerShown: false }} />
      {/* 3.5 — pushed over the detail for the customer-signature capture. */}
      <Stack.Screen name="Signature" component={SignatureScreen} options={{ headerShown: false }} />
      {/* 7.7 — pushed over the detail for location capture. */}
      <Stack.Screen name="LocationCapture" component={LocationCaptureScreen} options={{ headerShown: false }} />
      {/* 14.3 — the shared notification inbox, behind the Today bell. */}
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      {/* 15-10 — the FR-4 intro, pushed over the tabs by the Attendance tab's gate. */}
      <Stack.Screen name="AttendanceIntro" component={AttendanceIntroScreen} options={{ headerShown: false }} />
      {/* 17-5 — the leave-apply form, pushed from the Attendance tab's Leave section. */}
      <Stack.Screen name="LeaveApply" component={LeaveApplyScreen} options={{ headerShown: false }} />
      {/* 2026-10 — the technician's own "My month" full screen, pushed from
          the Attendance tab's My month banner (calendar + summary + legend). */}
      <Stack.Screen name="AttendanceMyMonth" component={AttendanceMyMonthScreen} options={{ headerShown: false }} />
      {/* 17-5 — the date picker's second registration (the owner stack has it
          since 15-9); the leave form's From/To rows push it on THIS stack. */}
      <Stack.Screen name="DatePicker" component={DatePickerScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
