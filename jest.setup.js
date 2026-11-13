/**
 * Jest setup. Reanimated's worklets native module can't boot in jest —
 * swap in the library's own mock for every test that transitively imports it.
 *
 * Order matters: reanimated 4's own mock imports the real reanimated source,
 * which imports react-native-worklets — so worklets must be mocked too, or
 * its native module stub crashes on import (loadUnpackersWithCode).
 */
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// Reanimated's initializer calls setCSSEventHandler on import, but the JS
// implementation reanimated picks in jest throws on it. Noop the one method
// rather than pulling in react-native-web for the full web build.
jest.mock('react-native-reanimated/src/css/native/proxy', () => ({
  ...jest.requireActual('react-native-reanimated/src/css/native/proxy'),
  setCSSEventHandler: () => {},
}));

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// The contact picker is a native TurboModule (not linked under Jest). Default: the owner cancels.
jest.mock('react-native-pick-contact', () => ({ pickContact: jest.fn().mockResolvedValue(null) }));

// Reanimated 4's mock imports the real src, whose singleton constructor
// (reanimatedModuleInstance.native.ts) resolves the ReanimatedModule turbo
// spec via TurboModuleRegistry. In jest that resolution is not deterministic
// — in most runs it yields a truthy mock whose installTurboModule() is falsy,
// so the constructor installs reanimated's own DummyReanimatedModuleProxy and
// boots fine — but when the spec resolves falsy the constructor falls through
// to its "native part not initialized" throw and the suite dies at import.
// Mocking the spec here pins the safe path: installTurboModule() always
// returns falsy, the constructor always takes the dummy-proxy branch.
jest.mock('react-native-reanimated/src/specs', () => ({
  ReanimatedTurboModule: { installTurboModule: () => false },
}));

// The signature pad renders a real WebView (native TurboModule) — it cannot
// boot in jest. Every suite that transitively imports SignatureScreen gets a
// fake pad whose props/ref mirror the library's contract (onOK/onBegin/
// onEmpty, readSignature/clearSignature; clear routes to the onClear prop —
// the real library never fires onEmpty on clear); the pad's own suite mocks
// it too and drives the callbacks directly.
jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        readSignature: () => props.onOK?.('data:image/png;base64,MOCK'),
        clearSignature: () => props.onClear?.(),
      }));
      return null;
    }),
  };
});

// TrueSheet is a native TurboModule/Fabric component — it cannot boot in
// jest. The library ships its own mock (a plain View that records
// present/dismiss calls on the ref); route the real entry to it globally.
jest.mock('@lodev09/react-native-true-sheet', () =>
  require('@lodev09/react-native-true-sheet/mock'),
);

// The DS Sheet carries the system bottom inset in its pinned footer via
// useSafeAreaInsets — native inset measurement cannot run in jest. Use the
// library's own mock: real contexts preserved, native measurement replaced
// by zero insets (any SafeAreaProvider wrapper in a suite still wins).
// The mock module is ESM-transpiled — its real object sits behind `default`.
// The hooks are re-exposed as PLAIN functions, deliberately NOT the mock's
// own jest.fn wrappers: jest.resetAllMocks wipes every jest.fn
// implementation — the library mock's hooks included — so a suite that
// resets mocks and then renders a Sheet (any 19-4 dashboard or sheet-
// consumer suite) would read `undefined` insets and crash. Plain
// functions are untouched by the reset, and the context read stays live
// so a suite's own SafeAreaProvider still wins.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const mock = require('react-native-safe-area-context/src/jest/mock').default;
  const actual = jest.requireActual('react-native-safe-area-context');
  const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    ...mock,
    useSafeAreaInsets: () =>
      React.useContext(actual.SafeAreaInsetsContext) ?? ZERO_INSETS,
    useSafeAreaFrame: () =>
      React.useContext(actual.SafeAreaFrameContext) ??
      mock.initialWindowMetrics.frame,
  };
});

// react-native-nitro-geolocation boots NitroModules on import (a native
// TurboModule jest cannot load) — the `/compat` entry and the main entry
// (features/technicianApp/geolocation.ts imports both) crash every suite
// that transitively reaches App. Stub just the methods the app calls;
// suites needing to drive them override the mock locally.
jest.mock('react-native-nitro-geolocation/compat', () => ({
  __esModule: true,
  default: {
    requestAuthorization: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));

jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  requestPermission: jest.fn(async () => 'granted'),
  // Story 16-3/16-4 attendance modules import the main API's named
  // functions; incidental imports get inert stubs — suites that drive
  // capture/permission override these locally.
  getCurrentPosition: jest.fn(),
  checkPermission: jest.fn(async () => 'granted'),
  getAccuracyAuthorization: jest.fn(async () => 'full'),
  getProviderStatus: jest.fn(async () => ({
    locationServicesEnabled: true,
    backgroundModeEnabled: false,
  })),
  hasServicesEnabled: jest.fn(async () => true),
}));

// react-native-maps is a native Fabric component — it cannot boot in jest,
// and any suite that transitively imports the app tree (App.test) reaches
// the Story 15-4 map picker's `import MapView from 'react-native-maps'`,
// which dies at parse ("Cannot use import statement outside a module").
// Sub-components the app uses (Circle, Marker) render as plain Views; suites
// that need to drive the map override the mock locally.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockComponent = (props) => <View {...props} testID={props.testID} />;
  const MockMapView = React.forwardRef((props, _ref) => <View {...props} />);
  return {
    __esModule: true,
    default: MockMapView,
    Circle: MockComponent,
    Marker: MockComponent,
    Polyline: MockComponent,
    Polygon: MockComponent,
    Overlay: MockComponent,
    Callout: MockComponent,
  };
});

