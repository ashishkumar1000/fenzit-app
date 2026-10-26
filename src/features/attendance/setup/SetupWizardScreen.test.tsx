/**
 * Tests for the 15-8 SetupWizardScreen's highest-value flows:
 *  - Resume lands on the SERVER MARKER step (the AuthFlow-style machine
 *    renders one step at a time, StepIndicator showing "Step X of 4").
 *  - The per-step Continue gate: offices with zero live offices disables
 *    Continue with its caption; a never-started tenant POSTs the start.
 *  - Continue PATCHes the NEXT step's marker; Holidays' "Skip for now"
 *    PATCHes Employees without any holiday data.
 *  - The Employees step: roster rows render; toggling on WITHOUT an office
 *    opens the inline picker and PUTs NOTHING until a pick; the pick PUTs
 *    the chosen office and the row shows the returned assignment.
 *  - The completion gate: an empty roster keeps "Enable attendance"
 *    disabled with the 1:1 server-rule caption; a successful enable
 *    replaces to AttendanceHome; a 422 INCOMPLETE shows the banner and
 *    refetches both sides of the gate without leaving.
 *
 * Render shape follows HolidaysScreen.test.tsx: the focus hook runs its
 * callback on mount, the services barrel is mocked, `create` runs inside a
 * sync act and the root is read fresh after each flush.
 */
jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual('react');
  return {
    // The real hook needs a NavigationContainer; run the focus callback on
    // mount instead, which is what a focused screen does in the app.
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

jest.mock('../../../services', () => ({
  attendanceSetupService: {
    getSetup: jest.fn(),
    startSetup: jest.fn(),
    saveSetupStep: jest.fn(),
    completeSetup: jest.fn(),
  },
  officesService: {
    list: jest.fn(),
  },
  weeklyOffsService: {
    getDefault: jest.fn(),
  },
  holidaysService: {
    list: jest.fn(),
  },
  enrolmentsService: {
    list: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Switch, Text } from 'react-native';
import {
  attendanceSetupService,
  enrolmentsService,
  holidaysService,
  officesService,
  weeklyOffsService,
} from '../../../services';
import type {
  EnrolmentOverview,
  Holiday,
  SetupState,
  WeeklyOffDefaultResponse,
} from '../../../services';
import type { Office } from '../../../types/office';
import SetupWizardScreen from './SetupWizardScreen';

const getSetup = attendanceSetupService.getSetup as jest.Mock;
const startSetup = attendanceSetupService.startSetup as jest.Mock;
const saveSetupStep = attendanceSetupService.saveSetupStep as jest.Mock;
const completeSetup = attendanceSetupService.completeSetup as jest.Mock;
const listOffices = officesService.list as jest.Mock;
const getDefault = weeklyOffsService.getDefault as jest.Mock;
const listHolidays = holidaysService.list as jest.Mock;
const listRoster = enrolmentsService.list as jest.Mock;
const enable = enrolmentsService.enable as jest.Mock;

function setupState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    started: true,
    currentStep: 'offices',
    setupCompletedAt: null,
    enabled: false,
    ...overrides,
  };
}

function office(
  id: string,
  name: string,
  overrides: Partial<Office> = {},
): Office {
  return {
    id,
    name,
    latitude: 19.1,
    longitude: 72.8,
    radiusM: 100,
    archivedAt: null,
    rule: {
      id: `rule-${id}`,
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      validFrom: '2026-09-01',
      validTo: null,
    },
    nextRule: null,
    ...overrides,
  };
}

function enrolRow(
  overrides: Partial<EnrolmentOverview> = {},
): EnrolmentOverview {
  return {
    employeeId: 'e1',
    employeeName: 'Priya',
    phone: '+919000000000',
    attendanceEnabled: false,
    attendanceAccess: 'none',
    attendanceStartDate: null,
    enabledAt: null,
    onboardedAt: null,
    officeId: null,
    officeName: null,
    memberStatus: 'active',
    ...overrides,
  };
}

const LIVE_OFFICE = office('o1', 'HQ');
const SAVED_WEEKLY_OFF: WeeklyOffDefaultResponse = {
  configured: true,
  default: { days: [7], validFrom: '2026-01-01', validTo: null },
  next: null,
  history: [],
};

function mockStepData({
  offices = [LIVE_OFFICE],
  weeklyOff = SAVED_WEEKLY_OFF,
  holidays = [] as Holiday[],
  roster = [] as EnrolmentOverview[],
}: {
  offices?: Office[];
  weeklyOff?: WeeklyOffDefaultResponse;
  holidays?: Holiday[];
  roster?: EnrolmentOverview[];
} = {}) {
  listOffices.mockResolvedValue(offices);
  getDefault.mockResolvedValue(weeklyOff);
  listHolidays.mockResolvedValue(holidays);
  listRoster.mockResolvedValue(roster);
}

type Wizard = {
  navigation: Record<string, jest.Mock>;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

function renderWizard(): Wizard {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SetupWizardScreen
        navigation={navigation as never}
        route={undefined as never}
      />,
    );
  });
  return {
    navigation,
    get root() {
      return renderer.root;
    },
  };
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Renders and settles the mount bootstrap plus the four step-data fetches. */
async function renderLoaded(): Promise<Wizard> {
  const wizard = renderWizard();
  await act(async () => {
    await flush();
  });
  return wizard;
}

function hasText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return (
    root.findAll((n) => n.type === Text && n.props.children === value).length >
    0
  );
}

