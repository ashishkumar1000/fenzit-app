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
import App from './src/App';
import { name as appName } from './app.json';

setBackgroundMessageHandler(getMessaging(), async () => {});

AppRegistry.registerComponent(appName, () => App);
