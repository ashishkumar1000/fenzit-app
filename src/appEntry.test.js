/**
 * Guards the startup contracts of index.js (repo root) that everything else
 * depends on but no other suite executes:
 *
 *  1. The geolocation authorization pin (ITMS-90683 fix, 1.4.8): with BOTH
 *     location keys in Info.plist, react-native-nitro-geolocation
 *     auto-detects '.always' for bare requestPermission() calls — so the
 *     entry MUST pin authorizationLevel to 'whenInUse'. If this fails, fresh
 *     installs get the All-the-Time location prompt: the exact App Review
 *     5.1.1 bait the pin exists to prevent.
 *  2. The Firebase background-message handler (CAP-3) is registered before
 *     AppRegistry mounts the app, so quit-state hybrid pushes are acked
 *     instead of dropped.
 *
 * Both are ordering contracts: the call must land BEFORE
 * AppRegistry.registerComponent, when no screen exists to request anything.
 * The entry is required inside beforeAll — AFTER the registerComponent spy
 * is installed (a top-level import would hoist above it and record nothing).
 */
jest.mock('../src/services/sentry', () => ({}));
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  getMessaging: jest.fn(() => ({})),
  setBackgroundMessageHandler: jest.fn(),
}));
jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  setConfiguration: jest.fn(),
}));
jest.mock('../src/App', () => ({ __esModule: true, default: () => null }));

import { AppRegistry } from 'react-native';
import { setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { setConfiguration } from 'react-native-nitro-geolocation';

describe('index.js startup contracts', () => {
  let registerSpy;

  beforeAll(() => {
    registerSpy = jest
      .spyOn(AppRegistry, 'registerComponent')
      .mockImplementation(() => undefined);
    // Runs the entry's startup statements against the mocks above, once.
    require('../index');
  });

  it('pins the geolocation level to whenInUse before the app registers', () => {
    expect(setConfiguration).toHaveBeenCalledTimes(1);
    expect(setConfiguration).toHaveBeenCalledWith({ authorizationLevel: 'whenInUse' });
    expect(setConfiguration.mock.invocationCallOrder[0]).toBeLessThan(
      registerSpy.mock.invocationCallOrder[0],
    );
  });

  it('registers the Firebase background message handler before the app registers', () => {
    expect(setBackgroundMessageHandler).toHaveBeenCalledTimes(1);
    expect(setBackgroundMessageHandler.mock.invocationCallOrder[0]).toBeLessThan(
      registerSpy.mock.invocationCallOrder[0],
    );
  });
});
