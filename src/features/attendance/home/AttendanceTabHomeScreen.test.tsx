/**
 * Tests for AttendanceTabHomeScreen — the owner's Attendance tab page.
 *
 * REQUIREMENT SUPERSEDED (2026-10, CAP-1 of SPEC-attendance-tabs-home-
 * leave-banner): the page was the hub's "Every day" tiles; it is now a
 * Today | Monthly | Leave SegmentedControl whose panes are the SAME leaf
 * screens rendered in place as `embedded` panes — no tiles, no navigation
 * push. These assertions follow the NEW requirement; the CAP-3 setup
 * banner conventions below carry over unchanged.
 *
 * The three panes are stubbed: each leaf owns its own fetches/postures
 * (their own suites cover those) — this page only decides WHICH pane
 * renders and with `embedded` set.
 *
 * The gate GET is the hub's focus gate minus the redirect, so the gate
 * conventions transfer: the screen subscribes via
 * `navigation.addListener?.('focus', …)` and the tests simulate a focus by
 * invoking the listener captured from the mock; a failed or forbidden GET
 * is silent (no redirect), and the latest-wins seq guard drops stale
 * answers. REQUIREMENT SUPERSEDED (2026-10-23 owner redesign): the inline
 * banner became the SetupPending SCREEN — an incomplete setup replaces the
 * segments entirely (it cannot be skipped); only a focus GET that sees a
 * completed setup returns the tabbed page.
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

// The badge rides the shared /users/me profile store — the real store
// would fire GET /users/me in these tests, so it is pinned like the role
// hooks above; a test seeds `mockProfile` for the badge cases (default
// null → no badge).
let mockProfile: Record<string, unknown> | null = null;
jest.mock('../../profile/useMyProfile', () => ({
  useMyProfile: () => ({ profile: mockProfile }),
  loadMyProfile: jest.fn(),
}));

// The panes — stubbed leaves surfacing their host wiring as testID props.
jest.mock('../dashboard/AttendanceDashboardScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: function MockDashboard(props: { embedded?: boolean }) {
      return React.createElement(Text, {
        testID: 'pane-today',
        embedded: props.embedded,
      });
    },
  };
});
jest.mock('../monthly/AttendanceMonthlyScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: function MockMonthly(props: { embedded?: boolean }) {
      return React.createElement(Text, {
        testID: 'pane-monthly',
        embedded: props.embedded,
      });
    },
  };
});
jest.mock('../leave/OwnerLeaveScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: function MockLeave(props: { embedded?: boolean }) {
      return React.createElement(Text, {
        testID: 'pane-leave',
        embedded: props.embedded,
      });
    },
  };
});

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { loadMyProfile } from '../../profile/useMyProfile';
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

function renderTab(params?: { tab?: string }) {
  const navigation = {
    navigate: jest.fn(),
    // The banner must never REPLACE anything — the mock only exists so the
    // no-redirect assertions have something to read.
    replace: jest.fn(),
    // The Review param is consumed read-once-then-cleared (the Jobs
    // `scope` convention).
    setParams: jest.fn(),
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
        route={(params ? { params } : {}) as never}
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

/** The segmented control's segments, in render order — the composite
 *  Pressable of each (the only node carrying onPress; its host mirror
 *  carries the accessibility props but not the handler). */
function segments(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAll(
      node =>
        node.props.accessibilityRole === 'button'
        && node.props.accessibilityState?.selected !== undefined
        && typeof node.props.onPress === 'function',
    )
    .map(node => ({
      label: node.find(
        (n: ReactTestRenderer.ReactTestInstance) =>
          n.type === Text && typeof n.props.children === 'string',
      ).props.children as string,
      selected: node.props.accessibilityState.selected as boolean,
    }));
}

/** The segment Pressable for a label (the house pressable walk-up: from
 *  the label Text to its onPress-carrying ancestor). */
function findSegment(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const text = renderer.root.find(
    node => node.type === Text && node.props.children === label,
  );
  let node = text.parent;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  expect(node).not.toBeNull();
  return node!;
}

