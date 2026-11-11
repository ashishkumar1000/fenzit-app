/**
 * Tests for usePunchPrescreen's PULL model (2026-11-10 simplification):
 * a snapshot capture runs on tab focus and on foreground return — never
 * while unfocused, never when attendance access is off, never concurrently.
 * Failures are silent (the card keeps its last verdict), the adopted
 * press-fix lands immediately, and capturedAt back-dates to the FIX (the
 * capture's latency is not gifted to the age).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services/location/attendanceLocation', () => ({
  captureAttendanceLocation: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { captureAttendanceLocation } from '../../../services/location/attendanceLocation';
import { usePunchPrescreen } from './usePunchPrescreen';

const captureMock = captureAttendanceLocation as unknown as jest.Mock;
const useFocusEffectMock = useFocusEffect as unknown as jest.Mock;

let probe: ReturnType<typeof usePunchPrescreen>;
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
function Probe({ enabled }: { enabled: boolean }) {
  probe = usePunchPrescreen({ enabled });
  return null;
}
function renderProbe(enabled = true) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe enabled={enabled} />);
  });
  renderers.push(renderer);
  return renderer;
}
/** The focus effect's body + its cleanup, from the latest render. */
function focusPair(): { run: () => void; cleanup: () => void } {
  const effect = useFocusEffectMock.mock.calls.at(-1)?.[0] as
    | (() => () => void)
    | undefined;
  if (!effect) throw new Error('useFocusEffect never received an effect');
  const cleanup = effect();
  return { run: effect, cleanup };
}
function appStateEvent(): (state: string) => void {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls;
  return calls.at(-1)?.[1];
}
async function flush(times = 4) {
  // Inside act: the capture's setFix must land in the act scope or the
  // test renderer never processes the re-render.
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }) as never);
});

afterEach(() => {
  renderers.forEach((r) => r.unmount());
  renderers.length = 0;
});

describe('the pull model — capture on focus and foreground return only', () => {
  it('a focus probe captures and adopts the fix, capturedAt back-dated to the FIX', async () => {
    captureMock.mockResolvedValue({ latitude: 12.97, longitude: 77.73, fixAgeMs: 1200 });
    renderProbe();
    act(() => focusPair().run());
    await flush();
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(probe.fix).toMatchObject({ latitude: 12.97, longitude: 77.73 });
    // Back-dated: strictly before now, and roughly the fix's own age old.
    const at = probe.fix!.capturedAt;
    expect(at).toBeLessThan(Date.now());
    expect(Date.now() - at).toBeGreaterThanOrEqual(1200);
    expect(Date.now() - at).toBeLessThan(1200 + 5000);
  });

  it('an unfocused tab captures NOTHING — the foreground event is gated by focus too', async () => {
    renderProbe();
    act(() => appStateEvent()('active'));
    await flush();
    expect(captureMock).not.toHaveBeenCalled();
    expect(probe.fix).toBeNull();
  });

  it('a foreground return re-probes while focused (the Settings round-trip lands here)', async () => {
    captureMock.mockResolvedValue({ latitude: 12.97, longitude: 77.73, fixAgeMs: 0 });
    renderProbe();
    act(() => focusPair().run());
    await flush();
    expect(captureMock).toHaveBeenCalledTimes(1);
    act(() => appStateEvent()('active'));
    await flush();
    expect(captureMock).toHaveBeenCalledTimes(2);
  });

  it('after blur the tab is mute — no foreground capture, and a late capture cannot adopt', async () => {
    captureMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20))
        .then(() => ({ latitude: 1, longitude: 2, fixAgeMs: 0 })),
    );
    renderProbe();
    const pair = focusPair();
    act(() => pair.run());
    act(() => pair.cleanup());
    await flush(8);
    expect(captureMock).toHaveBeenCalledTimes(1); // the focus probe fired…
    expect(probe.fix).toBeNull(); // …but its adoption was refused post-blur
  });

  it('no attendance access ⇒ zero location work, even focused', async () => {
    renderProbe(false);
    act(() => focusPair().run());
    act(() => appStateEvent()('active'));
    await flush();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('a failed capture is SILENT — the card keeps its last verdict, nothing throws', async () => {
    captureMock.mockRejectedValue(new Error('timeout'));
    renderProbe();
    act(() => focusPair().run());
    await flush();
    expect(probe.fix).toBeNull();
  });

  it('recapture() re-probes, and a capture still in flight is never doubled', async () => {
    captureMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ latitude: 1, longitude: 2, fixAgeMs: 0 }), 10)),
    );
    renderProbe();
    act(() => focusPair().run());
    probe.recapture();
    probe.recapture();
    await flush(10);
    expect(captureMock).toHaveBeenCalledTimes(1); // in-flight guard held
  });

  it('adoptFix lands the press\'s fix immediately (the freshest fix the device ever held)', () => {
    renderProbe();
    const before = Date.now();
    act(() => probe.adoptFix({ latitude: 3, longitude: 4 }));
    expect(probe.fix).toMatchObject({ latitude: 3, longitude: 4 });
    expect(probe.fix!.capturedAt).toBeGreaterThanOrEqual(before);
  });

  it('adoptFix refuses for an attendance-disabled employee', () => {
    renderProbe(false);
    act(() => probe.adoptFix({ latitude: 3, longitude: 4 }));
    expect(probe.fix).toBeNull();
  });
});
