/**
 * Tests for AttendanceTabHomeScreen — the owner's Attendance tab page
 * (2026-10 footer restructure): the hub's old "Every day" tiles (Today,
 * Monthly, Leave) plus the CAP-3 setup banner. The page is tiles-only —
 * it never embeds attendance content and never auto-redirects.
 *
 * The banner's GET is the hub's focus gate minus the redirect, so the gate
 * conventions transfer: the screen subscribes via
 * `navigation.addListener?.('focus', …)` and the tests simulate a focus by
 * invoking the listener captured from the mock; a failed or forbidden GET
 * is silent (no banner, no redirect), and the latest-wins seq guard drops
 * stale answers.
 */
jest.mock('../../../services', () => ({
  attendanceSetupService: {
    getSetup: jest.fn(),
  },
}));

// The real session is empty in this test, so the role hooks are pinned:
// a company admin by default, a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../../auth/useRole', () => ({
  ...jest.requireActual('../../auth/useRole'),
  useCanWrite: () => mockCanWrite,
  useSessionRole: () => (mockCanWrite ? 'company_admin' : 'viewer'),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import AttendanceTabHomeScreen from './AttendanceTabHomeScreen';
import { attendanceSetupService } from '../../../services';
import type { SetupState } from '../../../services';

const getSetup = attendanceSetupService.getSetup as jest.Mock;

function setupState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    started: true,
    currentStep: null,
    setupCompletedAt: null,
    enabled: false,
    ...overrides,
  };
}

function renderTab() {
  const navigation = {
    navigate: jest.fn(),
    // The banner must never REPLACE anything — the mock only exists so the
    // no-redirect assertions have something to read.
    replace: jest.fn(),
    // The real navigator reports focus per screen; true by default (the
    // tab is focused) and flipped in the late-answer race test.
    isFocused: jest.fn(() => true),
    // The gate subscribes imperatively; the real navigator always provides
    // addListener and the unsubscribe it returns.
    addListener: jest.fn(() => jest.fn()),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceTabHomeScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );
  });
  return { renderer, navigation, addListener: navigation.addListener };
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** The focus handler the gate registered on mount (the real navigator fires
 *  it on mount focus and on every refocus). */
function focusHandler(addListener: jest.Mock): () => void {
  const call = addListener.mock.calls.at(-1);
  expect(call?.[0]).toBe('focus');
  expect(typeof call?.[1]).toBe('function');
  return call?.[1] as () => void;
}

async function fireFocus(addListener: jest.Mock) {
  const handler = focusHandler(addListener);
  await act(async () => {
    handler();
    await flush();
  });
}

/**
 * The tile Pressable for a label. `findByProps({ accessibilityLabel })` is
 * ambiguous: react-test-renderer mirrors the composite `Pressable` with its
 * host `View`, and both carry the label. The Pressable is the one with the
 * `onPress` handler.
 */
function findTile(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node => node.props.accessibilityLabel === label
      && typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('AttendanceTabHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  it('renders the title-only header, the "Every day" eyebrow and the three tiles', () => {
    const { renderer } = renderTab();
    const texts = renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);
    expect(texts).toContain('Attendance');
    expect(texts).toContain('Every day');
    expect(texts).toContain('Today');
    expect(texts).toContain("Who's in and who's not");
    expect(texts).toContain('Monthly');
    expect(texts).toContain("Everyone's month at a glance");
    expect(texts).toContain('Leave');
    expect(texts).toContain('Pending requests & history');

    // The hub's deleted order pin (19-4/19-5 D1): the today snapshot is the
    // owner's first answer — Today, then Monthly, then Leave.
    const all = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button')
      .map((node) => node.props.accessibilityLabel as string);
    expect(all.indexOf('Today')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('Today')).toBeLessThan(all.indexOf('Monthly'));
    expect(all.indexOf('Monthly')).toBeLessThan(all.indexOf('Leave'));
  });

  it.each([
    ['Today', 'AttendanceDashboard'],
    ['Monthly', 'AttendanceMonthly'],
    ['Leave', 'OwnerLeave'],
  ])('tapping "%s" opens the existing %s screen', (title, route) => {
    const { renderer, navigation } = renderTab();
    act(() => {
      findTile(renderer, title).props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith(route);
  });
});

