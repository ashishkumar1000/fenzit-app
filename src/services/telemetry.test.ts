/**
 * services/telemetry.ts — what leaves the device for Analytics and Crashlytics.
 * The privacy contract: a role may be sent, a user identifier never is.
 * The Firebase SDKs are inert jest stubs (jest.setup.js); these tests read
 * the calls made on them.
 */
import * as analytics from '@react-native-firebase/analytics';
import * as crashlytics from '@react-native-firebase/crashlytics';
import {
  clearTelemetryRole,
  logEvent,
  recordCrash,
  setTelemetryRole,
} from './telemetry';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('user identity is never sent', () => {
  it('setTelemetryRole sends only the role — no setUserId on Analytics or Crashlytics', () => {
    setTelemetryRole('employee');

    expect(analytics.setUserId).not.toHaveBeenCalled();
    expect(crashlytics.setUserId).not.toHaveBeenCalled();
    expect(analytics.setUserProperty).toHaveBeenCalledWith(expect.anything(), 'role', 'employee');
    expect(crashlytics.setAttribute).toHaveBeenCalledWith(expect.anything(), 'role', 'employee');
  });

  it('clearing the role (logout) also never touches a user id', () => {
    clearTelemetryRole();

    expect(analytics.setUserId).not.toHaveBeenCalled();
    expect(crashlytics.setUserId).not.toHaveBeenCalled();
  });
});

describe('role stamping', () => {
  it('a null role is sent as "unknown", so logout never leaves a stale role behind', () => {
    setTelemetryRole(null);

    expect(analytics.setUserProperty).toHaveBeenCalledWith(expect.anything(), 'role', 'unknown');
    expect(crashlytics.setAttribute).toHaveBeenCalledWith(expect.anything(), 'role', 'unknown');
  });

  it('clearTelemetryRole replaces the previous role with "unknown"', () => {
    setTelemetryRole('company_admin');
    jest.clearAllMocks();

    clearTelemetryRole();

    expect(analytics.setUserProperty).toHaveBeenLastCalledWith(expect.anything(), 'role', 'unknown');
    expect(crashlytics.setAttribute).toHaveBeenLastCalledWith(expect.anything(), 'role', 'unknown');
  });
});

describe('event params', () => {
  it('drops null, undefined and non-finite numbers, and keeps the good ones', () => {
    logEvent('job_step_completed', {
      step: 'on_my_way',
      missing: undefined as unknown as string,
      nothing: null as unknown as string,
      broken: Number.NaN,
      count: 3,
      empty: '',
    });

    expect(analytics.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      'job_step_completed',
      { step: 'on_my_way', count: 3 },
    );
  });

  it('truncates long string values to the 100-character Analytics limit', () => {
    logEvent('notification_tap', { type: 'x'.repeat(250) });

    const sent = (analytics.logEvent as jest.Mock).mock.calls[0][2] as Record<string, string>;
    expect(sent.type).toHaveLength(100);
  });

  it('caps the event name at 40 characters', () => {
    logEvent('e'.repeat(60));

    expect((analytics.logEvent as jest.Mock).mock.calls[0][1]).toHaveLength(40);
  });

  it('sends the event with no params when every param is dropped', () => {
    logEvent('app_open', { gone: null as unknown as string });

    expect(analytics.logEvent).toHaveBeenCalledWith(expect.anything(), 'app_open', undefined);
  });
});

describe('failures never reach the caller', () => {
  it('a rejected Analytics call is swallowed (log-only)', async () => {
    (analytics.logEvent as jest.Mock).mockRejectedValueOnce(new Error('native down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => logEvent('app_open')).not.toThrow();
    await new Promise(resolve => setImmediate(resolve));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a synchronous throw from the role stamp is swallowed', () => {
    (analytics.setUserProperty as jest.Mock).mockImplementationOnce(() => {
      throw new Error('module missing');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => setTelemetryRole('viewer')).not.toThrow();
    warn.mockRestore();
  });
});

describe('recordCrash', () => {
  it('reports the caught error to Crashlytics exactly once', () => {
    const error = new Error('render failed');

    recordCrash(error);

    expect(crashlytics.recordError).toHaveBeenCalledTimes(1);
    expect(crashlytics.recordError).toHaveBeenCalledWith(expect.anything(), error);
  });
});
