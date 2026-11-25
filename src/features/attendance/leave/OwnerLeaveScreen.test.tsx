/**
 * Screen tests for `OwnerLeaveScreen` (the two-tab Leave redesign,
 * 2026-11-25; carried over from the 17-6/17-7 queue suites where the
 * behavior survives). Pins: the first-load shimmer → cards; the
 * per-FILTER cache with the cursor-safety invariant (a Needs-review
 * cursor never paginates All); pull-to-refresh resetting the ACTIVE
 * filter only (announced); the INLINE approve removing the row +
 * announcement; the 409 LEAVE_NOT_PENDING notice above the list (+ the
 * first-page refetch); the two-stage reject (1→2→Back→1) with the empty
 * reason valid; `dismissible={false}` mid-write via the SHEET's approve;
 * the double-tap latch; the CTA row; the search needle's fetch shape; per-
 * filter empty states; the load failure + Retry. 17-7: the outline-danger
 * revoke entry on an Approved row, the stage morph (title swap, preview
 * per entry), the reason gate, the success morph back to the refreshed
 * detail, own-retry bare-view success, 409 LEAVE_NOT_REVOKABLE whole-sheet
 * close + refetch, divergence absorption, offline line.
 *
 * RTR gotchas honoured (spec-17-5 §4): text matching flattens JSX array
 * children; buttons are found by role + label (never findAllByProps with
 * asymmetric matchers); Button double-carries onPress, so the sheet's
 * buttons are driven BY TYPE + children (and the sheet's writes via its
 * props where a card button would share the label); async work flushes
 * through `await act(async () => {})`.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listOwnerLeave: jest.fn(),
    approveLeave: jest.fn(),
    rejectLeave: jest.fn(),
    previewRevoke: jest.fn(),
    revokeLeave: jest.fn(),
    // 23-14 — the detail sheet's balances slot (host-fetched).
    getEmployeeBalances: jest.fn().mockResolvedValue([]),
    // The two-tab surface — the pills' counts and the Config pane.
    leaveSummary: jest.fn().mockResolvedValue({
      activeEmployees: 0,
      counts: { pending: 0, approved: 0, revoked: 0, cancelled: 0, rejected: 0 },
    }),
    listCompanyLeaveTypes: jest.fn().mockResolvedValue([]),
    patchLeaveType: jest.fn(),
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

// Write successes refresh the shared /users/me mirror (the Attendance tab's
// badge and Home's banner read it) — pin the store so the tests never fire
// a real GET.
jest.mock('../../profile/useMyProfile', () => ({
  loadMyProfile: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, AppState, FlatList, Text } from 'react-native';
import { Button, Input, SegmentedControl, Sheet } from '../../../components/ui';
import { InlineNotice } from '../../../components/ui';
import { colors } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import { loadMyProfile } from '../../profile/useMyProfile';
import type { LeaveActionPreview, LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveDetailSheet } from './LeaveDetailSheet';
import { LeaveRequestCard } from './LeaveRequestCard';
import OwnerLeaveScreen from './OwnerLeaveScreen';
import ScreenHeader from '../offices/ScreenHeader';

const listOwnerLeave = attendanceLeaveService.listOwnerLeave as jest.Mock;
const approveLeave = attendanceLeaveService.approveLeave as jest.Mock;
const rejectLeave = attendanceLeaveService.rejectLeave as jest.Mock;
const previewRevoke = attendanceLeaveService.previewRevoke as jest.Mock;
const revokeLeave = attendanceLeaveService.revokeLeave as jest.Mock;
const getEmployeeBalances = attendanceLeaveService.getEmployeeBalances as jest.Mock;
const leaveSummary = attendanceLeaveService.leaveSummary as jest.Mock;
const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

function leaveRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'e1',
    employeeName: 'Arya',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    part: 'full_day',
    reason: 'Family',
    status: 'pending',
    workingDays: 3,
    totalDays: 5,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [
      { date: '2026-10-05', state: 'pending' },
      { date: '2026-10-06', state: 'pending' },
      { date: '2026-10-07', state: 'pending' },
    ],
    ...overrides,
  };
}

const page = (data: LeaveRequestRow[], nextCursor: string | null, hasMore = nextCursor !== null) => ({
  data,
  nextCursor,
  hasMore,
});

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function textsInOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** Button-role nodes carrying onPress + the exact label (house finder). */
function findButtons(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
  );
}

function findButtonByText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByType(Button).find(b => b.props.children === text);
}

/** The sheet's text input — the LAST Input in the tree (the pane's search
 *  field renders first, and typing into it would commit a needle that
 *  refilters the list mid-test). */
function sheetInput(root: ReactTestRenderer.ReactTestInstance) {
  const inputs = root.findAllByType(Input);
  return inputs[inputs.length - 1];
}

/** The filter pill: a button-role node with NO label whose first Text is
 *  the pill's word (the optional count Text trails it) — the CTA and the
 *  cards carry explicit labels, the segments name their views. */
