const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * withSentryConfig adds the debug IDs that Sentry uses to match the
 * uploaded source maps to release builds. Wrap once only.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = withSentryConfig(
  mergeConfig(getDefaultConfig(__dirname), config),
);