/**
 * The setup banner Tile. `findByProps({ accessibilityLabel })` is
 * ambiguous: react-test-renderer mirrors the composite `Pressable` with
 * its host `View`, and both carry the label. The Pressable is the one with
 * the `onPress` handler.
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

describe('AttendanceTabHomeScreen — the segmented panes (CAP-1: tabs, not tiles)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  it('renders the title-only header and the three segments with Today active — the tiles are gone', () => {
    const { renderer } = renderTab();
    const texts = renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);
    expect(texts).toContain('Attendance');
    // Requirement superseded (CAP-1): no "Every day" eyebrow and no tile
    // copy — the segments ARE the content now.
    expect(texts).not.toContain('Every day');
    expect(texts).not.toContain("Who's in and who's not");
    expect(texts).not.toContain("Everyone's month at a glance");
    expect(texts).not.toContain('Pending requests & history');

    // Segment order (the deleted tiles' order pin carries over: the today
    // snapshot is the owner's first answer — Today, then Monthly, then
    // Leave) and the entry pane: Today selected.
    expect(segments(renderer)).toEqual([
      { label: 'Today', selected: true },
      { label: 'Monthly', selected: false },
      { label: 'Leave', selected: false },
    ]);

    // The Today pane renders embedded, in place — not a push.
    expect(renderer.root.findByProps({ testID: 'pane-today' }).props.embedded).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'pane-monthly' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'pane-leave' })).toHaveLength(0);
  });

  it.each([
    ['Monthly', 'pane-monthly'],
    ['Leave', 'pane-leave'],
  ])('tapping "%s" swaps the pane in place — never a navigation push', (label, paneId) => {
    const { renderer, navigation } = renderTab();
    act(() => {
      findSegment(renderer, label).props.onPress();
    });
    expect(renderer.root.findByProps({ testID: paneId }).props.embedded).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'pane-today' })).toHaveLength(0);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('AttendanceTabHomeScreen — the setup pending screen (CAP-3 + the 2026-10 redesign)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  /** The SetupPending screen's presence: its title + Continue button. */
  function pendingShown(renderer: ReactTestRenderer.ReactTestRenderer) {
    return (
      renderer.root.findAll(
        node => node.type === Text && node.props.children === 'Continue Setup',
      ).length > 0
    );
  }

  it('an incomplete setup renders the invitation screen INSTEAD of the segments — and nothing auto-redirects', async () => {
    getSetup.mockResolvedValue(setupState({ started: false, currentStep: null }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    expect(pendingShown(renderer)).toBe(true);
    // The tabbed page is gone entirely — no Today pane, no segments: the
    // pending screen owns the page.
    expect(renderer.root.findAllByProps({ testID: 'pane-today' })).toHaveLength(0);
    expect(segments(renderer)).toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('Continue Setup pushes the setup wizard (the screen cannot be skipped)', async () => {
    getSetup.mockResolvedValue(setupState({ started: false, currentStep: null }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    const pressable = renderer.root.find(
      node =>
        typeof node.props.onPress === 'function' &&
        node.findAll(
          (n) => n.type === Text && n.props.children === 'Continue Setup',
        ).length > 0,
    );
    act(() => {
      pressable.props.onPress();
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
    // The page is unblocked — the segmented panes render as usual.
    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();
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
    expect(pendingShown(renderer)).toBe(true);

    await fireFocus(addListener);
    expect(pendingShown(renderer)).toBe(false);
    // The tabbed page returned with the pending screen gone.
    expect(segments(renderer)).toHaveLength(3);
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
    expect(pendingShown(renderer)).toBe(false);

    await act(async () => {
      resolveStale(setupState({ started: false, currentStep: null }));
      await flush();
    });
    expect(pendingShown(renderer)).toBe(false);
  });

  it('a LATE answer cannot flip the banner while the tab is unfocused', async () => {
    // The gate GET hangs; the owner switches away (this tab is no longer
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

    // The owner switches away — this tab is no longer focused.
    act(() => {
      navigation.navigate('AttendanceDashboard');
    });
    navigation.isFocused.mockReturnValue(false);

    await act(async () => {
      resolveGate(setupState({ started: false, currentStep: null }));
      await flush();
    });

    // The gate consults focus at ANSWER time (one call) and the answer
    // landed on an unfocused screen — it decides nothing.
    expect(navigation.isFocused).toHaveBeenCalledTimes(1);
    expect(pendingShown(renderer)).toBe(false);
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

  it('keeps exactly the Today and Monthly segments, Today active', () => {
    const { renderer } = renderTab();
    expect(segments(renderer)).toEqual([
      { label: 'Today', selected: true },
      { label: 'Monthly', selected: false },
    ]);
    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();
  });

  it('hides the Leave segment and the setup banner, and never asks the setup endpoint', async () => {
    getSetup.mockResolvedValue(setupState({ started: false }));
    const { renderer, addListener, navigation } = renderTab();

    await fireFocus(addListener);

    expect(getSetup).not.toHaveBeenCalled();
    expect(segments(renderer).map(segment => segment.label)).not.toContain('Leave');
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Finish setting up attendance',
      ),
    ).toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('AttendanceTabHomeScreen — the one-shot Review param (CAP-4 landing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
    mockProfile = null;
  });
  afterEach(() => {
    mockProfile = null;
  });

  it('a `tab: leave` arrival pre-selects the Leave pane — no Today flash', () => {
    const { renderer } = renderTab({ tab: 'leave' });

    expect(renderer.root.findByProps({ testID: 'pane-leave' })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: 'pane-today' })).toHaveLength(0);
  });

  it('a `tab: monthly` arrival pre-selects Monthly the same way', () => {
    const { renderer } = renderTab({ tab: 'monthly' });

    expect(renderer.root.findByProps({ testID: 'pane-monthly' })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: 'pane-leave' })).toHaveLength(0);
  });

  it('the param is consumed read-once: cleared via setParams on entry', () => {
    const { navigation } = renderTab({ tab: 'leave' });

    expect(navigation.setParams).toHaveBeenCalledTimes(1);
    expect(navigation.setParams).toHaveBeenCalledWith({ tab: undefined });
  });

  it('no param: Today renders and setParams is untouched', () => {
    const { renderer, navigation } = renderTab();

    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();
    expect(navigation.setParams).not.toHaveBeenCalled();
  });

  it('a garbage param is ignored: Today renders, nothing is cleared', () => {
    const { renderer, navigation } = renderTab({ tab: 'yesterday' });

    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();
    expect(navigation.setParams).not.toHaveBeenCalled();
  });

  it('a demoted viewer clamps a seeded Leave choice to Today (live role change)', () => {
    mockCanWrite = false;
    const { renderer } = renderTab({ tab: 'leave' });

    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();
    expect(renderer.root.findAllByProps({ testID: 'pane-leave' })).toHaveLength(0);
  });

  it('a NEW param while mounted re-seeds the pane (the second Review)', async () => {
    const { renderer, navigation } = renderTab();
    expect(renderer.root.findByProps({ testID: 'pane-today' })).toBeDefined();

    await act(async () => {
      renderer.update(
        <AttendanceTabHomeScreen
          navigation={navigation as never}
          route={{ params: { tab: 'monthly' } } as never}
        />,
      );
    });

    expect(renderer.root.findByProps({ testID: 'pane-monthly' })).toBeDefined();
    expect(navigation.setParams).toHaveBeenCalledWith({ tab: undefined });
  });
});

describe('AttendanceTabHomeScreen — the Leave badge (CAP-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
    mockProfile = null;
  });
  afterEach(() => {
    mockProfile = null;
  });

  /** The badge pill's numeric Text — the only numeric Text child on the
   *  page (labels are strings, the pane stubs render no children). */
  function badgeCount(renderer: ReactTestRenderer.ReactTestRenderer): number | null {
    const matches = renderer.root.findAll(
      node => node.type === Text && typeof node.props.children === 'number',
    );
    expect(matches.length).toBeLessThanOrEqual(1);
    return matches.length ? (matches[0].props.children as number) : null;
  }

  it('badges Leave with the mirror count while the tenant is enrolled', () => {
    mockProfile = {
      attendance: { attendanceEnabled: true, pendingLeaveRequests: 2 },
    };
    const { renderer } = renderTab();

    expect(badgeCount(renderer)).toBe(2);
  });

  it('no badge at a zero count (fail-hidden, not "0")', () => {
    mockProfile = {
      attendance: { attendanceEnabled: true, pendingLeaveRequests: 0 },
    };
    const { renderer } = renderTab();

    expect(badgeCount(renderer)).toBeNull();
  });

  it('fails HIDDEN without the attendance mirror (older backend)', () => {
    mockProfile = {};
    const { renderer } = renderTab();

    expect(badgeCount(renderer)).toBeNull();
  });

  it('every focus loads the mirror — a decision made elsewhere reaches the badge', async () => {
    const { addListener } = renderTab();

    await fireFocus(addListener);

    expect(loadMyProfile).toHaveBeenCalled();
  });
});
