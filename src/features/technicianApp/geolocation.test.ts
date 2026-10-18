/**
 * geolocation tests — the rethrow contract (location-services-off feature,
 * 2026-10-17): errors reach consumers as plain Errors with the SAME stable
 * messages as before the feature (byte-identical — useLocateMe and the
 * capture screens branch on that text), while the ORIGINAL native numeric
 * `.code` now rides along additively so deviceLocation.classifyCaptureFailure
 * can classify without string matching. Pins, per code:
 *
 *   1 → 'Location permission denied' + code 1
 *   2/4/5 → 'Location services unavailable' + the ORIGINAL code preserved
 *           (2/4/5 must stay distinct for the downstream services re-probe)
 *   3 → 'Location request timed out' + code 3
 *   codeless → 'Failed to get location: <message>' and NO code property
 *
 * Plus the capture ladder contract: only a TIMEOUT earns the second,
 * never-cached high-accuracy attempt (codes 1/2/4/5 fail fast after one
 * native call).
 */
jest.mock('react-native-nitro-geolocation', () => ({
  __esModule: true,
  requestPermission: jest.fn(async () => 'granted'),
  getCurrentPosition: jest.fn(),
}));

import { getCurrentPosition as nativeGetCurrentPosition } from 'react-native-nitro-geolocation';
import { getCurrentPosition } from './geolocation';

const nativeMock = nativeGetCurrentPosition as jest.Mock;

function withCode(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** A well-formed fix for the success path. */
const FIX = {
  coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 12 },
  provider: 'fused',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('the rethrow contract: stable messages + the native .code attached', () => {
  it('code 2 → "Location services unavailable" AND .code 2 preserved; fails fast (ONE native call)', async () => {
    nativeMock.mockRejectedValueOnce(withCode(2, 'position unavailable'));

    await expect(getCurrentPosition()).rejects.toMatchObject({
      message: 'Location services unavailable',
      code: 2,
    });
    expect(nativeMock).toHaveBeenCalledTimes(1);
  });

  it.each([4, 5])(
    'code %i keeps its OWN identity (same message, code NOT collapsed to 2)',
    async code => {
      nativeMock.mockRejectedValueOnce(withCode(code, 'device-level'));

      await expect(getCurrentPosition()).rejects.toMatchObject({
        message: 'Location services unavailable',
        code,
      });
      expect(nativeMock).toHaveBeenCalledTimes(1);
    },
  );

  it('code 1 → "Location permission denied" AND .code 1; fails fast', async () => {
    nativeMock.mockRejectedValueOnce(withCode(1, 'permission denied'));

    await expect(getCurrentPosition()).rejects.toMatchObject({
      message: 'Location permission denied',
      code: 1,
    });
    expect(nativeMock).toHaveBeenCalledTimes(1);
  });

  it('code 3 on BOTH attempts → "Location request timed out" AND .code 3 (the timeout is rethrown from the fallback)', async () => {
    nativeMock.mockRejectedValueOnce(withCode(3, 'balanced timed out'));
    nativeMock.mockRejectedValueOnce(withCode(3, 'high timed out'));

    await expect(getCurrentPosition()).rejects.toMatchObject({
      message: 'Location request timed out',
      code: 3,
    });
    expect(nativeMock).toHaveBeenCalledTimes(2);
  });

  it('a CODELESS error → "Failed to get location: <message>" with NO code property', async () => {
    nativeMock.mockRejectedValueOnce(new Error('gps exploded'));

    const err = await getCurrentPosition().catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Failed to get location: gps exploded');
    expect(err.code).toBeUndefined();
  });
});

describe('the capture ladder (unchanged behavior, now code-aware)', () => {
  it('a timeout on attempt 1 earns the strict fallback; its success resolves the fix', async () => {
    nativeMock
      .mockRejectedValueOnce(withCode(3, 'balanced timed out'))
      .mockResolvedValueOnce(FIX);

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 12,
    });

    const [fallbackOptions] = nativeMock.mock.calls[1] as [Record<string, unknown>];
    // The fallback is the never-cached high-accuracy strict request.
    expect(fallbackOptions).toMatchObject({
      accuracy: { android: 'high' },
      maximumAge: 0,
    });
  });

  it('a healthy first attempt never attempts the fallback', async () => {
    nativeMock.mockResolvedValueOnce(FIX);

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 12,
    });
    expect(nativeMock).toHaveBeenCalledTimes(1);
  });

  it('missing coordinates in a resolved fix still throws (the guard, unchanged)', async () => {
    nativeMock.mockResolvedValueOnce({
      coords: { latitude: undefined, longitude: 77.5946, accuracy: 12 },
    });

    await expect(getCurrentPosition()).rejects.toThrow(
      'Invalid location data: missing coordinates',
    );
  });
});
