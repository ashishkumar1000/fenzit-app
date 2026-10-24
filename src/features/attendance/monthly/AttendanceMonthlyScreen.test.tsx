/**
 * Tests for the FR-25 owner monthly SCREEN (Story 19-5, spec §5.3, as
 * built per D4/D5/D8/D9). The screen is a read-only renderer over ONE
 * monthly envelope; the requirements these pin:
 *
 *  - ONE fetch per appearance: the first focus IS the initial load (the
 *    useFocusEffect contract); no mount fetch ever runs.
 *  - the device-seeded CURRENT month is the bootstrap (owner ruling
 *    2026-10-23): before the echo lands its end clamps to the DEVICE date
 *    (the seeded month reaches into the future); the skeleton stands in
 *    labelled "Loading attendance", then the rows swap in.
 *  - the echo-correction fires ONCE when the echo's current month differs
 *    (device vs server drift) and no navigation happened; a user
 *    navigation stands it down.
 *  - rows render name/office/chips with per-chip family colours; a tap
 *    navigates with {employeeId, employeeName, yearMonth}.
 *  - month nav is the chip strip (2026-10 owner redesign): a sticky year
 *    tag for the SELECTED month's year, month-name-only chips, the
 *    selected chip highlighted, chips past the real current month
 *    disabled — and the WHOLE strip locks while a parameter load is in
 *    flight.
 *  - a month switch fetches the CLAMPED window and a failure reverts the
 *    {month, office} PAIR; the seq-guard drops older-resolves-late
 *    responses (never commit, never revert).
 *  - office filter: the sheet runs stats-null (name-only rows); Apply
 *    refetches with the officeId; a failed pick reverts.
 *  - empty → the EmptyState copy (no "yet"); first-load failure → the
 *    composition with the MONTHLY message; focus refetch keeps last-good
 *    and reloads the VIEWED month/office; AppState-active refetches only
 *    while focused.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../services', () => ({
  fetchMonthly: jest.fn(),
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { act, create } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMonthly, officesService } from '../../../services';
import { monthRange } from '../../../services/resources/attendanceDayStatus';
import type { AttendanceMonthlyData } from '../../../services';
import { colors } from '../../../theme';
import AttendanceMonthlyScreen from './AttendanceMonthlyScreen';
import ScreenHeader from '../offices/ScreenHeader';
import { monthAbbr, shiftYearMonth } from './monthlyModel';
import { MONTHLY_ERROR_COPY } from './useMonthlyData';
import { LoadErrorRetry } from '../dashboard/LoadErrorRetry';
import { OfficeFilterSheet } from '../dashboard/OfficeFilterSheet';
import { Skeleton } from '../../../components/ui';

const fetchMock = fetchMonthly as jest.Mock;
const officesListMock = officesService.list as jest.Mock;

/** The device clock seeds which month to LOOK at first (declared
 *  scaffolding, D4) — and since the owner ruling 2026-10-23 that seed is
 *  THE CURRENT MONTH. The tests derive the SAME seed from the clock. */
function deviceThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function deviceToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
const SEED = deviceThisMonth();
const PREV_MONTH = shiftYearMonth(SEED, -1);
const NEXT_MONTH = shiftYearMonth(SEED, 1);
/** An echo whose canonical default equals the seed → the bootstrap
 *  correction must NOT fire (mid-device-month, so the clamp is real). */
const ECHO_TODAY = `${SEED}-15`;

/** The strip chip's accessible name ('Oct 2026') for a 'YYYY-MM' — the
 *  month short name from the ONE canonical table. */
function chipLabel(ym: string): string {
  return `${monthAbbr(ym)} ${ym.slice(0, 4)}`;
}

/** The strip chip for a month — the composite Pressable is mirrored by a
 *  host View carrying the same label; the Pressable owns the onPress. */
