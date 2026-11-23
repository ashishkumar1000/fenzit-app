/**
 * @format
 */

// Sentry must be the first import so it starts before the app loads and can
// catch startup errors. Do not move it below the App import.
import './src/services/sentry';
import { AppRegistry } from 'react-native';
// Firebase push (CAP-3): the background handler MUST be registered before
// AppRegistry — a data-less hybrid message arriving while the app is quit
// runs this headless callback in a 60s JS context with no UI. Hybrid
// (notification + data) messages are displayed by the OS itself, so the
// handler is a deliberate no-op; it exists so the SDK has the seam and the
// message is acknowledged instead of dropped on the floor.
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
// Pin the geolocation authorization level at startup, before any UI can
// call requestPermission(): with BOTH location keys present in Info.plist
// (the Always key exists only to satisfy Apple's ITMS-90683 binary scan —
// see Info.plist), nitro-geolocation auto-detects '.always' and bare
// requestPermission() calls would prompt for All-the-Time location. This
// app is foreground-only punch-in; pin it to whenInUse.
import { setConfiguration } from 'react-native-nitro-geolocation';
import App from './src/App';
import { name as appName } from './app.json';

setBackgroundMessageHandler(getMessaging(), async () => {});

// Runs before registerComponent — no screen exists yet to request permission.
setConfiguration({ authorizationLevel: 'whenInUse' });

AppRegistry.registerComponent(appName, () => App);
