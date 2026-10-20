/**
 * Tests for the AttendanceHomeScreen (Story 15-6): two owner-only
 * tiles ("Offices" + "Settings") that wire into the existing nav graph.
 * The screen is a minimal shim — the only contract here is that BOTH
 * tiles render and navigate to the right routes.
 *
 * Story 15-8 adds the ENTRY GATE: on every focus, an affirmative 200 from
 * `GET /attendance/setup` whose `setupCompletedAt` is null replaces this
 * screen with the wizard; a completed setup (or ANY gate failure — network,
 * a technician's 403) keeps the shim exactly as before. The screen
 * subscribes via `navigation.addListener?.('focus', …)`, so the tests
 * simulate a focus by invoking the listener captured from the mock.
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
import AttendanceHomeScreen from './AttendanceHomeScreen';
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

function renderHome(canGoBack = true, params?: { justEnabled?: boolean }) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(canGoBack),
    // The real navigator reports focus per screen; true by default (the
    // screen is focused) and flipped in the late-answer race test.
    isFocused: jest.fn(() => true),
    // The 15-8 gate subscribes imperatively; the real navigator always
    // provides addListener and the unsubscribe it returns.
    addListener: jest.fn(() => jest.fn()),
    setParams: jest.fn(),
  };
  const route = { params };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceHomeScreen
        navigation={navigation as never}
        route={route as never}
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

describe('AttendanceHomeScreen', () => {
  it('renders the every-day and set-up tiles', () => {
    const { renderer } = renderHome();
    const texts = renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);
    expect(texts).toContain('Today');
    expect(texts).toContain("Who's in and who's not");
    expect(texts).toContain('Monthly');
    expect(texts).toContain("Everyone's month at a glance");
    expect(texts).toContain('Leave');
    expect(texts).toContain('Pending requests & history');
    expect(texts).toContain('Offices');
    expect(texts).toContain('Add offices, set location and timings');
    expect(texts).toContain('Team attendance');
    expect(texts).toContain("Choose each person's office and start date");
    expect(texts).toContain('Weekly off');
    expect(texts).toContain('Same for everyone, or set per employee');
    expect(texts).toContain('Holidays');
    expect(texts).toContain('Company holiday list');
    // Section labels, and the retired catch-all tile.
    expect(texts).toContain('Every day');
    expect(texts).toContain('Set up');
    expect(texts).not.toContain('Settings');
  });

  it('renders the full tappable inventory: the seven tiles (the dev lab row retired with 19-6)', () => {
    const { renderer } = renderHome();
    // NO pre-filter: every button-role label on the screen, deduped (RTR
    // mirrors Pressables through host Views, so a raw findAll counts each
    // tile several times over). The contract is the CLOSED set — an extra
    // tile (or a regression to dashboard chrome) fails this.
    const labels = Array.from(
      new Set(
        renderer.root
          .findAll(node => node.props.accessibilityRole === 'button')
          .map(node => node.props.accessibilityLabel as string)
          .filter(Boolean),
      ),
    );
    expect(labels.sort()).toEqual([
      'Go back',
      'Holidays',
      'Leave',
      'Monthly',
      'Offices',
      'Team attendance',
      'Today',
      'Weekly off',
    ]);
  });

  it('renders the 19-4 "Today" tile FIRST, above Leave', () => {
    const { renderer } = renderHome();
    // The today snapshot is the owner's first answer (19-4 D1) — the tile
    // must precede the Leave tile in the tile order.
    const all = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button')
      .map((node) => node.props.accessibilityLabel as string);
    expect(all.indexOf('Today')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('Today')).toBeLessThan(all.indexOf('Leave'));
  });

  it('renders the 19-5 "Monthly" tile BETWEEN Today and Leave, and it navigates (D1)', () => {
    const { renderer, navigation } = renderHome();
    const all = renderer.root
      .findAll((node) => node.props.accessibilityRole === 'button')
      .map((node) => node.props.accessibilityLabel as string);
    expect(all.indexOf('Today')).toBeLessThan(all.indexOf('Monthly'));
    expect(all.indexOf('Monthly')).toBeLessThan(all.indexOf('Leave'));
    const monthlyButton = findTile(renderer, 'Monthly');
    act(() => {
      monthlyButton.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceMonthly');
  });

  it('tapping "Today" navigates to AttendanceDashboard (19-4 D1)', () => {
    const { renderer, navigation } = renderHome();
    const todayButton = findTile(renderer, 'Today');
    act(() => {
      todayButton.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceDashboard');
  });

  it('tapping "Offices" navigates to AttendanceOffices', () => {
    const { renderer, navigation } = renderHome();
    const officesButton = findTile(renderer, 'Offices');
    act(() => {
      officesButton.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceOffices');
  });

  it.each([
    ['Team attendance', 'AttendanceEnrolments'],
    ['Weekly off', 'AttendanceWeeklyOff'],
    ['Holidays', 'AttendanceHolidays'],
  ])('tapping "%s" goes straight to %s (no Settings detour)', (title, route) => {
    const { renderer, navigation } = renderHome();
    act(() => {
      findTile(renderer, title).props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith(route);
  });

  it('back goes back when there is a screen beneath (test gap)', () => {
    const { renderer, navigation } = renderHome(true);
    const back = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );
    expect(back.length).toBeGreaterThan(0);
    act(() => {
      back[0].props.onPress();
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('back falls back to the tabs when the screen is the stack root (deep link)', () => {
    // 15-8's wizard may land here with nothing beneath — goBack would
    // strand the owner (the same both-branch contract the other attendance
    // screens pin).
    const { renderer, navigation } = renderHome(false);
    const back = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );
    act(() => {
      back[0].props.onPress();
    });
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });
});

describe('AttendanceHomeScreen — the 15-8 setup entry gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('a NEVER-STARTED setup replaces to the wizard (AC-1: the tile opens the wizard)', async () => {
    getSetup.mockResolvedValue(
      setupState({ started: false, currentStep: null }),
    );
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(getSetup).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith('AttendanceSetupWizard');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('a started, INCOMPLETE setup also replaces to the wizard (resume path)', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(navigation.replace).toHaveBeenCalledWith('AttendanceSetupWizard');
  });

  it('a COMPLETED setup keeps the shim (no redirect, ever)', async () => {
    getSetup.mockResolvedValue(
      setupState({
        started: true,
        currentStep: null,
        setupCompletedAt: '2026-09-28T10:00:00Z',
        enabled: true,
      }),
    );
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('a FAILED gate GET (network) never redirects — the shim renders as today', async () => {
    getSetup.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('a FORBIDDEN gate GET (technician 403) never redirects', async () => {
    getSetup.mockRejectedValue({
      status: 403,
      code: 'FORBIDDEN',
      message: 'owner only',
    });
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('a slow STALE gate response cannot redirect after a newer focus decided', async () => {
    // Focus 1 hangs; focus 2 sees a completed setup (no redirect); when
    // focus 1's stale "not completed" answer finally lands it must be
    // dropped — the latest-wins guard, not last-writer-wins.
    let resolveStale!: (v: SetupState) => void;
    getSetup
      .mockImplementationOnce(
        () => new Promise<SetupState>((resolve) => (resolveStale = resolve)),
      )
      .mockResolvedValueOnce(
        setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
      );
    const { addListener, navigation } = renderHome();

    // Focus 1 — its GET never resolves yet.
    const handler = focusHandler(addListener);
    await act(async () => {
      handler();
      await flush();
    });

    // Focus 2 — resolves completed; no redirect.
    await act(async () => {
      handler();
      await flush();
    });
    expect(navigation.replace).not.toHaveBeenCalled();

    // The stale focus-1 answer arrives — it must NOT redirect.
    await act(async () => {
      resolveStale(setupState({ started: false, currentStep: null }));
      await flush();
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('a LATE gate answer cannot replace the route under a pushed tile', async () => {
    // The gate GET hangs; the owner pushes a tile (AttendanceHome is no
    // longer the focused route); the answer then lands "not completed". A
    // screen-dispatched replace without target would act on the CURRENT
    // stack index — replacing the TILE with the wizard — and device-back
    // would pop to AttendanceHome whose gate replaces again (an
    // inescapable loop). The focused check must swallow the late answer.
    let resolveGate!: (v: SetupState) => void;
    getSetup.mockImplementationOnce(
      () => new Promise<SetupState>((resolve) => (resolveGate = resolve)),
    );
    const { addListener, navigation } = renderHome();

    // Arrival fires the gate; its GET is still pending.
    const handler = focusHandler(addListener);
    await act(async () => {
      handler();
      await flush();
    });
    expect(resolveGate).toBeDefined();
    expect(navigation.isFocused).not.toHaveBeenCalled();

    // The owner pushes a tile — this screen is no longer focused.
    act(() => {
      navigation.navigate('AttendanceOffices');
    });
    navigation.isFocused.mockReturnValue(false);

    // The late "not completed" answer lands — it must NOT replace. The
    // guard still consulted focus (once) before deciding.
    await act(async () => {
      resolveGate(setupState({ started: false, currentStep: null }));
      await flush();
    });

    expect(navigation.isFocused).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('unsubscribes from the focus listener on unmount', () => {
    const rendered = renderHome();
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

describe('AttendanceHomeScreen — "Attendance is on" notice (UX finding 26)', () => {
  const MESSAGE = 'Attendance is on. Employees you turned on can now check in.';
  const notices = (r: ReactTestRenderer.ReactTestRenderer) =>
    r.root.findAll((n) => n.props?.message === MESSAGE);

  beforeEach(() => {
    jest.useFakeTimers();
    getSetup.mockResolvedValue(setupState({ setupCompletedAt: '2026-10-18T00:00:00Z', enabled: true }));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the success notice when the wizard just finished', () => {
    const { renderer } = renderHome(true, { justEnabled: true });
    expect(notices(renderer).length).toBeGreaterThan(0);
    expect(notices(renderer)[0].props.tone).toBe('success');
  });

  it('clears the param so a later refocus or rotation does not replay it', () => {
    const { navigation } = renderHome(true, { justEnabled: true });
    expect(navigation.setParams).toHaveBeenCalledWith({ justEnabled: undefined });
  });

  it('shows no notice on an ordinary visit', () => {
    const { renderer, navigation } = renderHome(true, undefined);
    expect(notices(renderer)).toHaveLength(0);
    expect(navigation.setParams).not.toHaveBeenCalled();
  });

  it('ignores a non-true flag', () => {
    const { renderer } = renderHome(true, { justEnabled: false });
    expect(notices(renderer)).toHaveLength(0);
  });

  it('hides the notice by itself after about five seconds', () => {
    const { renderer } = renderHome(true, { justEnabled: true });
    expect(notices(renderer).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(5100);
    });
    expect(notices(renderer)).toHaveLength(0);
  });
});

beforeEach(() => {
  mockCanWrite = true;
});

describe('AttendanceHomeScreen — a viewer (read-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = false;
  });

  const textsOf = (renderer: ReactTestRenderer.ReactTestRenderer) =>
    renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);

  it('keeps Today and Monthly (reads) and says why the rest is gone', () => {
    const { renderer } = renderHome();
    const texts = textsOf(renderer);

    expect(texts).toContain('Today');
    expect(texts).toContain('Monthly');
    expect(texts).toContain('View-only access');
  });

  it('hides Leave (a viewer cannot read leave) and every set-up tile', () => {
    const { renderer } = renderHome();
    const texts = textsOf(renderer);

    for (const hidden of ['Leave', 'Set up', 'Offices', 'Team attendance', 'Weekly off', 'Holidays']) {
      expect(texts).not.toContain(hidden);
    }
  });

  it('never asks the setup endpoint and never redirects into the setup wizard, even when setup is unfinished', async () => {
    getSetup.mockResolvedValue(setupState({ started: false }));
    const { addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(getSetup).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('the company admin still gets the full hub and the setup gate (control)', async () => {
    mockCanWrite = true;
    getSetup.mockResolvedValue(setupState({ started: false }));
    const { renderer, addListener, navigation } = renderHome();

    await fireFocus(addListener);

    expect(textsOf(renderer)).toContain('Leave');
    expect(navigation.replace).toHaveBeenCalledWith('AttendanceSetupWizard');
  });
});
