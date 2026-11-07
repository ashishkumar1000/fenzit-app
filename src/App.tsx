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
// Firebase (spec CAP-1/3/4/5): the push bridge mounts beside RealtimeBridge
// in BOTH role branches; the 401 handler drops the token locally; the
// container's onReady flushes a cold-start push tap held before navigation
// existed.
import {
  FirebaseBridge,
  flushPendingPushTap,
  unregisterPush,
} from './features/push';
import {
  refreshRemoteConfig,
  runAllResets,
  setOnForbidden,
  setOnUnauthorized,
  storage,
} from './services';
import { logEvent } from './services/telemetry';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { checkMembershipAfterForbidden } from './features/auth/membershipCheck';
import { syncSessionFromServer } from './features/auth/sessionSync';
import { claimLaunchTap } from './features/push/pendingTapTarget';

const LEGACY_PENDING_DELETION_KEY = 'fenzit.push.pendingTokenDeletion';

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
  // A launch with no company access (signed out, removed, or staff) mounts no
  // FirebaseBridge, so nothing would consume the launch tap. Spend the one-shot
  // now, so a later sign-in in this process cannot replay it.
  useEffect(() => {
    if (!hasCompanyAccess(session)) claimLaunchTap();
  }, [session]);

  // Legacy slot from the removed pending-token-deletion queue. It held a
  // session bearer in plain text; no code reads it any more, so drop it.
  useEffect(() => {
    storage.remove(LEGACY_PENDING_DELETION_KEY);
  }, []);

  useEffect(() => {
    refreshRemoteConfig();
    // Firebase analytics (CAP-5): `app_open` once per cold start — this
    // effect runs exactly once per JS context.
    logEvent('app_open');
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
  // never for a login 401 (no token was attached). Firebase push (frozen
  // matrix "Forced logout"): the FCM token is deleted LOCALLY only — the
  // backend row stays (the next sign-in's registration rebinds it).
  useEffect(() => {
    setOnUnauthorized(() => {
      runAllResets();
      void unregisterPush({ notifyBackend: false });
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
          // Firebase analytics (CAP-5): the catalog `login` event — one per
          // successful sign-in completion.
          logEvent('login');
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
      <NavigationContainer ref={navigationRef} onReady={flushPendingPushTap}>
        <TechnicianRootNavigator />
        <RealtimeBridge />
        <FirebaseBridge />
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
      <NavigationContainer ref={navigationRef} onReady={flushPendingPushTap}>
        <RootNavigator />
        <RealtimeBridge />
        <FirebaseBridge />
      </NavigationContainer>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        {!updateRequired && <MaintenanceBanner text={config.maintenance_banner} />}

        {content}

        {splashVisible && (
          <AnimatedBootSplash onAnimationEnd={() => setSplashVisible(false)} />
        )}
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

export default App;