function chip(
  renderer: ReactTestRenderer.ReactTestRenderer,
  ym: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === chipLabel(ym) &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** Every strip chip Pressable (the strip is static chrome — it renders
 *  in every posture). */
function chips(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      /^\w{3} \d{4}$/.test(node.props.accessibilityLabel) &&
      typeof node.props.onPress === 'function',
  );
}

/** A wire-valid employee row. */
function employee(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    employeeId: 'e1',
    employeeName: 'Asha',
    officeId: 'o1',
    officeName: 'Andheri West',
    summary: {
      daysWorked: 18,
      halfDays: 2,
      lateCount: 0,
      leave: 0,
      weeklyOffs: 2,
      holidays: 0,
      workedOnHoliday: 0,
      absent: 1,
      checkoutMissing: 0,
    },
    ...overrides,
  };
}

/** A fully valid envelope for the seed month (echo = this month's 15th —
 *  canonical default = the seed, so no correction). */
function envelope(overrides: Record<string, unknown> = {}): AttendanceMonthlyData {
  return {
    from: `${SEED}-01`,
    to: monthRange(SEED).to,
    today: ECHO_TODAY,
    employees: [employee(), employee({ employeeId: 'e2', employeeName: 'Ben' })],
    ...overrides,
  } as unknown as AttendanceMonthlyData;
}

let consumedFocusCalls = 0;

async function fireFocus() {
  const calls = (useFocusEffect as jest.Mock).mock.calls.slice(consumedFocusCalls);
  consumedFocusCalls = (useFocusEffect as jest.Mock).mock.calls.length;
  expect(calls.length).toBeGreaterThan(0);
  await act(async () => {
    calls.forEach(call => call[0]());
  });
}

async function flush(times = 5) {
  // act-wrapped (the month-detail helper's shape) — a state update that
  // lands in here must never ride outside act.
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The composite Pressable is mirrored by a host View in the RTR tree —
 *  require the onPress (the house idiom). */
function findButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** All Text contents, string children joined (fragments render as arrays). */
function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The screen's refetch-error banner — its onRetry callables. */
function retries(renderer: ReactTestRenderer.ReactTestRenderer): Array<() => void> {
  return renderer.root
    .findAllByType(LoadErrorRetry as never)
    .map(block => block.props.onRetry as () => void);
}

/** The EmptyState's Retry CTA (the first-load failure's retry): the
 *  'Retry' Text walked up to its onPress-carrying ancestor. */
function retryPress(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance {
  const text = renderer.root.find(
    node => node.type === Text && node.props.children === 'Retry',
  );
  let node = text.parent;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  expect(node).not.toBeNull();
  return node!;
}

/** A chip Text's applied colour (the atomic chip's family fg). */
function chipColor(
  renderer: ReactTestRenderer.ReactTestRenderer,
  prefix: string,
): string | undefined {
  const chip = renderer.root
    .findAllByType(Text)
    .find(t =>
      (Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? '')
      ).startsWith(prefix),
    );
  expect(chip).toBeDefined();
  const style = Array.isArray(chip!.props.style)
    ? chip!.props.style.find((s: Record<string, unknown>) => s && 'color' in s)
    : chip!.props.style;
  return style?.color as string | undefined;
}

function renderScreen(opts: { embedded?: boolean } = {}) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => true),
    isFocused: jest.fn(() => true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceMonthlyScreen
        navigation={navigation as never}
        route={{} as never}
        embedded={opts.embedded}
      />,
    );
  });
  return { renderer, navigation };
}

describe('AttendanceMonthlyScreen — embedded pane chrome (the tab host)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('embedded: the pushed back header and the top SafeArea edge stay behind', () => {
    const { renderer } = renderScreen({ embedded: true });

    expect(renderer.root.findAllByType(ScreenHeader as never)).toHaveLength(0);
    // The composite SafeAreaView carries the array prop as passed (the
    // native host normalises it to an object — not matched here).
    const safeAreas = renderer.root.findAllByType(SafeAreaView as never);
    expect(safeAreas).toHaveLength(1);
    expect(safeAreas[0].props.edges).toEqual([]);
  });
});