function findPill(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === undefined &&
      (node.findAll(n => n.type === Text).map(flatText)[0] ?? '') === label,
  );
}

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn(() => jest.fn()),
    canGoBack: jest.fn(() => true),
  };
}

type Nav = ReturnType<typeof makeNavigation>;

// Unmounted in afterEach — a live FlatList's VirtualizedList keeps a
// cell-update `setTimeout` that otherwise fires AFTER the tests: a setState
// outside act whose scheduler tail poisons the next suite in this worker
// (found as moving uncaught-error failures across unrelated suites).
let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderScreen(
  params: { tab?: 'requests' | 'types'; filter?: 'pending' | 'all' } = {},
  opts: { embedded?: boolean } = {},
): Promise<{
  renderer: ReactTestRenderer.ReactTestRenderer;
  root: ReactTestRenderer.ReactTestInstance;
  navigation: Nav;
}> {
  const navigation = makeNavigation();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params } as never}
        embedded={opts.embedded}
      />,
    );
  });
  lastRenderer = renderer;
  return { renderer, root: renderer.root, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
  listOwnerLeave.mockResolvedValue(page([], null));
  approveLeave.mockResolvedValue(leaveRow());
  rejectLeave.mockResolvedValue(leaveRow());
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

describe('first load and the CTA row (spec D1)', () => {
  it('the first page loads the ACTIVE filter (pending) and renders cards', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], 'CUR-2'));
    const { root } = await renderScreen();
    expect(listOwnerLeave).toHaveBeenCalledWith({ status: 'pending', limit: 20 });
    expect(root.findAllByType(LeaveRequestCard)).toHaveLength(1);
  });

  it('a first page still in flight renders the labelled shimmer (no spinner)', async () => {
    listOwnerLeave.mockReturnValueOnce(new Promise(() => undefined));
    const { root } = await renderScreen();
    expect(
      root.findAll(n => n.props.accessibilityLabel === 'Loading leave requests').length,
    ).toBeGreaterThan(0);
  });

  it('the CTA row leads the list and navigates to ApplyOnBehalf', async () => {
    const { root, navigation } = await renderScreen();
    const cta = findButtons(root, 'Apply on behalf');
    expect(cta).toHaveLength(1);
    const texts = textsInOrder(root);
    expect(texts).toContain('Apply on behalf');
    await act(async () => {
      cta[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('ApplyOnBehalf', undefined);
  });

  it('a load failure with nothing loaded shows the error + Retry, which refetches', async () => {
    listOwnerLeave.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await renderScreen();
    expect(textsInOrder(root)).toContain(
      "Couldn't load leave requests. Check your connection and try again.",
    );
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    await act(async () => {
      findButtonByText(root, 'Retry')!.props.onPress();
    });
    expect(root.findAllByType(LeaveRequestCard)).toHaveLength(1);
  });

  it('an empty filter renders its empty state; the EmptyState itself carries no CTA (the row above is the CTA, per D1)', async () => {
    const { root } = await renderScreen();
    expect(textsInOrder(root)).toContain('No requests here');
    expect(textsInOrder(root)).toContain('Nothing matches this filter yet.');
  });
});

describe('per-filter state and the cursor-safety invariant (spec D1)', () => {
  it('switching to the All filter keeps the pending cache and loads the unfiltered list', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], null));
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'All')[0].props.onPress();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ limit: 20 });
    // Both caches coexist: switching back serves the pending rows from cache.
    await act(async () => {
      findPill(root, 'Needs review')[0].props.onPress();
    });
    expect(root.findAllByType(LeaveRequestCard)).toHaveLength(1);
    expect(listOwnerLeave).toHaveBeenCalledTimes(2);
  });

  it("onEndReached paginates ONLY the active filter's own cursor", async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], 'CUR-A-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'p2' })], null));
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'All')[0].props.onPress();
    });
    await act(async () => {
      root.findByType(FlatList).props.onEndReached();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ cursor: 'CUR-A-1', limit: 20 });
    // Back on pending: its load-more consumes the PENDING cursor.
    await act(async () => {
      findPill(root, 'Needs review')[0].props.onPress();
    });
    await act(async () => {
      root.findByType(FlatList).props.onEndReached();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', cursor: 'CUR-P-1', limit: 20 });
  });

  it('pull-to-refresh resets the ACTIVE filter only and announces', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-P-1'))
      .mockResolvedValueOnce(page([leaveRow({ id: 'r9' })], null));
    const { root } = await renderScreen();
    const flatList = root.findByType(FlatList);
    await act(async () => {
      flatList.props.refreshControl.props.onRefresh();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
    expect(announce).toHaveBeenCalledWith('Leave requests updated');
    expect(flatList.props.data.map((r: LeaveRequestRow) => r.id)).toEqual(['r9']);
  });

  it('a refresh failure with data keeps the rows and shows the notice', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const { root } = await renderScreen();
    listOwnerLeave.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    await act(async () => {
      root.findByType(FlatList).props.refreshControl.props.onRefresh();
    });
    expect(textsInOrder(root)).toContain("Couldn't refresh. Showing the last loaded list.");
    expect(root.findAllByType(LeaveRequestCard)).toHaveLength(1);
  });

  it('the committed search needle rides the fetch (trimmed, q when non-empty)', async () => {
    jest.useFakeTimers();
    try {
      listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
      const { root } = await renderScreen();
      // Typing schedules the commit; the debounce elapses under fake timers.
      await act(async () => {
        root.findAllByType(Input)[0].props.onChangeText('  sick  ');
      });
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', q: 'sick', limit: 20 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('the All filter renders its own empty state when the unfiltered list is empty', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([], null));
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'All')[0].props.onPress();
    });
    expect(textsInOrder(root)).toContain('No requests here');
    expect(textsInOrder(root)).toContain('Nothing matches this filter yet.');
  });
});