// react-native-device-info is a native TurboModule — jest cannot load it.
// The app only reads static build/device facts (version/build/model) for
// the X-App-* metadata headers and the remote-config gate; pin values that
// match the shipped defaults (v1.0.0) so no gate/banner triggers under
// default mocks. Suites that need a different story override locally.
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  getVersion: jest.fn(() => '1.0.0'),
  getBuildNumber: jest.fn(() => '1'),
  getModel: jest.fn(() => 'Pixel 6'),
}));

// The four @react-native-firebase packages (Firebase spec CAP-1/3/4/5) are
// native TurboModules with ESM builds — they cannot boot in jest, and every
// module that touches them (services/telemetry, features/push) must get an
// inert stub instead. The messaging stub resolves immediately (a registered
// token, no pending initial notification) and every subscription returns an
// unsubscribe fn, so FirebaseBridge's effects settle harmlessly; suites that
// need to drive taps/permission override these locally with jest.requireMock.
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
  initializeApp: jest.fn(),
  getDefaultAppConfig: jest.fn(),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2, EPHEMERAL: 3 },
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'mock-fcm-token'),
  deleteToken: jest.fn(async () => undefined),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(async () => null),
  setBackgroundMessageHandler: jest.fn(),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
  unregisterDeviceForRemoteMessages: jest.fn(async () => undefined),
  // The two permission fns are PLAIN async functions, deliberately NOT
  // jest.fn: suites that call jest.resetAllMocks (PermissionsPrimerScreen)
  // would wipe jest.fn implementations and flip every probe to denied,
  // re-asking granted permissions. Plain functions survive the reset and
  // keep the healthy "granted" default; suites needing another answer
  // override with jest.spyOn(require('...messaging'), 'hasPermission').
  hasPermission: async () => 1,
  requestPermission: async () => 1,
  isDeviceRegisteredForRemoteMessages: () => true,
}));

// Sentry ships ES modules that Jest cannot parse, so the SDK is stubbed here.
// This stub hides the init options from every test. Tests of the privacy
// settings in services/sentry.ts are still to be written.
jest.mock('@sentry/react-native', () => ({
  __esModule: true,
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  crash: jest.fn(),
  setUserId: jest.fn(async () => null),
  setAttribute: jest.fn(async () => null),
  setAttributes: jest.fn(async () => null),
  setCrashlyticsCollectionEnabled: jest.fn(async () => null),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(async () => undefined),
  setUserId: jest.fn(async () => undefined),
  setUserProperty: jest.fn(async () => undefined),
  setAnalyticsCollectionEnabled: jest.fn(async () => undefined),
}));

// Pin the test timezone: the screens format dates with toLocaleDateString
// ('en-IN', …) on UTC timestamps, which shifts a day in behind-UTC timezones
// — assertions like "12 Aug 2026" must not depend on the host TZ. IST is the
// product's home timezone, so it is the deterministic choice for tests.
// NOTE: this in-band pin alone is NOT sufficient — V8 caches the zone from
// process start, so on Linux CI the tests must run with TZ=Asia/Kolkata in
// the environment (the workflow's Tests step carries it).
process.env.TZ = 'Asia/Kolkata';

// RN 0.87's jest environment lacks the Fabric private API
// (getNativeTagFromPublicInstance): any delayed `useNativeDriver: true`
// animation that actually fires mid-test crashes findNodeHandle
// (RosterScreen on CI, EmployeesStep locally — timing-sensitive, so it
// passes on a fast machine and fails under load). Pin every core-Animated
// factory to JS-driven so nodes never go native in tests, and complete
// them instantly. No test asserts on native driving, mid-flight values,
// or destructures these factories at load time.
const { Animated } = require('react-native');
for (const factory of ['timing', 'spring', 'decay']) {
  const original = Animated[factory];
  Animated[factory] = (value, config) => {
    const animation = original(value, { ...config, useNativeDriver: false });
    // Complete instantly: apply the end value and report finished, instead
    // of driving RAF frames no test observes. Infinite shimmers would
    // otherwise keep jest's event loop alive to the 5s test timeout.
    animation.start = (cb) => {
      if (typeof config?.toValue === 'number') value.setValue(config.toValue);
      cb?.({ finished: true });
    };
    return animation;
  };
}
// Cap loops at one iteration unless the caller asked for a finite count —
// an instant-finishing child inside an infinite Animated.loop would
// restart forever.
const originalLoop = Animated.loop;
Animated.loop = (animation, config) =>
  originalLoop(animation, {
    ...config,
    iterations:
      config?.iterations && config.iterations > 0 ? config.iterations : 1,
  });

// Node 25+ ships a partial `window` global (ErrorEvent present,
// dispatchEvent missing). React 19's reportGlobalError checks
// `typeof window.ErrorEvent === 'function'`, takes the window branch, and
// crashes on the missing dispatchEvent — turning any uncaught React error
// into a process-level crash that MASKS the real error. Clearing
// ErrorEvent routes errors back through process.emit, so jest reports the
// actual failure like on older Node.
if (typeof window !== 'undefined' && typeof window.dispatchEvent !== 'function') {
  // @ts-expect-error jest.setup is plain JS
  window.ErrorEvent = undefined;
}
