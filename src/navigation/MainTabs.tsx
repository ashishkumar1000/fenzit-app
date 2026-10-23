/**
 * MainTabs — the bottom-tab group: Home, Jobs, Attendance, Account.
 * Nested under the root stack so full-screen routes (e.g. Technicians) can
 * still push on top of the whole tab group. Customers is no longer a tab —
 * the Account tab's row pushes it as a stacked root-stack route; Attendance
 * took the slot (2026-10 footer restructure).
 *
 * The last route is still named `More` internally (the param-list key and
 * TabBar's icon lookup use it); only its label reads "Account", matching the
 * screen it opens.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import { JobsScreen } from '../features/jobs';
import { AttendanceTabHomeScreen } from '../features/attendance/home';
import { MoreScreen } from '../features/more';
import { TabBar } from './TabBar';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Jobs" component={JobsScreen} options={{ tabBarLabel: 'Jobs' }} />
      <Tab.Screen
        name="Attendance"
        component={AttendanceTabHomeScreen}
        options={{ tabBarLabel: 'Attendance' }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarLabel: 'Account' }} />
    </Tab.Navigator>
  );
}
