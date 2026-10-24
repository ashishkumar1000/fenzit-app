/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  AppState,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AnimatedBootSplash } from './features/splash';
import RootNavigator from './navigation/RootNavigator';
import TechnicianRootNavigator from './navigation/TechnicianRootNavigator';
import { navigationRef } from './navigation/navigationRef';
import {
  WelcomeFlow,
  FirstRunFlow,
  mismatchNotice,
  useOnboarding,
} from './features/onboarding';
import {
  AuthFlow,
  NoAccessScreen,
  hasCompanyAccess,
  isEmployeeRole,
  useAuth,
  expireSession,
  revokeCompanyAccess,
} from './features/auth';
import {
  ForcedUpdateScreen,
  MaintenanceBanner,
  isVersionUnsupported,
  useRemoteConfig,
} from './features/remoteConfig';
import { RealtimeBridge } from './features/notifications/RealtimeBridge';
import {
  refreshRemoteConfig,
  runAllResets,
  setOnForbidden,
  setOnUnauthorized,
} from './services';
import { checkMembershipAfterForbidden } from './features/auth/membershipCheck';
import { syncSessionFromServer } from './features/auth/sessionSync';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [splashVisible, setSplashVisible] = useState(true);
  const { welcomeDone, intent, firstRunDone, completeWelcome, completeFirstRun } =
    useOnboarding();
  const { status: authStatus, session, complete: completeAuth } = useAuth();
  const config = useRemoteConfig();
  const updateRequired = isVersionUnsupported(config.min_supported_version);

  // Server-driven config (SPEC-server-driven-config): pull on start and on
  // every foreground return (throttled inside the service — a cold start
  // always fetches). The gate/banner below re-render through the
  // useRemoteConfig change subscription, never via this effect.
  useEffect(() => {
    refreshRemoteConfig();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshRemoteConfig();
      }
    });
    return () => subscription.remove();
  }, []);

  // Global 401 handling (story 5.3): any authenticated request that comes
  // back 401 forces the user back to the login screen. Data stores reset
  // FIRST, then the auth gate flips — screens unmount into a clean world,
  // and the login screen shows the "Session expired" notice. The interceptor
  // in apiClient fires this at most once per expiry event (deduped), and
  // never for a login 401 (no token was attached).
  useEffect(() => {
    setOnUnauthorized(() => {
      runAllResets();
      expireSession();
    });
    return () => setOnUnauthorized(null);
  }, []);

  // A 403 can mean the person was removed mid-session. The check re-reads the
  // profile first, so an ordinary permission refusal does not log anyone out.
  useEffect(() => {
    setOnForbidden(() => {
      void checkMembershipAfterForbidden(() => {
        runAllResets();
        revokeCompanyAccess();
      });
    });
    return () => setOnForbidden(null);
  }, []);

  // Access can change while the app is closed or in the background (removed,
  // re-added, role changed). Re-read it on sign-in, on launch and on every
  // return to the foreground, so the screens follow the server.
  useEffect(() => {
    if (authStatus !== 'done') return;
    void syncSessionFromServer();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncSessionFromServer();
      }
    });
    return () => subscription.remove();
  }, [authStatus]);

  // First launch: welcome + intent (pre-login) → account setup → first-run
  // tour & primer (post-login, keyed by the REAL role) → main app. The
  // force-update gate dominates the whole chain — an app older than the
  // server's minimum must not reach login or data, whatever its state.
  let content;
  if (updateRequired) {
    content = <ForcedUpdateScreen message={config.force_update_message} />;
  } else if (!welcomeDone) {
    content = <WelcomeFlow onDone={completeWelcome} />;
  } else if (authStatus !== 'done') {
    content = (
      <AuthFlow
        intent={intent}
        onComplete={result => {
          // Gating fields only — name/phone/company come from `GET /users/me`
          // via `useMyProfile`, so there's one authoritative copy of them.
          completeAuth({
            role: result.role,
            tenantId: result.tenantId,
            platformAdmin: result.platformAdmin,
          });
        }}
      />
    );
  } else if (!hasCompanyAccess(session)) {
    // No company (removed person, half-set-up account) or Fenzit staff: one
    // plain message and a Log out button — no navigation tree, no data
    // stores, no Realtime bridge. (A brand-new person with no company never
    // gets here: AuthFlow sends them to company setup — or, with a staff
    // intent, to the "get invited" help screen — instead.)
    content = <NoAccessScreen platformAdmin={session?.platformAdmin ?? false} />;
  } else if (!firstRunDone) {
    // Role tour + permissions primer, once per install. The slide set and
    // primer copy follow the session's REAL role; `notice` is the one-line
    // correction when the picked intent differs from it.
    content = (
      <FirstRunFlow
        role={session?.role ?? null}
        notice={mismatchNotice(intent, session?.role ?? null)}
        onDone={completeFirstRun}
      />
    );
  } else if (isEmployeeRole(session?.role)) {
    // Separate nav tree from the admin side — an employee never needs
    // MainTabs' Jobs/Attendance/More routes or RootNavigator's Technicians stack.
    // Story 14-3: the employee branch mounts the same RealtimeBridge —
    // one bridge for every role (the hook routes per role inside; the
    // employee's socket listens on their own topic only).
    content = (
      <NavigationContainer ref={navigationRef}>
        <TechnicianRootNavigator />
        <RealtimeBridge />
      </NavigationContainer>
    );
  } else {
    // Company admin or viewer session (the viewer sees the same screens with
    // every write control hidden — see `useCanWrite`). RealtimeBridge mounts
    // the Realtime hook + banner here (Story 3.3; the employee branch mounts
    // it too since Story 14-3) —
    // NEVER at App() top level: the role gate is a conditional render chain,
    // so a top-level hook would run Realtime code for unsigned users too.
    // The bridge re-checks the session internally as well.
    content = (
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
        <RealtimeBridge />
      </NavigationContainer>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {!updateRequired && <MaintenanceBanner text={config.maintenance_banner} />}

      {content}

      {splashVisible && (
        <AnimatedBootSplash onAnimationEnd={() => setSplashVisible(false)} />
      )}
    </SafeAreaProvider>
  );
}

export default App;