/** The bare Switch in the employee's row — located by the name Text up to
 *  the nearest ancestor holding exactly one Switch (the 2026-10 redesign's
 *  row anatomy; the chip carries the status, the switch carries no label). */
function bareSwitch(
  root: ReactTestRenderer.ReactTestInstance,
  name: string,
): ReactTestRenderer.ReactTestInstance {
  const nameTexts = root.findAll(
    (n) => n.type === Text && n.props.children === name,
  );
  expect(nameTexts.length).toBeGreaterThan(0);
  let node = nameTexts[0];
  while (node.parent) {
    node = node.parent;
    const switches = node.findAll((m) => m.type === Switch);
    if (switches.length === 1) return switches[0];
  }
  throw new Error(`No Switch found in the row for "${name}"`);
}

/** The Pressable behind the Button whose visible label is `label`. */
function findButton(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const texts = root.findAll(
    (n) => n.type === Text && n.props.children === label,
  );
  for (const text of texts) {
    let cur: ReactTestRenderer.ReactTestInstance | null = text.parent;
    while (cur) {
      if (typeof cur.props.onPress === 'function') return cur;
      cur = cur.parent;
    }
  }
  throw new Error(`No Button Pressable labelled "${label}"`);
}

function stepIndicatorLabel(
  root: ReactTestRenderer.ReactTestInstance,
): string {
  const nodes = root.findAll((n) =>
    /^Step \d of 4$/.test(String(n.props.accessibilityLabel ?? '')),
  );
  expect(nodes.length).toBeGreaterThan(0);
  return nodes[0].props.accessibilityLabel as string;
}