describe('approve — the INLINE write (spec D2 lifecycle)', () => {
  async function openListWithTwoPending() {
    listOwnerLeave.mockResolvedValueOnce(
      page([leaveRow({ id: 'r1' }), leaveRow({ id: 'r2', employeeName: 'Suresh' })], null),
    );
    return renderScreen();
  }

  it('single tap, no confirmation: on pending the row is REMOVED and announced', async () => {
    approveLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'approved' }));
    const { root } = await openListWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    expect(approveLeave).toHaveBeenCalledWith('r1');
    // The decision must reach the shared /users/me mirror past the focus
    // throttle — the tab-page badge and Home's banner read it.
    expect(loadMyProfile).toHaveBeenCalledWith({ force: true });
    expect(announce).toHaveBeenCalledWith('Leave approved');
    const ids = (root.findByType(FlatList).props.data as LeaveRequestRow[]).map(r => r.id);
    expect(ids).toEqual(['r2']); // the approved row left the filtered list
  });

  it('on the All filter the decided row is REPLACED in place', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1' })], null));
    approveLeave.mockResolvedValue(leaveRow({ id: 'a1', status: 'approved' }));
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'All')[0].props.onPress();
    });
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data.map(r => r.id)).toEqual(['a1']);
    expect(data[0].status).toBe('approved');
  });

  it('a double-tap while in flight is a no-op (the latch)', async () => {
    let resolveWrite!: (v: LeaveRequestRow) => void;
    approveLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        resolveWrite = resolve;
      }),
    );
    const { root } = await openListWithTwoPending();
    const approve = root.findAllByType(LeaveRequestCard)[0].props.onApprove;
    await act(async () => {
      approve();
      approve();
    });
    resolveWrite(leaveRow({ id: 'r1', status: 'approved' }));
    await act(async () => {});
    expect(approveLeave).toHaveBeenCalledTimes(1);
  });

  it('own-retry 200 = success: a failed attempt keeps the rows, the retry lands', async () => {
    approveLeave
      .mockRejectedValueOnce({ status: 0, code: 'TIMEOUT', message: 'x' })
      .mockResolvedValueOnce(leaveRow({ id: 'r1', status: 'approved' }));
    const { root } = await openListWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    expect(textsInOrder(root)).toContain(
      "You're offline. Approving needs a working connection.",
    );
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    expect(approveLeave).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith('Leave approved');
    const ids = (root.findByType(FlatList).props.data as LeaveRequestRow[]).map(r => r.id);
    expect(ids).toEqual(['r2']);
  });

  it('409 LEAVE_NOT_PENDING swaps to the notice above the list and refetches the row truth', async () => {
    approveLeave.mockRejectedValue({
      status: 409,
      code: 'LEAVE_NOT_PENDING',
      message: 'This leave request has already been decided.',
    });
    const { root } = await openListWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe('This request was already handled');
    expect(notices[0].props.tone).toBe('neutral');
    // The row refetched to its true state.
    expect(listOwnerLeave).toHaveBeenCalledTimes(2);
    // Dismissing clears the notice.
    await act(async () => {
      notices[0].props.onDismiss();
    });
    expect(root.findAllByType(InlineNotice)).toHaveLength(0);
  });

  it('the sheet is dismissible={false} while the SHEET-hosted approve is in flight', async () => {
    let resolveWrite!: (v: LeaveRequestRow) => void;
    approveLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        resolveWrite = resolve;
      }),
    );
    const { root } = await openListWithTwoPending();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    const sheet = root.findAllByType(Sheet)[0];
    expect(sheet.props.dismissible).toBe(true);
    await act(async () => {
      root.findAllByType(LeaveDetailSheet)[0].props.onApprove();
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(false);
    resolveWrite(leaveRow({ id: 'r1', status: 'approved' }));
    await act(async () => {});
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });
});