describe('AttendanceMonthlyScreen — bootstrap + loading postures', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('does NOT fetch on mount — the first focus is the initial load', async () => {
    fetchMock.mockResolvedValue(envelope());
    renderScreen();
    expect(fetchMock).not.toHaveBeenCalled();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches the device-seeded CURRENT month, its end clamped to the device date pre-echo', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    // The seeded month reaches into the future; before any wire echo the
    // window ends at the device date (never a full future range).
    expect(fetchMock.mock.calls[0].slice(0, 2)).toEqual([
      `${SEED}-01`,
      deviceToday(),
    ]);
    // The month shows through the strip: the sticky year tag + the
    // selected chip.
    expect(texts(renderer)).toContain(SEED.slice(0, 4));
    expect(chip(renderer, SEED).props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
  });

  it('shows the labelled Skeleton BEFORE the fetch settles, then the rows', async () => {
    let resolve!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolve = r;
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();

    // In flight: the chrome is up, the labelled skeleton stands in.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('All offices');
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      renderer.root.findAllByType(Skeleton as never).length,
    ).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolve(envelope());
      await flush();
    });
    const shown = texts(renderer);
    expect(shown).toContain('Asha');
    expect(shown).toContain('Ben');
    expect(shown).toContain('17 full');
    expect(shown).toContain('Andheri West · 2 weekly offs');
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
  });

  it('exactly ONE fetch on first appearance', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('Asha');
  });

  it('the echo-correction fires ONCE when the echo current-month differs (device vs server drift)', async () => {
    // The echo says NEXT month is "today" (a server clock ahead across a
    // month boundary) → the canonical default NEXT month differs from the
    // device-seeded current month.
    const laterEcho = `${NEXT_MONTH}-10`;
    // The ongoing wire speaks with the server's clock: every later
    // envelope carries the NEXT-month echo (that IS the drift).
    fetchMock
      .mockResolvedValueOnce(envelope({ today: laterEcho }))
      .mockResolvedValue(envelope({ today: laterEcho, from: `${NEXT_MONTH}-01` }));
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();

    // The month corrected to the canonical default and REFETCHED it as a
    // PARAMETER load — the echo's today sits INSIDE that month, so the
    // window clamps to the echo's date (the server's clock draws it now).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${NEXT_MONTH}-01`,
      laterEcho,
    ]);
    expect(chip(renderer, NEXT_MONTH).props.accessibilityState).toMatchObject({
      selected: true,
    });

    // A later focus refetch must NOT re-correct (computed once).
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2].slice(0, 2)).toEqual([
      `${NEXT_MONTH}-01`,
      laterEcho,
    ]);
  });

  it('a USER navigation stands the echo-correction down', async () => {
    const laterEcho = `${NEXT_MONTH}-10`;
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      // The navigation's load answers for the NAVIGATED month with a
      // differing echo — the correction must stand down.
      .mockResolvedValue(envelope({ today: laterEcho }));
    const { renderer } = renderScreen();
    await fireFocus();
    await flush();

    // First load failed → the owner taps a month chip (their choice);
    // that load IS the retry.
    await act(async () => {
      chip(renderer, PREV_MONTH).props.onPress();
      await flush();
    });

    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${PREV_MONTH}-01`,
      monthRange(PREV_MONTH).to,
    ]);
    expect(chip(renderer, PREV_MONTH).props.accessibilityState).toMatchObject({
      selected: true,
    });
    // No correction refetch followed (their choice stands).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a first-load failure renders the centered EmptyState with the MONTHLY copy and its Retry CTA', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom: developer-shaped'));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    // The 2026-10-23 owner pattern: art + copy + Retry in one centered
    // block — title and description are separate Texts of the same copy.
    expect(shown).toContain("Couldn't load the monthly view");
    expect(shown).toContain('Check your connection and try again.');
    expect(shown).not.toContain("Couldn't load the dashboard");
    // No LoadErrorRetry banner — the EmptyState's CTA is the retry.
    expect(retries(renderer)).toHaveLength(0);

    // Retry succeeds → the rows render, the block leaves.
    fetchMock.mockResolvedValueOnce(envelope());
    await act(async () => {
      retryPress(renderer).props.onPress();
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
    expect(texts(renderer)).not.toContain("Couldn't load the monthly view");
  });

  it('empty → the EmptyState copy inside the plain ScrollView (no "yet")', async () => {
    fetchMock.mockResolvedValue(envelope({ employees: [] }));
    const { renderer } = renderScreen();
    await fireFocus();
    const shown = texts(renderer);
    expect(shown).toContain('No attendance to review');
    expect(shown).toContain(
      'No one has tracked days in this month. Try another month or office.',
    );
    expect(shown.some(t => t.includes('yet'))).toBe(false);
  });
});

describe('AttendanceMonthlyScreen — rows', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('renders chips with their family colours (all six families pinned)', async () => {
    // A summary where every chip renders (late/leave/checkoutMissing are
    // zero-suppressed in the default fixture) — a wrong token on ANY of
    // the six must fail CI.
    fetchMock.mockResolvedValue(
      envelope({
        employees: [
          employee({
            summary: {
              daysWorked: 18,
              halfDays: 2,
              lateCount: 1,
              leave: 2.5,
              weeklyOffs: 2,
              holidays: 0,
              workedOnHoliday: 0,
              absent: 1,
              checkoutMissing: 1,
            },
          }),
        ],
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    expect(chipColor(renderer, '17 full')).toBe(colors.status.done.fg);
    expect(chipColor(renderer, '2 half days')).toBe(colors.status.scheduled.fg);
    expect(chipColor(renderer, '1 late')).toBe(colors.status.scheduled.fg);
    expect(chipColor(renderer, '2.5 leave')).toBe(colors.status.leave.fg);
    expect(chipColor(renderer, '1 absent')).toBe(colors.status.cancelled.fg);
    expect(chipColor(renderer, '1 missing check-out')).toBe(
      colors.status.checkoutMissing.fg,
    );
  });

  it('a ZERO worked chip renders the neutral grey (success needs count > 0)', async () => {
    fetchMock.mockResolvedValue(
      envelope({
        employees: [
          employee({
            summary: {
              daysWorked: 0,
              halfDays: 0,
              lateCount: 0,
              leave: 0,
              weeklyOffs: 2,
              holidays: 0,
              workedOnHoliday: 0,
              absent: 0,
              checkoutMissing: 0,
            },
          }),
        ],
      }),
    );
    const { renderer } = renderScreen();
    await fireFocus();
    expect(chipColor(renderer, '0 worked')).toBe(colors.status.neutral.fg);
  });

  it('a row tap navigates to the drill-down with the viewed month', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer, navigation } = renderScreen();
    await fireFocus();
    const ashaRow = renderer.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Asha. '),
    );
    expect(ashaRow).toHaveLength(1);
    // The EXACT assembled label (model-pinned shape, comma-joined).
    expect(ashaRow[0].props.accessibilityLabel).toBe(
      'Asha. 17 full, 2 half days, 1 absent. Andheri West, 2 weekly offs',
    );
    act(() => {
      ashaRow[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceEmployeeMonth', {
      employeeId: 'e1',
      employeeName: 'Asha',
      yearMonth: SEED,
    });
  });
});

describe('AttendanceMonthlyScreen — the month chip strip (the 2026-10 owner redesign)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('renders the sticky year tag, month-name-only chips, the selected chip highlighted and future chips disabled', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // The sticky tag shows the SELECTED month's year.
    expect(texts(renderer)).toContain(SEED.slice(0, 4));
    // The chips print the month only — no 'Oct 2026' chip TEXT (the year
    // lives in the tag and the accessible names).
    const chipTexts = renderer.root
      .findAllByType(Text)
      .map(t =>
        Array.isArray(t.props.children)
          ? t.props.children.join('')
          : String(t.props.children ?? ''),
      )
      .filter(t => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t));
    expect(chipTexts.length).toBeGreaterThanOrEqual(3);

    const seedChip = chip(renderer, SEED);
    expect(seedChip.props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
    // One month earlier: enabled, unselected (unbounded past).
    expect(chip(renderer, PREV_MONTH).props.accessibilityState).toMatchObject({
      selected: false,
      disabled: false,
    });
    // The real future is NEVER pressable (the old ›'s clamp, kept).
    expect(chip(renderer, NEXT_MONTH).props.accessibilityState).toMatchObject({
      selected: false,
      disabled: true,
    });
  });

  it('a chip tap is a PARAMETER load: the fetch is the CLAMPED window, the whole strip locks, the skeleton stands', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Tap the viewed (current) month's chip — a delta-0 reselect still
    // goes through the parameter load (the strip's only entry point).
    let resolveRefetch!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolveRefetch = r;
      }),
    );
    await act(async () => {
      chip(renderer, SEED).props.onPress();
      await flush();
    });
    // The echo is known by now → the window clamps to the echo's date.
    expect(fetchMock.mock.calls[1].slice(0, 2)).toEqual([
      `${SEED}-01`,
      ECHO_TODAY,
    ]);

    // In flight: EVERY chip renders disabled (the acknowledgment AND the
    // race guard) and the row skeleton stands in.
    for (const c of chips(renderer)) {
      expect(c.props.accessibilityState).toMatchObject({ disabled: true });
    }
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // ...and the strip unlocks when the load lands.
    await act(async () => {
      resolveRefetch(envelope({ from: `${SEED}-01` }));
      await flush();
    });
    expect(chip(renderer, SEED).props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
    expect(chip(renderer, PREV_MONTH).props.accessibilityState).toMatchObject({
      disabled: false,
    });
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
  });

  it('a failed month switch reverts the PAIR (month AND office) and shows the fixed copy', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Apply an office first — the pair to revert FROM is {seed, o1}.
    await act(async () => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The month switch FAILS → both axes revert to the last-good pair.
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      chip(renderer, PREV_MONTH).props.onPress();
      await flush();
    });
    // The selected chip is BACK to the seed month.
    expect(chip(renderer, SEED).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(texts(renderer)).toContain('Hero wala');
    expect(texts(renderer)).toContain(MONTHLY_ERROR_COPY);
    expect(retries(renderer)).toHaveLength(1);
    // The revert restores the rows' pair — it does not refetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('the seq-guard: an older-resolves-late load never commits and never reverts', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // A chip tap starts a month load; while it is in flight a focus
    // refetch starts (the non-chip entry points are not loading-gated — a
    // real interleaving). The refetch is the LATEST request.
    const resolvers: Array<(v: AttendanceMonthlyData) => void> = [];
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<AttendanceMonthlyData>(r => {
            resolvers.push(r);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<AttendanceMonthlyData>(r => {
            resolvers.push(r);
          }),
      );
    await act(async () => {
      chip(renderer, PREV_MONTH).props.onPress();
    });
    await fireFocus();
    expect(resolvers).toHaveLength(2);

    // The LATEST request resolves with the month's rows → commit.
    await act(async () => {
      resolvers[1](envelope());
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');

    // The OLDER request resolves late with different rows → dropped: no
    // commit, no error, no revert.
    await act(async () => {
      resolvers[0](
        envelope({
          employees: [employee({ employeeId: 'e9', employeeName: 'STALE' })],
        }),
      );
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
    expect(texts(renderer)).not.toContain('STALE');
    expect(texts(renderer)).not.toContain(MONTHLY_ERROR_COPY);
  });

  it('a focus refetch reloads the VIEWED month (never the defaults) and keeps last-good', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    // Apply an office FIRST — the seam under test is BOTH axes in the
    // refs (a focus refetch after the drill-down reloads the VIEWED
    // month AND office, never the defaults).
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Navigate to the previous month via its chip (settled).
    fetchMock.mockResolvedValueOnce(envelope({ from: `${PREV_MONTH}-01` }));
    await act(async () => {
      chip(renderer, PREV_MONTH).props.onPress();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // A focus refetch with a SLOW response: the last-good rows stay up.
    let resolveFocus!: (v: AttendanceMonthlyData) => void;
    fetchMock.mockReturnValue(
      new Promise<AttendanceMonthlyData>(r => {
        resolveFocus = r;
      }),
    );
    await fireFocus();
    // EVERY focus refetch reloads the VIEWED month AND office — the refs,
    // never the bootstrap defaults (the focus helper may batch the
    // registrations a re-render recorded; the window+office is the contract).
    const post = fetchMock.mock.calls.slice(3);
    expect(post.length).toBeGreaterThanOrEqual(1);
    for (const call of post) {
      expect(call.slice(0, 2)).toEqual([
        `${PREV_MONTH}-01`,
        monthRange(PREV_MONTH).to,
      ]);
      expect(call[2]).toBe('o1');
    }
    expect(texts(renderer)).toContain('Asha'); // last-good, not cleared
    // The silent refetch shows NO skeleton — only parameter loads do
    // (the loader is the month/office switch's answer, not every fetch).
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityLabel === 'Loading attendance',
      ).length,
    ).toBe(0);
    await act(async () => {
      resolveFocus(envelope());
      await flush();
    });
    expect(texts(renderer)).toContain('Asha');
  });
});

describe('AttendanceMonthlyScreen — office filter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
  });

  it('the sheet runs its name-only fallback (stats null); Apply refetches with the officeId', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockResolvedValue(envelope());
    const { renderer } = renderScreen();
    await fireFocus();

    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    const sheet = renderer.root.findAllByType(OfficeFilterSheet as never)[0];
    expect(sheet.props.visible).toBe(true);
    // NO envelope registry here — the sheet fetches its own name-only rows.
    expect(sheet.props.stats).toBeNull();

    await act(async () => {
      sheet.props.onPick({ id: 'o1', name: 'Hero wala' });
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1].slice(0, 3)).toEqual([
      `${SEED}-01`,
      ECHO_TODAY,
      'o1',
    ]);
    expect(texts(renderer)).toContain('Hero wala');
    expect(
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.visible,
    ).toBe(false);
  });

  it('a failed office pick reverts the office AND keeps the month (the pair seam)', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope())
      .mockResolvedValueOnce(envelope())
      .mockRejectedValueOnce(new Error('network down'));
    const { renderer } = renderScreen();
    await fireFocus();

    // First pick commits: {seed, Hero wala}.
    act(() => {
      findButton(renderer, 'Filter by office, currently All offices').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o1',
        name: 'Hero wala',
      });
      await flush();
    });

    // A second pick fails → the selector reverts to Hero wala, rows stay.
    act(() => {
      findButton(renderer, 'Filter by office, currently Hero wala').props.onPress();
    });
    await act(async () => {
      renderer.root.findAllByType(OfficeFilterSheet as never)[0].props.onPick({
        id: 'o2',
        name: 'Yuka',
      });
      await flush();
    });
    expect(texts(renderer)).toContain('Hero wala');
    expect(texts(renderer)).toContain('Asha'); // last-good rows stay
    expect(texts(renderer)).toContain(MONTHLY_ERROR_COPY);
  });
});

describe('AttendanceMonthlyScreen — AppState-active refetch (19-5)', () => {
  let appStateListener: ((state: string) => void) | null = null;

  beforeEach(() => {
    jest.resetAllMocks();
    consumedFocusCalls = 0;
    officesListMock.mockResolvedValue([]);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((
      (_type: string, listener: never) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('foregrounding while focused refetches EXACTLY once; not while unfocused', async () => {
    fetchMock.mockResolvedValue(envelope());
    const { navigation } = renderScreen();
    await fireFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    (navigation.isFocused as jest.Mock).mockReturnValue(false);
    await act(async () => {
      appStateListener?.('active');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      appStateListener?.('background');
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