beforeEach(() => {
  // clearAllMocks (NOT resetAllMocks): this suite renders real RN native
  // components (the roster rows' Switch resolves through the preset's
  // NativeComponentRegistry mock), whose jest.fn internals resetAllMocks
  // would wipe — leaving later renders an undefined element type. The
  // hooks-only suites can afford resetAllMocks; this one cannot.
  // Every test below sets the mock implementations it needs.
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** False when the step indicator is absent (bootstrap loading/error states). */
function stepIndicatorLabelSafe(
  root: ReactTestRenderer.ReactTestInstance,
): boolean {
  return (
    root.findAll((n) =>
      /^Step \d of 4$/.test(String(n.props.accessibilityLabel ?? '')),
    ).length > 0
  );
}

describe('bootstrap and resume', () => {
  it('resume lands on the SERVER MARKER step with its summary and a live Continue', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    mockStepData();
    const wizard = await renderLoaded();

    expect(stepIndicatorLabel(wizard.root)).toBe('Step 2 of 4');
    expect(hasText(wizard.root, 'Weekly off')).toBe(true);
    // The SAVED canonical default (describeDays([7])), not a preselection.
    expect(hasText(wizard.root, 'Sun only')).toBe(true);
    expect(saveSetupStep).not.toHaveBeenCalled();

    const continueButton = findButton(wizard.root, 'Continue');
    expect(continueButton.props.disabled).toBe(false);
  });

  it('a never-started tenant POSTs the start and lands on step 1 (Offices)', async () => {
    getSetup.mockResolvedValue(
      setupState({ started: false, currentStep: null }),
    );
    startSetup.mockResolvedValue(
      setupState({ started: true, currentStep: 'offices' }),
    );
    mockStepData({ offices: [] });
    const wizard = await renderLoaded();

    expect(startSetup).toHaveBeenCalledTimes(1);
    expect(stepIndicatorLabel(wizard.root)).toBe('Step 1 of 4');
    expect(hasText(wizard.root, 'Offices & hours')).toBe(true);
  });

  it('a 403 bootstrap shows the permission copy with Retry — never the steps', async () => {
    // The step-data hooks fetch in parallel with the bootstrap regardless of
    // its outcome — the four list mocks must resolve arrays or the mounted
    // hooks' first render crashes before the error branch shows.
    mockStepData({ offices: [] });
    getSetup.mockRejectedValue({
      status: 403,
      code: 'FORBIDDEN',
      message: 'owner only',
      details: null,
    });
    const wizard = await renderLoaded();
    await act(async () => {
      await flush();
    });

    expect(
      hasText(wizard.root, "You don't have permission to set up attendance."),
    ).toBe(true);
    expect(stepIndicatorLabelSafe(wizard.root)).toBe(false);
    expect(startSetup).not.toHaveBeenCalled();
    // Retry re-runs the bootstrap (still failing here — the copy holds).
    await act(async () => {
      findButton(wizard.root, 'Retry').props.onPress();
      await flush();
    });
    expect(getSetup).toHaveBeenCalledTimes(2);
    expect(
      hasText(wizard.root, "You don't have permission to set up attendance."),
    ).toBe(true);
  });

  it('in-session Back steps backward with NO marker PATCH, and step-1 back exits', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'holidays' }));
    mockStepData();
    const wizard = await renderLoaded();
    expect(stepIndicatorLabel(wizard.root)).toBe('Step 3 of 4');

    const back = wizard.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Back' &&
        typeof n.props.onPress === 'function',
    );
    expect(back.length).toBeGreaterThan(0);
    await act(async () => {
      back[0].props.onPress();
      await flush();
    });

    expect(stepIndicatorLabel(wizard.root)).toBe('Step 2 of 4');
    expect(saveSetupStep).not.toHaveBeenCalled();

    // Step 1's back control is the EXIT (delegates to goBackSafely — the
    // navigation mock's canGoBack is true, so it pops).
    await act(async () => {
      findButton(wizard.root, 'Continue').props.onPress();
      await flush();
    }); // advance back to step 3
    for (let i = 0; i < 2; i++) {
      const prev = wizard.root.findAll(
        (n) =>
          n.props.accessibilityLabel === 'Back' &&
          typeof n.props.onPress === 'function',
      );
      await act(async () => {
        prev[0].props.onPress();
        await flush();
      });
    }
    expect(stepIndicatorLabel(wizard.root)).toBe('Step 1 of 4');
    const exit = wizard.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Back' &&
        typeof n.props.onPress === 'function',
    );
    expect(exit.length).toBeGreaterThan(0);
    await act(async () => {
      exit[0].props.onPress();
      await flush();
    });
    expect(wizard.navigation.goBack).toHaveBeenCalledTimes(1);
    // The marker only ever moved FORWARD (the three Continue-advance PATCHes;
    // back() and the exit PATCHed nothing).
    expect(saveSetupStep).toHaveBeenCalledTimes(1);
  });
});