describe('AttendanceTabHomeScreen — the setup banner (CAP-3: banner, not a redirect)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  it('shows the banner when the setup is incomplete, and nothing auto-redirects', async () => {
    getSetup.mockResolvedValue(setupState({ started: false, currentStep: null }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    const banner = findTile(renderer, 'Finish setting up attendance');
    expect(banner).toBeDefined();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('tapping the banner pushes the setup wizard', async () => {
    getSetup.mockResolvedValue(setupState({ started: false, currentStep: null }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    act(() => {
      findTile(renderer, 'Finish setting up attendance').props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceSetupWizard');
  });

  it('a COMPLETED setup shows no banner', async () => {
    getSetup.mockResolvedValue(
      setupState({
        started: true,
        currentStep: null,
        setupCompletedAt: '2026-09-28T10:00:00Z',
        enabled: true,
      }),
    );
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    expect(getSetup).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('a FAILED gate GET (network) shows no banner and the page still renders', async () => {
    getSetup.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
    // The page is unblocked — the daily tiles render as usual.
    expect(findTile(renderer, 'Today')).toBeDefined();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('a COMPLETED answer after an INCOMPLETE one clears the banner on refocus', async () => {
    // Setup completes mid-session (the wizard replaces into place on the
    // hub, then the owner returns here) — the next focus GET must clear the
    // banner, not leave it stale.
    getSetup
      .mockResolvedValueOnce(setupState({ started: false, currentStep: null }))
      .mockResolvedValueOnce(
        setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
      );
    const { renderer, addListener } = renderTab();

    await fireFocus(addListener);
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ).length,
    ).toBeGreaterThan(0);

    await fireFocus(addListener);
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
  });

  it('a slow STALE answer cannot flip the banner after a newer focus decided', async () => {
    // Focus 1 hangs; focus 2 sees a completed setup (no banner); when
    // focus 1's stale "not completed" answer finally lands it must be
    // dropped — the latest-wins guard copied from the hub gate.
    let resolveStale!: (v: SetupState) => void;
    getSetup
      .mockImplementationOnce(
        () => new Promise<SetupState>((resolve) => (resolveStale = resolve)),
      )
      .mockResolvedValueOnce(
        setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
      );
    const { renderer, addListener } = renderTab();

    const handler = focusHandler(addListener);
    await act(async () => {
      handler();
      await flush();
    });
    await act(async () => {
      handler();
      await flush();
    });
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);

    await act(async () => {
      resolveStale(setupState({ started: false, currentStep: null }));
      await flush();
    });
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
  });

  it('a LATE answer cannot flip the banner while the tab is unfocused', async () => {
    // The gate GET hangs; the owner pushes a tile (this tab is no longer
    // focused); the answer then lands "not completed". The focused check
    // (the hub gate's guard, verbatim) must swallow it — refocus re-runs
    // the GET anyway.
    let resolveGate!: (v: SetupState) => void;
    getSetup.mockImplementationOnce(
      () => new Promise<SetupState>((resolve) => (resolveGate = resolve)),
    );
    const { renderer, navigation, addListener } = renderTab();

    const handler = focusHandler(addListener);
    await act(async () => {
      handler();
      await flush();
    });
    expect(navigation.isFocused).not.toHaveBeenCalled();

    // The owner pushes a tile — this tab is no longer focused.
    act(() => {
      navigation.navigate('AttendanceDashboard');
    });
    navigation.isFocused.mockReturnValue(false);

    await act(async () => {
      resolveGate(setupState({ started: false, currentStep: null }));
      await flush();
    });

    expect(navigation.isFocused).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
  });

  it('unsubscribes from the focus listener on unmount', () => {
    const rendered = renderTab();
    expect(rendered.addListener).toHaveBeenCalledWith(
      'focus',
      expect.any(Function),
    );
    // The mount-time addListener returned an unsubscribe; the screen's
    // effect cleanup must call it exactly once. (React 19 flushes passive
    // effect cleanups on unmount only inside act.)
    const unsubscribe = rendered.addListener.mock.results[0]?.value as jest.Mock;
    expect(typeof unsubscribe).toBe('function');
    act(() => {
      rendered.renderer.unmount();
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('AttendanceTabHomeScreen — a viewer (read-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = false;
  });

  it('keeps Today and Monthly (reads)', () => {
    const { renderer } = renderTab();
    findTile(renderer, 'Today');
    findTile(renderer, 'Monthly');
  });

  it('hides Leave and the setup banner, and never asks the setup endpoint', async () => {
    getSetup.mockResolvedValue(setupState({ started: false }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    expect(getSetup).not.toHaveBeenCalled();
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Leave'
          || node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