describe('reject — two stages inside the detail sheet (spec D2)', () => {
  async function openSheet() {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const ctx = await renderScreen();
    await act(async () => {
      findButtons(ctx.root, 'Leave request for Arya, 5–9 Oct 2026, 3 working days, Pending, reason: Family')[0].props.onPress();
    });
    return ctx;
  }

  it('stage 1 → stage 2 reveals the reason input; Back returns to stage 1', async () => {
    const { root } = await openSheet();
    expect(findButtonByText(root, 'Reject request')).toBeUndefined();
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    expect(findButtonByText(root, 'Reject request')).toBeDefined();
    expect(findButtonByText(root, 'Back')).toBeDefined();
    expect(textsInOrder(root)).toContain('0 / 500');
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(findButtonByText(root, 'Reject request')).toBeUndefined();
    expect(findButtonByText(root, 'Reject')).toBeDefined();
  });

  it('the empty reason is valid — the wire omits the field', async () => {
    rejectLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'rejected' }));
    const { root } = await openSheet();
    const callsAfterOpen = leaveSummary.mock.calls.length;
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    await act(async () => {
      findButtonByText(root, 'Reject request')!.props.onPress();
    });
    expect(rejectLeave).toHaveBeenCalledWith('r1', undefined);
    expect(announce).toHaveBeenCalledWith('Leave rejected');
    // The sheet-hosted write refreshes the pills snapshot in the SAME pass
    // (the same bookkeeping the inline write got; this call used to be
    // asserted for the inline path only — the review's verification gap).
    expect(leaveSummary.mock.calls.length).toBe(callsAfterOpen + 1);
  });

  it('the Reject-request button carries the danger variant', async () => {
    rejectLeave.mockResolvedValue(leaveRow({ id: 'r1', status: 'rejected' }));
    const { root } = await openSheet();
    await act(async () => {
      findButtonByText(root, 'Reject')!.props.onPress();
    });
    const rejectRequest = findButtonByText(root, 'Reject request')!;
    expect(rejectRequest.props.variant).toBe('danger');
    expect(rejectRequest.props.fullWidth).toBe(true);
  });
});

describe('the landing param channel always fetches fresh (17-6 review P1)', () => {
  it('a param-driven landing refetches even a loaded, non-stale filter (the born-approved request is visible)', async () => {
    const { renderer, navigation } = await renderScreen();
    // Both filters loaded, nothing stale.
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], null))
      .mockResolvedValueOnce(page([leaveRow({ id: 'a1', status: 'approved' })], null));
    await act(async () => {
      findPill(renderer.root, 'All')[0].props.onPress();
    });
    const callsAfterLoad = listOwnerLeave.mock.calls.length;
    // The on-behalf landing: navigate('OwnerLeave', { tab: 'requests',
    // filter: 'all' }) merges the params while the owner is already parked
    // on the Needs-review filter.
    renderer.update(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params: { tab: 'requests', filter: 'all' } } as never}
      />,
    );
    await act(async () => {});
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it('a same-filter landing param refreshes a quiet, loaded filter', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    const { renderer, navigation } = await renderScreen();
    const callsAfterLoad = listOwnerLeave.mock.calls.length;
    // The notification landing while the owner is parked on Needs-review:
    // the merged param appears where there was none (the real popTo merge).
    renderer.update(
      <OwnerLeaveScreen
        navigation={navigation as never}
        route={{ params: { tab: 'requests', filter: 'pending' } } as never}
      />,
    );
    await act(async () => {});
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsAfterLoad);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
  });
});

describe('the load-more interleave guards (17-6 review P2)', () => {
  function focusCallback(navigation: Nav): () => void {
    const calls = (navigation.addListener as jest.Mock).mock.calls as [
      string,
      () => void,
    ][];
    const entry = calls.find(([event]) => event === 'focus');
    expect(entry).toBeDefined();
    return entry![1];
  }

  it('focus during an in-flight load-more marks stale and defers — no interleaved refetch', async () => {
    // The load-more hangs until the test releases it.
    let releaseLoadMore: (v: unknown) => void = () => undefined;
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-1'))
      .mockImplementationOnce(
        () => new Promise(resolve => (releaseLoadMore = resolve)),
      );
    const { root, navigation } = await renderScreen();
    const list = root.findAllByType(FlatList)[0];
    await act(async () => {
      list.props.onEndReached();
    });
    const callsDuringLoadMore = listOwnerLeave.mock.calls.length;
    await act(async () => {
      focusCallback(navigation)();
    });
    // No first-page refetch raced the load-more…
    expect(listOwnerLeave.mock.calls.length).toBe(callsDuringLoadMore);
    // …the load-more settles, and the stale mark forces the NEXT focus.
    await act(async () => {
      releaseLoadMore(page([leaveRow({ id: 'p2' })], null));
    });
    await act(async () => {
      focusCallback(navigation)();
    });
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThan(callsDuringLoadMore);
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 });
  });

  it('pull-to-refresh during an in-flight load-more is a no-op', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], 'CUR-1'))
      .mockReturnValueOnce(new Promise(() => undefined));
    const { root } = await renderScreen();
    const list = root.findAllByType(FlatList)[0];
    await act(async () => {
      list.props.onEndReached();
    });
    const callsDuringLoadMore = listOwnerLeave.mock.calls.length;
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    expect(listOwnerLeave.mock.calls.length).toBe(callsDuringLoadMore);
  });
});