describe('the per-step Continue gate', () => {
  it('zero live offices disables Continue with its explanatory caption', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'offices' }));
    mockStepData({ offices: [] });
    const wizard = await renderLoaded();

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(true);
    expect(hasText(wizard.root, 'Add at least one office to continue.')).toBe(
      true,
    );
  });

  it('an UNSAVED weekly-off default disables Continue with its caption', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    mockStepData({ weeklyOff: { default: null, next: null, history: [] } });
    const wizard = await renderLoaded();

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(true);
    expect(hasText(wizard.root, 'Save your default weekly off first.')).toBe(
      true,
    );
  });

  it('weekly_off: a SAVED decision with no rule in force today enables Continue (the device dead-lock)', async () => {
    // Found on device 2026-10-26: a Sunday-off rule saved from next Sunday
    // left `default` null, and the old `defaultDays !== null` gate kept step
    // 3 dead-locked until that date. The gate reads R-11's `configured`.
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    mockStepData({
      weeklyOff: {
        configured: true,
        default: null,
        next: { days: [7], validFrom: '2027-03-07', validTo: null },
        history: [{ days: [7], validFrom: '2027-03-07', validTo: null }],
      },
    });
    const wizard = await renderLoaded();

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(false);
    expect(hasText(wizard.root, 'Save your default weekly off first.')).toBe(
      false,
    );
    // The card shows the queued first rule, not "Not set yet".
    expect(hasText(wizard.root, 'Sun only')).toBe(true);
    expect(
      hasText(
        wizard.root,
        'Starts Sun, 7 Mar, 2027 — everyone works all days until then.',
      ),
    ).toBe(true);
  });

  it('weekly_off: the card lists queued edits behind the live rule, capped at three', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    mockStepData({
      weeklyOff: {
        configured: true,
        default: { days: [7], validFrom: '2026-10-26', validTo: null },
        next: { days: [2], validFrom: '2027-03-03', validTo: null },
        history: [
          { days: [7], validFrom: '2026-10-26', validTo: null },
          { days: [2], validFrom: '2027-03-03', validTo: null },
          { days: [4], validFrom: '2027-03-05', validTo: null },
          { days: [6], validFrom: '2027-03-07', validTo: null },
          { days: [5, 6, 7], validFrom: '2027-03-09', validTo: null },
        ],
      },
    });
    const wizard = await renderLoaded();

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(false);
    expect(hasText(wizard.root, 'From Wed, 3 Mar, 2027: Tue off.')).toBe(true);
    expect(hasText(wizard.root, 'From Fri, 5 Mar, 2027: Thu off.')).toBe(true);
    expect(hasText(wizard.root, 'From Sun, 7 Mar, 2027: Sat off.')).toBe(true);
    // The fourth hop defers to the editor's Upcoming panel.
    expect(
      hasText(wizard.root, '+1 more — see all in Set weekly off.'),
    ).toBe(true);
    expect(hasText(wizard.root, 'From Tue, 9 Mar, 2027: Fri, Sat & Sun off.')).toBe(
      false,
    );
  });

  it('the gate caption stays hidden while the step data loads, then follows the gate', async () => {
    // The default's GET hangs: the snapshot is still empty defaults, and a
    // caption computed from it would contradict itself ("Save your default
    // weekly off first.") while the step is merely LOADING. Continue stays
    // disabled with NO caption until the surface settles.
    let resolveDefault!: (v: WeeklyOffDefaultResponse) => void;
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    getDefault.mockImplementationOnce(
      () =>
        new Promise<WeeklyOffDefaultResponse>(
          (resolve) => (resolveDefault = resolve),
        ),
    );
    mockStepData();
    const wizard = await renderLoaded();

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(true);
    expect(hasText(wizard.root, 'Save your default weekly off first.')).toBe(
      false,
    );

    // The GET lands with a SAVED default — Continue enables; still no
    // caption (the gate is met). The {default:null} → caption-appears half
    // is pinned by the test above.
    await act(async () => {
      resolveDefault(SAVED_WEEKLY_OFF);
      await flush();
    });

    expect(findButton(wizard.root, 'Continue').props.disabled).toBe(false);
    expect(hasText(wizard.root, 'Save your default weekly off first.')).toBe(
      false,
    );
  });

  it('Continue PATCHes the NEXT step marker and moves there', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));
    mockStepData();
    saveSetupStep.mockResolvedValue(setupState({ currentStep: 'holidays' }));
    const wizard = await renderLoaded();

    await act(async () => {
      findButton(wizard.root, 'Continue').props.onPress();
      await flush();
    });

    expect(saveSetupStep).toHaveBeenCalledTimes(1);
    expect(saveSetupStep).toHaveBeenCalledWith('holidays');
    expect(stepIndicatorLabel(wizard.root)).toBe('Step 3 of 4');
  });
});

