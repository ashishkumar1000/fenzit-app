/**
 * TechnicianTabs — the technician's bottom-tab group: Today, Jobs, Profile.
 * The Jobs route (labelled "Jobs" since Epic 22; the route NAME stays
 * `History` — internal identifiers don't ride copy changes) shows every job
 * type the employee owns. Deliberately separate from the owner's `MainTabs`
 * (different routes entirely) rather than a variant of it — a technician
 * never sees Customers, or More/Settings.
 *
 * Mounted inside `TechnicianRootNavigator` (App.tsx's native stack) as the
 * tabs screen, the same way the owner side's `MainTabs` sits inside
 * `RootNavigator` — full-screen routes (`TechJobDetail`, and later
 * `Signature`) push over the tabs from that stack.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useRoute, type RouteProp, type ParamListBase } from '@react-navigation/native';
import { TodayScreen, TechJobsScreen, ProfileScreen } from '../features/technicianApp';
import {
  AttendanceTabScreen,
  useAttendanceAccess,
  useAttendanceAccessLifecycle,
} from '../features/attendance/me';
import { TabBar } from './TabBar';
import type { TechnicianTabParamList } from './types';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

export default function TechnicianTabs() {
  // 15-10 — the access store's boot (initial me/access fetch + notification
  // seam) and the foreground refetch live here: this component is mounted
  // for every technician session regardless of tab visibility, so a `none`
  // user's store still resolves (and stays resolved across tab flips).
  useAttendanceAccessLifecycle();
  // FR-3: the Attendance tab EXISTS only for a resolved non-`none` access
  // state (upcoming / active / history_only). `unknown` and `none` keep the
  // three-tab layout — an untracked technician sees no attendance UI
  // anywhere, and no attendance screen can flash for them while the first
  // read is in flight. The store is also the notifications screen's tap
  // guard source (via the attendanceAccessEvents seam), so a deep link can
  // never navigate to a tab that was never registered here.
  const { status, access } = useAttendanceAccess();
  const attendanceVisible =
    status === 'ready' && access !== null && access.attendanceAccess !== 'none';

  // A PUSHED instance (the My-jobs tiles' tap-through, 2026-11-13) mounts
  // with the target tab as its INITIAL route — otherwise hardware back on a
  // non-initial tab switches to Today first and only a second back pops the
  // stack (user report: back from the Rejected list reached Home first).
  // The bottom instance never carries `initialTab`, so its behaviour is
  // unchanged.
  const route = useRoute<RouteProp<ParamListBase>>();
  const initialTab = (
    route.params as { initialTab?: keyof TechnicianTabParamList } | undefined
  )?.initialTab;

  return (
    <Tab.Navigator
      tabBar={props => <TabBar {...props} />}
      initialRouteName={initialTab}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: 'Today' }} />
      <Tab.Screen
        name="History"
        component={TechJobsScreen}
        options={{ tabBarLabel: 'Jobs' }}
      />
      {attendanceVisible && (
        <Tab.Screen
          name="Attendance"
          component={AttendanceTabScreen}
          options={{ tabBarLabel: 'Attendance' }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
