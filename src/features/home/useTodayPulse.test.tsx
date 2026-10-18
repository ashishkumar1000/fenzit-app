/**
 * useTodayPulse — the Home Pulse card's data hook: no call unless attendance
 * is enabled, latest answer wins, a refetch blip keeps the last-good numbers,
 * a first-load failure is `error`, and turning attendance off drops old data.
 */
jest.mock('../../services', () => ({ fetchDashboard: jest.fn() }));
// Focus = mount + an explicit `refocus()` from the test (the real navigator re-fires on every refocus).
let latestFocus: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      latestFocus = cb;
      React.useEffect(cb, [cb]);
    },
  };
});
const refocus = () =>
  act(() => {
    latestFocus?.();
  });

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { fetchDashboard } from '../../services';
import { useTodayPulse, type TodayPulse } from './useTodayPulse';

const fetchMock = fetchDashboard as jest.Mock;
const COUNTS = { tracked: 10, present: 6, late: 1, onLeave: 1, notIn: 2 };
const data = (date: string) => ({ date, counts: COUNTS });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mount(initialEnabled: boolean) {
  const out = { current: undefined as unknown as TodayPulse };
  function Probe({ enabled }: { enabled: boolean }) {
    out.current = useTodayPulse(enabled);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(Probe, { enabled: initialEnabled }));
  });
  return {
    out,
    setEnabled: (enabled: boolean) =>
      act(() => {
        tree.update(createElement(Probe, { enabled }));
      }),
  };
}

beforeEach(() => fetchMock.mockReset());

describe('useTodayPulse', () => {
  it('never calls the server while attendance is disabled', () => {
    const { out } = mount(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.current.status).toBe('loading');
  });

  it('is loading, then ready with the date and counts', async () => {
    fetchMock.mockResolvedValue(data('2026-10-18'));
    const { out } = mount(true);
    expect(out.current.status).toBe('loading');
    await act(async () => {});
    expect(out.current).toEqual({ status: 'ready', date: '2026-10-18', counts: COUNTS });
  });

  it('a failure with nothing on screen is "error"', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { out } = mount(true);
    await act(async () => {});
    expect(out.current.status).toBe('error');
  });

  it('a later failure keeps the last-good numbers', async () => {
    fetchMock.mockResolvedValueOnce(data('2026-10-18'));
    const { out } = mount(true);
    await act(async () => {});
    fetchMock.mockRejectedValueOnce(new Error('blip'));
    refocus();
    await act(async () => {});
    expect(out.current).toMatchObject({ status: 'ready', date: '2026-10-18' });
  });

  it('turning attendance off drops old numbers and ignores an answer still in flight', async () => {
    const slow = deferred<ReturnType<typeof data>>();
    fetchMock.mockReturnValueOnce(slow.promise);
    const { out, setEnabled } = mount(true);
    setEnabled(false);
    await act(async () => {
      slow.resolve(data('2026-10-18'));
    });
    expect(out.current.status).toBe('loading');
  });

  it('a slow old answer never overwrites a newer one', async () => {
    const first = deferred<ReturnType<typeof data>>();
    const second = deferred<ReturnType<typeof data>>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { out } = mount(true);
    refocus();
    await act(async () => {
      second.resolve(data('2026-10-19'));
    });
    await act(async () => {
      first.resolve(data('2026-10-18'));
    });
    expect(out.current).toMatchObject({ status: 'ready', date: '2026-10-19' });
  });
});