describe('Holidays — the only skippable step', () => {
  it('holidays has NO primary Continue at all (owner 2026-10-23: Skip for now is the only forward action)', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'holidays' }));
    mockStepData({ holidays: [] });
    const wizard = await renderLoaded();

    const continues = wizard.root.findAll(
      (n) =>
        n.type === Text &&
        n.props.children === 'Continue',
    );
    expect(continues).toHaveLength(0);
  });

  it('Skip for now PATCHes Employees with NO holiday data and moves on', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'holidays' }));
    mockStepData({ holidays: [] });
    saveSetupStep.mockResolvedValue(setupState({ currentStep: 'employees' }));
    const wizard = await renderLoaded();

    expect(stepIndicatorLabel(wizard.root)).toBe('Step 3 of 4');
    await act(async () => {
      findButton(wizard.root, 'Skip for now').props.onPress();
      await flush();
    });

    expect(saveSetupStep).toHaveBeenCalledTimes(1);
    expect(saveSetupStep).toHaveBeenCalledWith('employees');
    expect(completeSetup).not.toHaveBeenCalled();
    expect(stepIndicatorLabel(wizard.root)).toBe('Step 4 of 4');
    expect(hasText(wizard.root, 'Employees')).toBe(true);
  });
});

describe('the Employees step (enrolment-lite)', () => {
  it('toggling on WITHOUT an office opens the picker and PUTs nothing until a pick', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'employees' }));
    mockStepData({ offices: [LIVE_OFFICE], roster: [enrolRow()] });
    const wizard = await renderLoaded();

    expect(hasText(wizard.root, 'Priya')).toBe(true);
    // The picker is closed: it names no employee yet.
    expect(hasText(wizard.root, 'Where does Priya work?')).toBe(false);

    // The 2026-10 redesign: the switch is BARE (the chip carries the
    // status), so the toggle is reached from the name Text up to the row
    // ancestor holding exactly one Switch.
    const switchNode = [bareSwitch(wizard.root, 'Priya')];
    expect(switchNode[0].props.value).toBe(false);

    await act(async () => {
      switchNode[0].props.onValueChange(true);
      await flush();
    });

    // The picker opened INLINE, named for this employee, and the switch did
    // NOT commit — its value is still the server's row state, and no PUT
    // exists until an office is chosen.
    expect(hasText(wizard.root, 'Where does Priya work?')).toBe(true);
    expect(switchNode[0].props.value).toBe(false);
    expect(enable).not.toHaveBeenCalled();

    // The BE write response: the access state WITHOUT identity fields;
    // the start date is the raw per-employee truth (today's enrolment),
    // while attendanceEnabled stays the (still-false) module flag.
    enable.mockResolvedValue({
      attendanceEnabled: false,
      attendanceAccess: 'none',
      attendanceStartDate: '2026-09-28',
      enabledAt: '2026-09-28T03:35:45Z',
      onboardedAt: null,
      officeId: 'o1',
      officeName: 'HQ',
    });
    const officeRow = wizard.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Assign HQ for Priya' &&
        typeof n.props.onPress === 'function',
    );
    expect(officeRow.length).toBeGreaterThan(0);

    await act(async () => {
      officeRow[0].props.onPress();
      await flush();
    });

    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith('e1', 'o1', undefined);
    // The row shows the server's returned assignment (the 2026-10 chip).
    expect(hasText(wizard.root, 'HQ assigned')).toBe(true);
    expect(hasText(wizard.root, 'Where does Priya work?')).toBe(false);
  });

  it('an empty roster keeps Enable disabled with the server-rule caption', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'employees' }));
    mockStepData({ offices: [LIVE_OFFICE], roster: [] });
    const wizard = await renderLoaded();

    expect(hasText(wizard.root, 'Invite technicians first')).toBe(true);
    const enableButton = findButton(wizard.root, 'Enable attendance');
    expect(enableButton.props.disabled).toBe(true);
    expect(
      hasText(
        wizard.root,
        'Turn on attendance for at least one employee assigned to a live office, starting today.',
      ),
    ).toBe(true);
    expect(completeSetup).not.toHaveBeenCalled();
  });
});

