/**
 * PermissionsPrimerScreen — the pre-permission pattern (login redesign):
 * the screen explains, each row shows the LIVE OS state, and Continue fires
 * the real OS prompts ONE after another for whatever is still denied — a
 * denial never blocks the way, and a granted permission is never re-asked.
 *
 * Tester stance: hunt the states, not the happy path — granted, denied,
 * permanently denied (Android "don't ask again" → Settings), the iOS camera
 * blind spot (JS cannot read it, so it must NOT be asked here), and the
 * button locking itself while the asks are in flight.
 */
import React from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { checkPermission, requestPermission } from 'react-native-nitro-geolocation';
import PermissionsPrimerScreen from './PermissionsPrimerScreen';
import { Button } from '../../components/ui';
import { Text } from 'react-native';

const mockCheckPermission = checkPermission as jest.Mock;
const mockRequestPermission = requestPermission as jest.Mock;
const mockOpenSettings = Linking.openSettings as jest.Mock;

/** Platform.OS is consumed at call time — flipping it per test keeps one
 *  import graph. Saved/restored so the suite never leaks an OS. */
const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

let fineCheckSpy: jest.SpyInstance;
let requestSpy: jest.SpyInstance;

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

/** Mounts and flushes the mount-time OS probe. */
async function render(role: 'employee' | 'company_admin' = 'employee', notice?: string | null) {
  const onContinue = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <PermissionsPrimerScreen role={role} notice={notice} onContinue={onContinue} />,
    );
  });
  mounted.push(r);
  return { r, onContinue };
}

function continueBtn(r: ReactTestRenderer.ReactTestRenderer) {
  const btn = r.root.findAllByType(Button).find(
    b => b.props.children === 'Continue' || b.props.children === 'Please wait…',
  );
  if (!btn) throw new Error('Continue button not found');
  return btn;
}

/** One node per pill — Pressable mirrors its props onto host Views, so keep
 *  only the instance that actually carries the handler. */
const allowPill = (r: ReactTestRenderer.ReactTestRenderer, title: string) =>
  r.root
    .findAllByProps({ accessibilityLabel: `Allow ${title}` })
    .filter(n => typeof n.props.onPress === 'function');

function texts(r: ReactTestRenderer.ReactTestRenderer): string[] {
  return r.root.findAll((n: ReactTestInstance) => n.type === Text).map(n => String(n.props.children));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  useOs('android');
  // Healthy Android default: both permissions already granted — the common
  // reinstall-on-a-bent-device case; no pill, no re-ask.
  fineCheckSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  requestSpy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  mockOpenSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  while (mounted.length) {
    const r = mounted.pop()!;
    act(() => r.unmount());
  }
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
});

describe('the live rows', () => {
  it('a granted permission shows no Allow pill', async () => {
    const { r } = await render();

    expect(allowPill(r, 'Location')).toHaveLength(0);
    expect(allowPill(r, 'Camera')).toHaveLength(0);
  });

  it('a denied permission offers its Allow pill', async () => {
    // Deny location ONLY — the spy must answer per-permission, exactly like
    // the OS would.
    fineCheckSpy.mockImplementation(async perm =>
      perm === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION ? false : true,
    );

    const { r } = await render();

    expect(allowPill(r, 'Location')).toHaveLength(1);
    expect(allowPill(r, 'Camera')).toHaveLength(0); // still granted
  });

  it('the row pill requests exactly that one permission', async () => {
    fineCheckSpy.mockResolvedValue(false);

    const { r } = await render();
    act(() => {
      allowPill(r, 'Camera')[0].props.onPress();
    });
    await act(async () => {});

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe(PermissionsAndroid.PERMISSIONS.CAMERA);
  });
});

describe('Continue asks one by one', () => {
  it('location first, camera only after location settles — and a denial never blocks', async () => {
    fineCheckSpy.mockResolvedValue(false);
    const locationGate = deferred<string>();
    const cameraGate = deferred<string>();
    requestSpy
      .mockImplementationOnce(() => locationGate.promise)
      .mockImplementationOnce(() => cameraGate.promise);

    const { r, onContinue } = await render();
    let running!: Promise<void>;
    act(() => {
      running = continueBtn(r).props.onPress();
    });

    // Camera must WAIT for the location answer — never two prompts at once.
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

    act(() => {
      locationGate.resolve(PermissionsAndroid.RESULTS.GRANTED);
    });
    await act(async () => {});
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.calls[1][0]).toBe(PermissionsAndroid.PERMISSIONS.CAMERA);

    act(() => {
      cameraGate.resolve(PermissionsAndroid.RESULTS.DENIED);
    });
    await act(async () => {
      await running;
    });

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('already-granted permissions are never re-asked — Continue goes straight through', async () => {
    const { r, onContinue } = await render();

    await act(async () => {
      continueBtn(r).props.onPress();
    });

    expect(requestSpy).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('a permanent "don\u2019t ask again" opens Settings — and still finishes', async () => {
    fineCheckSpy.mockImplementation(async perm =>
      perm === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION ? false : true,
    );
    requestSpy.mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

    const { r, onContinue } = await render();

    await act(async () => {
      continueBtn(r).props.onPress();
    });

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(1); // camera granted → not asked
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('the button locks itself while the asks are in flight', async () => {
    fineCheckSpy.mockResolvedValue(false);
    const gate = deferred<string>();
    requestSpy.mockImplementation(() => gate.promise);

    const { r, onContinue } = await render();
    act(() => {
      continueBtn(r).props.onPress();
    });

    expect(continueBtn(r).props.disabled).toBe(true);
    expect(continueBtn(r).props.children).toBe('Please wait…');

    act(() => {
      gate.resolve(PermissionsAndroid.RESULTS.DENIED);
    });
    await act(async () => {});

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(continueBtn(r).props.disabled).toBe(false);
  });
});

describe('iOS', () => {
  it('a denied location is asked on Continue; a still-denied answer opens Settings', async () => {
    useOs('ios');
    mockCheckPermission.mockResolvedValue('denied');
    mockRequestPermission.mockResolvedValue('denied');

    const { r, onContinue } = await render();

    await act(async () => {
      continueBtn(r).props.onPress();
    });

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('the camera is the blind spot — never asked from this screen on iOS', async () => {
    useOs('ios');
    mockCheckPermission.mockResolvedValue('granted');

    const { r, onContinue } = await render();

    await act(async () => {
      continueBtn(r).props.onPress();
    });

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(allowPill(r, 'Camera')).toHaveLength(0); // 'unknown' keeps the check, not a pill
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('the mismatch correction (review fix)', () => {
  const NOTICE = 'This number is registered as a field employee \u2014 here\u2019s the employee app.';

  it('a provided notice renders above the title; none by default', async () => {
    const bare = await render('employee');
    expect(bare.r.root.findAllByProps({ children: NOTICE })).toHaveLength(0);

    // RN Text mirrors its children onto a host node — presence is the assert.
    const corrected = await render('employee', NOTICE);
    expect(corrected.r.root.findAllByProps({ children: NOTICE }).length).toBeGreaterThanOrEqual(1);
  });
});

describe('the copy speaks to whoever is reading', () => {
  it('an employee reads the personal title, an owner the team one', async () => {
    const staff = await render('employee');
    const owner = await render('company_admin');

    expect(texts(staff.r)).toContain('Permissions that protect you');
    expect(texts(owner.r)).toContain('Permissions that protect your team');
  });

  it('the footnote tells the person exactly what Continue will do', async () => {
    const { r } = await render();

    expect(texts(r)).toContain(
      'Tap Continue. When the phone asks, tap Allow. You can change this later in settings.',
    );
  });
});
