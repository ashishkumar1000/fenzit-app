/**
 * Component tests for PunchSection (the 20-3 re-host of the AttendanceTodayView
 * suite — story 16-4's postures over the restyled punch block): the failure
 * posture (no interactive check-in while facts are unknown), the done card
 * REPLACING the button (never both visible), the distinct permission-state
 * labels, and the offline block rendering from STATE (the walkthrough-found
 * defect). useCheckInOut is mocked so each state is driven deterministically;
 * the prescreen is mocked to a no-fix posture; the summary prop carries the
 * AttendanceSummaryState shape.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Linking, Platform, Text } from 'react-native';
import { PunchSection } from './PunchSection';
import { PunchButton } from './PunchButton';
import { ConfirmDialog } from '../../../components/ui';
import { useCheckInOut } from './useCheckInOut';
import { usePunchPrescreen } from './usePunchPrescreen';
import type { AttendanceSummaryState } from '../me/useAttendanceSummary';
import type { AttendanceTodayRecord } from '../../../services/resources/attendanceMe';

jest.mock('./useCheckInOut', () => ({
  useCheckInOut: jest.fn(),
}));

jest.mock('./usePunchPrescreen', () => ({
  usePunchPrescreen: jest.fn(() => ({ fix: null, recapture: jest.fn() })),
}));

jest.mock('../../../hooks', () => ({
  useNow: () => 1_000_000,
}));

const useCheckInOutMock = useCheckInOut as jest.Mock;

function summaryState(
  overrides: Partial<AttendanceSummaryState> = {},
): AttendanceSummaryState {
  return {
    summary: {
      officeId: 'o1',
      officeName: 'Hero wala',
      startTime: '09:00',
      endTime: '16:00',
      lateCutOffMinutes: 15,
      weeklyOffDays: [7],
      officeLatitude: 12.98,
      officeLongitude: 77.74,
      officeRadius: null,
      today: {
        date: '2026-09-29',
        isWeeklyOff: false,
        isHoliday: false,
        holidayName: null,
        isWorkingDay: true,
        leaveState: null,
        leavePart: null,
      },
      todayRecord: null,
    },
    isLoading: false,
    error: null,
    isStale: false,
    ...overrides,
  };
}

const record: AttendanceTodayRecord = {
  checkinAt: '2026-09-29T10:16:00+05:30',
  checkoutAt: '2026-09-29T18:05:00+05:30',
  lateMinutes: 61,
  isLate: true,
  workedMinutes: 469,
  earlyCheckout: false,
  earlyCheckoutMinutes: null,
};

const openRecord: AttendanceTodayRecord = { ...record, checkoutAt: null, workedMinutes: null, earlyCheckout: null, earlyCheckoutMinutes: null };

function hookOverrides(over: Record<string, unknown> = {}) {
  return {
    permission: 'granted',
    online: true,
    resolving: false,
    dialogPending: false,
    message: null,
    rateLimitedUntil: null,
    now: 1_000_000,
    record: null,
    press: jest.fn(),
    seedRecord: jest.fn(),
    openRemediation: jest.fn(),
    dismissMessage: jest.fn(),
    ...over,
  };
}

/** RN Text carries its string in props.children (never props.text) —
 *  the house matcher from the AttendanceTabScreen suite. */
function textContaining(root: ReactTestRenderer.ReactTestRenderer['root'], part: string) {
  return root.findAll(n => {
    if (n.type !== Text) return false;
    const children = n.props.children;
    const flat = Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
    return flat.includes(part);
  });
}

/** The big action is the PunchButton (its own Pressable shell, not a
 *  DS Button) — presence/absence is the state line, never a label string
 *  colliding with the punch card's tile labels. */
function actionButtonsUp(root: ReactTestRenderer.ReactTestRenderer['root']) {
  return root.findAllByType(PunchButton);
}