describe('completion', () => {
  // Mid-setup wire shape: the module flag is false for everyone (setup not
  // complete) — eligibility comes from the UNGATED per-employee truth
  // (start date covering today + live office), never from the flag.
  const eligibleRoster = [
    enrolRow({
      attendanceEnabled: false,
      attendanceAccess: 'none',
      attendanceStartDate: '2026-09-28',
      officeId: 'o1',
      officeName: 'HQ',
    }),
  ];

  it('Enable success POSTs complete once and replaces to AttendanceHome', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'employees' }));
    mockStepData({ offices: [LIVE_OFFICE], roster: eligibleRoster });
    completeSetup.mockResolvedValue(
      setupState({
        setupCompletedAt: '2026-09-28T10:00:00Z',
        enabled: true,
      }),
    );
    const wizard = await renderLoaded();

    // The row renders its assignment straight from the GET — the gated
    // module flag is false, the raw enrolment truth is what shows (the
    // 2026-10 chip wording).
    expect(hasText(wizard.root, 'HQ assigned')).toBe(true);

    const enableButton = findButton(wizard.root, 'Enable attendance');
    expect(enableButton.props.disabled).toBe(false);

    await act(async () => {
      enableButton.props.onPress();
      await flush();
    });

    expect(completeSetup).toHaveBeenCalledTimes(1);
    expect(wizard.navigation.replace).toHaveBeenCalledWith('AttendanceHome', {
      justEnabled: true,
    });
  });

  it('a 422 INCOMPLETE shows the banner, refetches BOTH sides of the gate, and stays', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'employees' }));
    mockStepData({ offices: [LIVE_OFFICE], roster: eligibleRoster });
    completeSetup.mockRejectedValue({
      status: 422,
      code: 'ATTENDANCE_SETUP_INCOMPLETE',
      message: 'Suresh has not signed in to the app yet. Tracking can start after their first sign-in.',
      details: null,
    });
    const wizard = await renderLoaded();
    const listsBefore = listRoster.mock.calls.length;
    const officeListsBefore = listOffices.mock.calls.length;

    await act(async () => {
      findButton(wizard.root, 'Enable attendance').props.onPress();
      await flush();
    });

    expect(
      hasText(
        wizard.root,
        "Attendance couldn't be enabled yet. Suresh has not signed in to the app yet. Tracking can start after their first sign-in.",
      ),
    ).toBe(true);
    // The gate data was refetched so the caption recomputes from truth.
    expect(listRoster.mock.calls.length).toBe(listsBefore + 1);
    expect(listOffices.mock.calls.length).toBe(officeListsBefore + 1);
    // Never a fake success — the wizard did not leave.
    expect(wizard.navigation.replace).not.toHaveBeenCalled();
  });
});

describe('Offices step (merged timings step)', () => {
  const pressByLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
    root.findAll(
      (n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function',
    )[0];

  it('tapping an office card opens that office in the form', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'offices' }));
    mockStepData({ offices: [LIVE_OFFICE] });
    const wizard = await renderLoaded();

    await act(async () => {
      pressByLabel(wizard.root, 'Edit HQ').props.onPress();
    });

    expect(wizard.navigation.navigate).toHaveBeenCalledWith('OfficeForm', { officeId: 'o1' });
  });

  it('"Add office" opens a blank form', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'offices' }));
    mockStepData({ offices: [LIVE_OFFICE] });
    const wizard = await renderLoaded();

    await act(async () => {
      findButton(wizard.root, 'Add office').props.onPress();
    });

    expect(wizard.navigation.navigate).toHaveBeenCalledWith('OfficeForm', undefined);
  });

  it('with no office yet, the empty-state "Add office" also opens a blank form', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'offices' }));
    mockStepData({ offices: [] });
    const wizard = await renderLoaded();

    await act(async () => {
      findButton(wizard.root, 'Add office').props.onPress();
    });

    expect(wizard.navigation.navigate).toHaveBeenCalledWith('OfficeForm', undefined);
  });
});

describe('exit without the "Attendance is on" notice', () => {
  it('a setup already completed elsewhere replaces to AttendanceHome with NO justEnabled', async () => {
    getSetup.mockResolvedValue(
      setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
    );
    mockStepData();
    const wizard = await renderLoaded();

    expect(wizard.navigation.replace).toHaveBeenCalledWith('AttendanceHome', undefined);
  });
});