describe('revoke — the owner stage inside the detail sheet (17-7 spec D3)', () => {
  function approvedRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
    return leaveRow({
      id: 'a1',
      status: 'approved',
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      totalDays: 5,
      dates: [
        { date: '2026-10-05', state: 'approved' },
        { date: '2026-10-06', state: 'approved' },
        { date: '2026-10-07', state: 'approved' },
        { date: '2026-10-08', state: 'approved' },
        { date: '2026-10-09', state: 'approved' },
      ],
      ...overrides,
    });
  }

  function revokePreview(overrides: Partial<LeaveActionPreview> = {}): LeaveActionPreview {
    return {
      action: 'revoke',
      actionDates: ['2026-10-07', '2026-10-08', '2026-10-09'],
      keepDates: [
        { date: '2026-10-05', state: 'approved', reason: 'past' },
        { date: '2026-10-06', state: 'approved', reason: 'cutoff_passed' },
      ],
      request: approvedRow(),
      ...overrides,
    };
  }

  /** Opens the All filter with one Approved row, then its detail sheet. */
  async function openApprovedRow() {
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([approvedRow()], null));
    const ctx = await renderScreen();
    await act(async () => {
      findPill(ctx.root, 'Approved')[0].props.onPress();
    });
    await act(async () => {
      ctx.root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    return ctx;
  }

  it('an Approved row gains the outline-danger entry; a Pending row keeps Reject/Approve', async () => {
    listOwnerLeave
      .mockResolvedValueOnce(page([leaveRow()], null))
      .mockResolvedValueOnce(page([approvedRow()], null));
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    expect(findButtonByText(root, 'Revoke leave')).toBeUndefined();
    // Switch to the Approved filter and open the approved row.
    await act(async () => {
      findPill(root, 'Approved')[0].props.onPress();
    });
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    const entry = findButtonByText(root, 'Revoke leave')!;
    expect(entry).toBeDefined();
    expect(entry.props.variant).toBe('secondary');
    expect(entry.props.labelColor).toBe(colors.danger);
  });

  it('entering the stage swaps the title/subtitle and refetches the preview per entry', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    const sheet = root.findAllByType(Sheet)[0];
    expect(sheet.props.title).toBe('Revoke leave');
    expect(sheet.props.subtitle).toBe('Arya · 5–9 Oct 2026');
    expect(previewRevoke).toHaveBeenCalledWith('a1');
    // Back returns to the detail stage…
    await act(async () => {
      findButtonByText(root, 'Back')!.props.onPress();
    });
    expect(sheet.props.title).toBe('Arya');
    // …and re-entering fetches the preview AGAIN (never cached).
    const callsAfterFirstEntry = previewRevoke.mock.calls.length;
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    expect(previewRevoke.mock.calls.length).toBe(callsAfterFirstEntry + 1);
  });

  it('the split preview gates the confirm on the reason; the trimmed reason travels', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(approvedRow());
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    const confirm = findButtonByText(root, 'Revoke remaining days')!;
    expect(confirm).toBeDefined();
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true });
    await act(async () => {
      sheetInput(root).props.onChangeText('  Policy violation  ');
    });
    expect(confirm.props.disabled).toBe(false);
    await act(async () => {
      confirm.props.onPress();
    });
    expect(revokeLeave).toHaveBeenCalledWith('a1', 'Policy violation');
    // Same mirror contract as approve/reject: the badge and banner read it.
    expect(loadMyProfile).toHaveBeenCalledWith({ force: true });
  });

  it('success morphs back to the refreshed detail; the row is replaced and EVERY filter goes stale', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        dates: [
          { date: '2026-10-05', state: 'approved' },
          { date: '2026-10-06', state: 'approved' },
          { date: '2026-10-07', state: 'revoked' },
          { date: '2026-10-08', state: 'revoked' },
          { date: '2026-10-09', state: 'revoked' },
        ],
      }),
    );
    const { root } = await openApprovedRow();
    const callsAfterOpen = leaveSummary.mock.calls.length;
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(announce).toHaveBeenCalledWith('Leave revoked');
    // The sheet-hosted write refreshes the pills snapshot in the SAME pass
    // (the same bookkeeping the inline write got — the review's gap).
    expect(leaveSummary.mock.calls.length).toBe(callsAfterOpen + 1);
    const sheet = root.findAllByType(Sheet)[0];
    // The stage morphed back to the refreshed detail view — the sheet is
    // OPEN on it (approve/reject close; revoke stays).
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Arya');
    // The approved filter's row is the WRITE view (split revoke: chip stays
    // Approved; the suffix appears).
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data[0].status).toBe('approved');
    expect(data[0].dates.map(d => d.state)).toEqual([
      'approved',
      'approved',
      'revoked',
      'revoked',
      'revoked',
    ]);
    // The RENDERED card carries the split suffix as its own quiet line
    // under the date strip (17-7 review P7 — the walkthrough's headline
    // visual; the old row composed it into one string).
    expect(textsInOrder(root)).toContain('5–9 Oct 2026');
    expect(textsInOrder(root)).toContain('3 working days');
    expect(textsInOrder(root)).toContain('3 of 5 days revoked');
    // The refresh morph re-fetched the preview; the stale mark refetches
    // the pending filter on entry.
    const callsBeforeSwitch = listOwnerLeave.mock.calls.length;
    await act(async () => {
      findPill(root, 'Needs review')[0].props.onPress();
    });
    expect(listOwnerLeave.mock.calls.length).toBe(callsBeforeSwitch + 1);
  });

  it('the Leave-type row survives the revoke morph (the write view carries no enrichment)', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    // The write response carries none of the list-only enrichments — the
    // morph keeps the opened row's, or the sheet's Leave-type row would
    // vanish right after the decision (the review, 2026-11-26).
    revokeLeave.mockResolvedValue(
      approvedRow({
        status: 'revoked',
        dates: approvedRow().dates.map(d => ({ ...d, state: 'revoked' })),
      }),
    );
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(page([approvedRow({ leaveTypeName: 'Earned Leave' })], null));
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'Approved')[0].props.onPress();
    });
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    expect(textsInOrder(root)).toContain('Leave type');
    expect(textsInOrder(root)).toContain('Earned Leave');
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    // The morphed detail view still names the request's own type.
    expect(textsInOrder(root)).toContain('Leave type');
    expect(textsInOrder(root)).toContain('Earned Leave');
  });

  it('a FULL revoke flips the chip — the refreshed detail has no revoke entry', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        status: 'revoked',
        dates: approvedRow().dates.map(d => ({ ...d, state: 'revoked' })),
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
    expect(findButtonByText(root, 'Revoke leave')).toBeUndefined();
  });

  it('own-retry 200 answers the BARE view (no split arrays) and still succeeds', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    // The own-retry view carries NO revokedDates — handlers must never
    // read the optional arrays unconditionally.
    const bare: Record<string, unknown> = { ...approvedRow() };
    delete bare.revokedDates;
    delete bare.employeeName;
    revokeLeave.mockResolvedValue(bare as unknown as LeaveRequestRow);
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Second attempt');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(announce).toHaveBeenCalledWith('Leave revoked');
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
  });

  it('409 LEAVE_NOT_REVOKABLE: the notice + OK closes the WHOLE sheet and refetches', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockRejectedValue({
      status: 409,
      code: 'LEAVE_NOT_REVOKABLE',
      message: 'No future dates left to revoke',
    });
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    const notices = root.findAllByType(InlineNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].props.message).toBe('This request was already handled');
    // The visible filter refetched the row's truth.
    expect(listOwnerLeave.mock.calls.length).toBeGreaterThanOrEqual(3);
    await act(async () => {
      findButtonByText(root, 'OK')!.props.onPress();
    });
    expect(root.findAllByType(LeaveDetailSheet)[0].props.visible).toBe(false);
  });

  it('an offline revoke names the action in the transport line', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(textsInOrder(root)).toContain(
      "You're offline. Revoking needs a working connection.",
    );
  });

  it('the sheet is dismissible={false} while the revoke write is in flight', async () => {
    previewRevoke.mockResolvedValue(revokePreview());
    let releaseWrite!: (v: LeaveRequestRow) => void;
    revokeLeave.mockReturnValue(
      new Promise<LeaveRequestRow>(resolve => {
        releaseWrite = resolve;
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(true);
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(false);
    releaseWrite(approvedRow());
    await act(async () => {});
    expect(root.findAllByType(Sheet)[0].props.dismissible).toBe(true);
  });

  it('divergence is absorbed silently: the WRITE response drives the detail, not the preview', async () => {
    // The preview promised 3 actionable days; by confirm time an employee
    // check-in had auto-cancelled one — the write view is authoritative.
    previewRevoke.mockResolvedValue(revokePreview());
    revokeLeave.mockResolvedValue(
      approvedRow({
        dates: [
          { date: '2026-10-05', state: 'approved' },
          { date: '2026-10-06', state: 'approved' },
          { date: '2026-10-07', state: 'cancelled' },
          { date: '2026-10-08', state: 'revoked' },
          { date: '2026-10-09', state: 'revoked' },
        ],
      }),
    );
    const { root } = await openApprovedRow();
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    await act(async () => {
      sheetInput(root).props.onChangeText('Policy violation');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    // The refreshed detail renders the WRITE view's per-day truth (the
    // auto-cancelled day visible in the split block).
    expect(root.findAllByType(Sheet)[0].props.title).toBe('Arya');
    expect(textsInOrder(root)).toContain('7 Oct 2026');
    const data = root.findByType(FlatList).props.data as LeaveRequestRow[];
    expect(data[0].dates[2].state).toBe('cancelled');
  });
});

beforeEach(() => {
  mockCanWrite = true;
});

describe('a viewer (read-only)', () => {
  it('sees one plain "View-only access" explanation and no leave list', async () => {
    mockCanWrite = false;
    const { root } = await renderScreen();

    expect(textsInOrder(root).join(' ')).toContain('View-only access');
    expect(root.findAllByType(LeaveRequestCard)).toHaveLength(0);
    expect(root.findAllByType(SegmentedControl)).toHaveLength(0);
  });

  it('never asks the backend for leave requests (they can carry medical reasons)', async () => {
    mockCanWrite = false;
    await renderScreen();

    expect(listOwnerLeave).not.toHaveBeenCalled();
    expect(attendanceLeaveService.leaveSummary).not.toHaveBeenCalled();
    expect(approveLeave).not.toHaveBeenCalled();
    expect(rejectLeave).not.toHaveBeenCalled();
  });

  it('has no "Apply on behalf" entry', async () => {
    mockCanWrite = false;
    const { root } = await renderScreen();

    expect(findButtons(root, 'Apply on behalf')).toHaveLength(0);
  });

  it('can still go back', async () => {
    mockCanWrite = false;
    const { root, navigation } = await renderScreen();
    const back = root.findAll(n => n.props.accessibilityLabel === 'Go back' && typeof n.props.onPress === 'function');

    expect(back.length).toBeGreaterThan(0);
    act(() => {
      back[0].props.onPress();
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

describe('OwnerLeaveScreen — embedded pane chrome (the tab host)', () => {
  beforeEach(() => {
    mockCanWrite = true;
  });

  it('embedded: the pushed back header and the top SafeArea edge stay behind', async () => {
    await renderScreen({}, { embedded: true });

    expect(lastRenderer!.root.findAllByType(ScreenHeader as never)).toHaveLength(0);
    // The composite SafeAreaView carries the array prop as passed (the
    // native host normalises it to an object — not matched here).
    const safeAreas = lastRenderer!.root.findAllByType(SafeAreaView as never);
    expect(safeAreas).toHaveLength(1);
    expect(safeAreas[0].props.edges).toEqual([]);
  });
});

describe('post-write bookkeeping (found on device, 2026-11-26)', () => {
  const summary = (overrides: Partial<{ pending: number; approved: number; revoked: number; cancelled: number; rejected: number }> = {}) => ({
    activeEmployees: 2,
    counts: { pending: 0, approved: 0, revoked: 0, cancelled: 0, rejected: 0, ...overrides },
  });

  it('an inline approve refreshes the pills snapshot in the SAME pass (stale pills contradicted the badge)', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow()], null));
    leaveSummary
      .mockResolvedValueOnce(summary({ pending: 1 }))
      .mockResolvedValueOnce(summary({ pending: 0 }));
    const { root } = await renderScreen();
    const callsAfterMount = leaveSummary.mock.calls.length;
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    expect(leaveSummary.mock.calls.length).toBe(callsAfterMount + 1);
  });

  it('a 409 already-handled approve refreshes the pills snapshot too', async () => {
    listOwnerLeave.mockResolvedValue(page([leaveRow()], null));
    approveLeave.mockRejectedValueOnce({ status: 409, code: 'LEAVE_NOT_PENDING', message: 'x' });
    const { root } = await renderScreen();
    const callsAfterMount = leaveSummary.mock.calls.length;
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onApprove();
    });
    expect(textsInOrder(root)).toContain('This request was already handled');
    expect(leaveSummary.mock.calls.length).toBe(callsAfterMount + 1);
  });

  it('a revoke success re-fetches the sheet balances (the employeeId never changed)', async () => {
    // The split preview (a kept day) so the confirm reads 'Revoke
    // remaining days' — keepDates [] reads 'whole' and the confirm is
    // labelled 'Revoke leave' instead (leaveConfirmContext).
    previewRevoke.mockResolvedValue({
      action: 'revoke',
      actionDates: ['2026-10-07'],
      keepDates: [{ date: '2026-10-05', state: 'approved', reason: 'past' }],
      request: leaveRow({
        id: 'a1',
        status: 'approved',
        dates: [
          { date: '2026-10-05', state: 'approved' },
          { date: '2026-10-07', state: 'approved' },
        ],
      }),
    });
    listOwnerLeave
      .mockResolvedValueOnce(page([], null))
      .mockResolvedValueOnce(
        page([
          leaveRow({
            id: 'a1',
            status: 'approved',
            dates: [{ date: '2026-10-05', state: 'approved' }],
          }),
        ], null),
      );
    // Persistent (not Once-chained): the post-write refetch must not
    // depend on queue arithmetic — a leaked Once would starve the NEXT
    // test's own fetch.
    getEmployeeBalances.mockResolvedValue([]);
    const { root } = await renderScreen();
    await act(async () => {
      findPill(root, 'Approved')[0].props.onPress();
    });
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    const opensAfterOpen = getEmployeeBalances.mock.calls.length;
    revokeLeave.mockResolvedValue(
      leaveRow({
        id: 'a1',
        status: 'revoked',
        dates: [{ date: '2026-10-05', state: 'revoked' }],
      }),
    );
    await act(async () => {
      findButtonByText(root, 'Revoke leave')!.props.onPress();
    });
    // The confirm is gated on the reason too (the disabled button is a
    // no-op) — type before pressing.
    await act(async () => {
      sheetInput(root).props.onChangeText('QA overnight revoke test');
    });
    await act(async () => {
      findButtonByText(root, 'Revoke remaining days')!.props.onPress();
    });
    expect(getEmployeeBalances.mock.calls.length).toBe(opensAfterOpen + 1);
  });

  it('the sheet names whose balances these are — the admin reads someone else\'s numbers', async () => {
    listOwnerLeave.mockResolvedValueOnce(page([leaveRow({ employeeName: 'Priya Reddy' })], null));
    getEmployeeBalances.mockResolvedValue([
      {
        typeId: 't1',
        code: 'earned',
        name: 'Earned Leave',
        accrualMode: 'monthly',
        accrualDays: 1,
        paid: true,
        enabled: true,
        credits: 0,
        accrued: 6,
        carryForward: 0,
        consumed: 0,
        remaining: 6,
      },
    ]);
    const { root } = await renderScreen();
    await act(async () => {
      root.findAllByType(LeaveRequestCard)[0].props.onPress();
    });
    expect(textsInOrder(root)).toContain("Priya's leave balances");
    expect(textsInOrder(root)).not.toContain('Your leave balances');
  });

  it('the framing line renders on the Config pane only (the Requests stack stays short)', async () => {
    listOwnerLeave.mockResolvedValue(page([], null));
    const { root } = await renderScreen();
    expect(textsInOrder(root)).not.toContain(
      "The leave your team can take, and the requests waiting on you — set each type's rules once, decide requests as they come.",
    );
    await act(async () => {
      root.findAllByType(SegmentedControl)[0].props.onChange('types');
    });
    expect(textsInOrder(root)).toContain(
      "The leave your team can take, and the requests waiting on you — set each type's rules once, decide requests as they come.",
    );
  });

  it('an empty non-All filter with requests elsewhere gains the grounded "See all N" switch', async () => {
    listOwnerLeave.mockResolvedValue(page([], null));
    leaveSummary.mockResolvedValue(
      summary({ approved: 5, rejected: 3 }),
    );
    const { root } = await renderScreen();
    const seeAll = findButtonByText(root, 'See all 8 requests');
    expect(seeAll).toBeDefined();
    await act(async () => {
      seeAll!.props.onPress();
    });
    expect(listOwnerLeave).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it('no "See all" switch when the tenant has no other requests (zero counts)', async () => {
    listOwnerLeave.mockResolvedValue(page([], null));
    leaveSummary.mockResolvedValue(summary());
    const { root } = await renderScreen();
    expect(findButtonByText(root, 'See all 0 requests')).toBeUndefined();
  });

  it('the pills show their per-status counts; the counts and totals go quiet while a needle is committed', async () => {
    listOwnerLeave.mockResolvedValue(page([], null));
    leaveSummary.mockResolvedValue(summary({ pending: 4, approved: 11 }));
    const { root } = await renderScreen();
    // The pills carry their own statuses' numbers; the totals line sums
    // the five (the pill-count contract — the review's verification gap:
    // no test ever read a pill's number).
    expect(textsInOrder(root)).toContain('15 total · 4 need review');
    expect(findPill(root, 'Needs review')[0].findAll(n => n.type === Text).map(flatText)).toContain('4');
    expect(findPill(root, 'Approved')[0].findAll(n => n.type === Text).map(flatText)).toContain('11');

    // A committed needle narrows the list — the whole-tenant numbers would
    // contradict it, so they quiet down with the totals line (the pane's
    // `narrowed` read; used to be unasserted).
    jest.useFakeTimers();
    try {
      await act(async () => {
        root.findAllByType(Input)[0].props.onChangeText('sick');
      });
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(textsInOrder(root)).not.toContain('15 total · 4 need review');
      expect(
        findPill(root, 'Approved')[0].findAll(n => n.type === Text).map(flatText),
      ).not.toContain('11');
    } finally {
      jest.useRealTimers();
    }
  });
});