function renderView(
  summary: AttendanceSummaryState,
  hook: Record<string, unknown>,
): ReactTestRenderer.ReactTestRenderer {
  useCheckInOutMock.mockReturnValue(hookOverrides(hook));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <PunchSection
        summary={{ state: summary, refresh: jest.fn() }}
        refreshSummaryNow={jest.fn(() => Promise.resolve())}
        refreshAccessNow={jest.fn()}
      />,
    );
  });
  // The first-load shimmer's animation loops must be stopped at teardown
  // or the Jest worker crashes (no auto-cleanup in react-test-renderer).
  mountedRenderers.push(renderer);
  return renderer;
}

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(r => r.unmount());
  });
  mountedRenderers.length = 0;
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  (usePunchPrescreen as jest.Mock).mockImplementation(() => ({
    fix: null,
    recapture: jest.fn(),
    adoptFix: jest.fn(),
  }));
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('the button states (one action at a time)', () => {
  it('a fresh working day renders exactly one Check in and no Check out', () => {
    const view = renderView(summaryState(), {});
    expect(textContaining(view.root, 'Check in').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Check out')).toHaveLength(0);
  });

  it('the checked-in state renders the punch card + exactly one Check out button; the tile carries the late verdict', () => {
    const view = renderView(summaryState(), { record: openRecord });
    // The 2026-11-10 tiles: the check-in time with its verdict line — no
    // old "Checked in …" sentence anywhere.
    expect(textContaining(view.root, '10:16').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Late by 1h 01m').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Checked in late by 1 hr 1 min')).toHaveLength(0);
    expect(actionButtonsUp(view.root)).toHaveLength(1);

    // The mid-session card coexists with the button — the checkout tile
    // reads the dashed placeholder + the Pending pill, never hides.
    expect(textContaining(view.root, '- - : - -').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Pending').length).toBeGreaterThan(0);
  });

  it('the done state REMOVES the check-in/out button; the punch card remains (never both visible — AC)', () => {
    const view = renderView(summaryState(), { record });
    expect(actionButtonsUp(view.root)).toHaveLength(0);
    // 10:16 → 18:05 = 469 whole minutes; the summary's 09:00-16:00 shift
    // (420 min span) makes it a FULL shift → the celebration caption.
    expect(textContaining(view.root, '7h 49m').length).toBeGreaterThan(0);
    expect(
      textContaining(view.root, 'Full shift completed • Sched 9:00 AM - 4:00 PM').length,
    ).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Late by 1h 01m').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'On time').length).toBeGreaterThan(0);
    // The old "Checked in" line is gone — the tile is the time now.
    expect(textContaining(view.root, 'Checked in 10:16 AM')).toHaveLength(0);
  });

  it.each([
    ['denied', 'Turn on location'],
    ['preciseOff', 'Turn on precise location'],
    ['serviceOff', 'Turn on location'],
  ] as const)('permission state %s renders its (deliberately shared) short button label', (permission, label) => {
    const view = renderView(summaryState(), { permission });
    expect(textContaining(view.root, label).length).toBeGreaterThan(0);
  });

  it('the location postures differentiate on the CARD, not the button (owner decision 2026-11-10)', () => {
    const denied = renderView(summaryState(), { permission: 'denied' });
    expect(
      textContaining(
        denied.root,
        'Attendance needs your location to check in and out. You can still view your records and apply for leave without it.',
      ).length,
    ).toBeGreaterThan(0);

    const serviceOff = renderView(summaryState(), { permission: 'serviceOff' });
    expect(textContaining(serviceOff.root, 'Location is off').length).toBeGreaterThan(0);
    expect(
      textContaining(
        serviceOff.root,
        'Turn on your location to verify your office presence and mark attendance.',
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('the failure posture (facts unknown = no interactive check-in)', () => {
  it('a first-load ERROR renders the error + retry and NO Check in button (the holiday gate must be able to fire)', () => {
    const view = renderView(
      summaryState({ summary: null, isLoading: false, error: 'Could not load your attendance details.' }),
      {},
    );
    expect(textContaining(view.root, 'Check in')).toHaveLength(0);
    expect(textContaining(view.root, 'Could not load your attendance details.')).toHaveLength(1);
  });

  it('a first-load SHIMMER renders (labelled) and NO button', () => {
    const view = renderView(summaryState({ summary: null, isLoading: true }), {});
    expect(textContaining(view.root, 'Check in')).toHaveLength(0);
    expect(
      view.root.findAll(n => n.props.accessibilityLabel === 'Loading attendance').length,
    ).toBeGreaterThan(0);
  });

  it('a summary whose today is explicitly null (contract break) renders a NOT-PRESSABLE button (fail-safe)', () => {
    const state = summaryState();
    state.summary = { ...state.summary!, today: null };
    const view = renderView(state, {});
    // The role double-carries through nested nodes (the RN Button+Pressable
    // gotcha) — the requirement is that NO layer of the CTA is pressable.
    const ctas = view.root.findAll(
      (n: { props?: { accessibilityRole?: string; onPress?: unknown } }) =>
        n.props?.accessibilityRole === 'button',
    );
    expect(ctas.length).toBeGreaterThan(0);
    for (const node of ctas) {
      expect(node.props.onPress).toBeUndefined();
    }
  });

  it('a pre-16-4 backend (today absent) still renders the interactive button (legacy mode)', () => {
    const state = summaryState();
    const { today, todayRecord, ...legacy } = state.summary!;
    void today;
    void todayRecord;
    state.summary = { ...legacy };
    const view = renderView(state, {});
    expect(textContaining(view.root, 'Check in').length).toBeGreaterThan(0);
  });
});

describe('the offline block and announcements', () => {
  it('offline renders the blocking message FROM STATE (the walkthrough-found defect — the disabled tap can never set it)', () => {
    const view = renderView(summaryState(), { online: false });
    expect(
      textContaining(view.root, "You're offline. Check-in needs a working connection."),
    ).toHaveLength(1);
  });

  it('a settled outcome message renders and ANNOUNCES through AccessibilityInfo (the 15-6 precedent)', () => {
    const view = renderView(summaryState(), {
      message: { tone: 'error', text: 'You are 1357 m from Hero wala. Move within 150 m.' },
    });
    expect(
      textContaining(view.root, 'You are 1357 m from Hero wala. Move within 150 m.'),
    ).toHaveLength(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'You are 1357 m from Hero wala. Move within 150 m.',
    );
  });

  it('the today section renders NO office/timings line — it moved to the summary card', () => {
    const view = renderView(summaryState(), {});
    // The 2026-10 redesign moved the office/timings truth to the summary
    // card; a second render here would let the two truths drift.
    expect(textContaining(view.root, 'Hero wala ·')).toHaveLength(0);
    expect(textContaining(view.root, '9:00 AM – 4:00 PM')).toHaveLength(0);
  });
});

describe('the fence verdict is ADVICE, never a gate (2026-11 simplification)', () => {
  const fencedSummary = () => {
    const state = summaryState();
    state.summary = {
      ...state.summary!,
      officeLatitude: 12.98,
      officeLongitude: 77.74,
      officeRadius: 150,
    };
    return state;
  };
  /** Fresh (1 s old) and ~97 km from the fixture office pin — beyond any
   *  radius, so the card's snapshot verdict is TOO FAR. */
  const farFix = { latitude: 12.1, longitude: 77.74, capturedAt: 999_000 };

  function prescreen(over: Record<string, unknown> = {}) {
    (usePunchPrescreen as jest.Mock).mockReturnValue({
      fix: farFix,
      recapture: jest.fn(),
      adoptFix: jest.fn(),
      ...over,
    });
  }

  it('a beyond-radius fix renders the TOO FAR card AND the button STAYS ready (the server gates the press)', () => {
    prescreen();
    const view = renderView(fencedSummary(), {});
    expect(textContaining(view.root, 'Too far from Hero wala').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Go closer, then check in.').length).toBeGreaterThan(0);
    expect(textContaining(view.root, 'Tap to check in').length).toBeGreaterThan(0);
  });

  it('a settled server message outranks the card — no exceptions (the server copy is the truth surface)', () => {
    prescreen();
    const view = renderView(fencedSummary(), {
      message: { tone: 'error', text: 'You are 1355 m from Hero wala. Move within 150 m.' },
    });
    expect(
      textContaining(view.root, 'You are 1355 m from Hero wala. Move within 150 m.'),
    ).toHaveLength(1);
    expect(textContaining(view.root, 'Too far from Hero wala')).toHaveLength(0);
  });

  it('non-fence postures keep the same message-over-card precedence (the 16-4 rule)', () => {
    prescreen({ fix: null });
    const view = renderView(fencedSummary(), {
      message: { tone: 'error', text: 'You are 1355 m from Hero wala. Move within 150 m.' },
    });
    expect(
      textContaining(view.root, 'You are 1355 m from Hero wala. Move within 150 m.'),
    ).toHaveLength(1);
    expect(textContaining(view.root, 'Too far from Hero wala')).toHaveLength(0);
  });

  it('the press flow\'s own fix is adopted into the prescreen (the card speaks with the fix the server judged)', () => {
    const adoptFix = jest.fn();
    prescreen({ adoptFix });
    const view = renderView(fencedSummary(), {
      lastFix: { latitude: 12.1, longitude: 77.74 },
    });
    expect(adoptFix).toHaveBeenCalledWith({ latitude: 12.1, longitude: 77.74 });
    expect(textContaining(view.root, 'Too far from Hero wala').length).toBeGreaterThan(0);
  });
});

describe('the blocked-tap popups — OUR dialog first, the OS only from its confirm (owner request 2026-11-10)', () => {
  beforeEach(() => {
    // The service-off confirm deep-links out (system settings); keep the
    // intent from leaking past the component in tests. The RN jest mock's
    // Linking carries no sendIntent — install one so the guarded helper's
    // Android path runs and the test can assert the intent.
    jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve() as never);
    (Linking as unknown as { sendIntent: unknown }).sendIntent = jest.fn(() =>
      Promise.resolve(),
    );
    // The deep link is the ANDROID rung — pin the platform for this describe.
    (Platform as unknown as { OS: string }).OS = 'android';
  });

  /** The punch tap: PunchButton's onPress IS the section's handler. */
  function tapPunch(view: ReactTestRenderer.ReactTestRenderer) {
    const button = view.root.findAllByType(PunchButton)[0];
    act(() => {
      button.props.onPress();
    });
  }

  function dialogsUp(view: ReactTestRenderer.ReactTestRenderer) {
    return view.root.findAllByType(ConfirmDialog);
  }

  it('a denied tap opens the PERMISSION dialog (never the plain RN rationale); confirm fires remediation, cancel does not', () => {
    const openRemediation = jest.fn();
    const view = renderView(summaryState(), { permission: 'denied', openRemediation });
    tapPunch(view);
    const dialogs = dialogsUp(view);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].props.title).toBe('Location access is off');
    expect(dialogs[0].props.message).toBe(
      'Attendance needs your location to verify your office presence and mark attendance.',
    );
    expect(dialogs[0].props.confirmLabel).toBe('Allow location');
    expect(dialogs[0].props.cancelLabel).toBe('Not now');
    // No punch was pressed — the popup intercepted the tap.
    const press = useCheckInOutMock().press;
    expect(press).not.toHaveBeenCalled();

    act(() => {
      dialogs[0].props.onConfirm();
    });
    expect(openRemediation).toHaveBeenCalledTimes(1);
    expect(dialogsUp(view)).toHaveLength(0);
  });

  it('the dialog\'s cancel is the safe exit — remediation never fires, the popup closes', () => {
    const openRemediation = jest.fn();
    const view = renderView(summaryState(), { permission: 'denied', openRemediation });
    tapPunch(view);
    act(() => {
      dialogsUp(view)[0].props.onCancel();
    });
    expect(openRemediation).not.toHaveBeenCalled();
    expect(dialogsUp(view)).toHaveLength(0);
  });

  it('a serviceOff tap opens the SERVICE_OFF dialog whose confirm deep-links to system location settings', () => {
    const view = renderView(summaryState(), { permission: 'serviceOff' });
    tapPunch(view);
    const dialogs = dialogsUp(view);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].props.title).toBe('Location is off');
    expect(dialogs[0].props.confirmLabel).toBe('Turn on location');
    expect(dialogs[0].props.cancelLabel).toBe('Not now');
    // The service-off confirm opens SYSTEM settings, not the permission flow.
    const openRemediation = useCheckInOutMock().openRemediation;
    act(() => {
      dialogs[0].props.onConfirm();
    });
    expect(openRemediation).not.toHaveBeenCalled();
    // …and the deep link REALLY fired (Android Location panel intent).
    const sendIntent = (Linking as unknown as { sendIntent: jest.Mock }).sendIntent;
    expect(sendIntent.mock.calls.some((call) => call[0] === 'android.settings.LOCATION_SOURCE_SETTINGS')).toBe(true);
  });

  it('a READY tap never opens a popup — it presses the punch (the popups are blocked-tap-only)', () => {
    const press = jest.fn();
    const view = renderView(summaryState(), { press });
    tapPunch(view);
    expect(dialogsUp(view)).toHaveLength(0);
    expect(press).toHaveBeenCalledWith('check_in');
  });
});
