/**
 * Screen tests for `ApplyOnBehalfScreen` (Story 17-6, spec §5): the
 * cold-entry picker (roster-backed, TRACKED rows only — `Ghost`, a
 * never-enrolled technician, never appears; `officeName: null` renders
 * "No office"); the search input past 8 rows + its client-side filter;
 * the picker's empty copy; the selected-employee card + "Change"; the
 * "Approve" (born-approved) submit — never "Submit for approval" — with
 * the muted no-preview hint in the chip slot; success announces
 * "Leave applied for {name}" and lands on OwnerLeave `all`;
 * `ATTENDANCE_NOT_TRACKED` = the TARGET employee — inline server message
 * only, NO access-store refresh; 404 → "This person isn't in your team
 * anymore."
 *
 * The DatePicker return channel is driven the way the screen really
 * receives it: params merged on re-render (the popTo merge), consumed
 * read-once-then-cleared.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    applyOnBehalf: jest.fn(),
    // 23-14 — the picker (owner's catalog read) + the target's balances,
    // and the owner-route preview (the count chip + verdict on this form).
    listCompanyLeaveTypes: jest.fn().mockResolvedValue([]),
    getEmployeeBalances: jest.fn().mockResolvedValue([]),
    previewOnBehalf: jest.fn().mockResolvedValue({
      ok: true,
      workingDays: 1,
      totalDays: 1,
      part: 'full_day',
      dates: [],
    }),
  },
  enrolmentsService: {
    list: jest.fn(),
  },
}));

jest.mock('../me/attendanceAccessStore', () => ({
  useAttendanceAccess: jest.fn(),
  refreshAttendanceAccessNow: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';
import { Button, InlineError, Input, Sheet } from '../../../components/ui';
import { attendanceLeaveService, enrolmentsService } from '../../../services';
import { refreshAttendanceAccessNow } from '../me/attendanceAccessStore';
import type { ApplyOnBehalfParams } from '../../../navigation/types';
import type { EnrolmentOverview } from '../../../services/resources/enrolments';
import ApplyOnBehalfScreen from './ApplyOnBehalfScreen';

const applyOnBehalf = attendanceLeaveService.applyOnBehalf as jest.Mock;
const previewOnBehalf = attendanceLeaveService.previewOnBehalf as jest.Mock;
const listCompanyLeaveTypes = attendanceLeaveService
  .listCompanyLeaveTypes as jest.Mock;
const listEnrolments = enrolmentsService.list as jest.Mock;
const refreshAccessNow = refreshAttendanceAccessNow as jest.Mock;
const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

/** A minimal enabled catalog row (LeaveTypeView) for the picker. */
function makeType(id: string, name: string) {
  return {
    id,
    code: null,
    name,
    accrualMode: 'annual',
    accrualDays: 12,
    carryForward: true,
    allowOverBalance: false,
    paid: true,
    enabled: true,
    configurable: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function rosterRow(
  employeeId: string,
  employeeName: string,
  attendanceStartDate: string | null = '2026-09-28',
  officeName: string | null = 'Hero wala',
): EnrolmentOverview {
  return {
    employeeId,
    employeeName,
    phone: '9999999999',
    attendanceEnabled: true,
    attendanceAccess: attendanceStartDate ? 'active' : 'none',
    attendanceStartDate,
    enabledAt: null,
    onboardedAt: null,
    officeId: officeName ? 'o1' : null,
    officeName,
    memberStatus: 'active',
  };
}

const SMALL_ROSTER = [
  rosterRow('e1', 'Arya'),
  rosterRow('e2', 'Ghost', null, null), // never enrolled — the picker filters it
  rosterRow('e3', 'Suresh', '2026-09-28', null), // tracked, no office → "No office"
];

function bigRoster(): EnrolmentOverview[] {
  const rows = SMALL_ROSTER.filter(r => r.employeeName !== 'Ghost');
  for (let i = 0; i < 7; i += 1) {
    rows.push(rosterRow(`e-m${i}`, `Member ${i}`));
  }
  return rows; // 9 tracked rows → the search input appears
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function findButtons(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityLabel === label,
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

type Ctx = {
  renderer: ReactTestRenderer.ReactTestRenderer;
  root: ReactTestRenderer.ReactTestInstance;
  navigation: Nav;
  pickDate: (pickedDate: string, context: 'from' | 'to') => Promise<void>;
};

async function renderScreen(
  params: ApplyOnBehalfParams = {},
  roster: EnrolmentOverview[] = SMALL_ROSTER,
): Promise<Ctx> {
  const navigation = makeNavigation();
  listEnrolments.mockResolvedValue(roster);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const element = (p: ApplyOnBehalfParams, n: Nav) => (
    <ApplyOnBehalfScreen
      navigation={n as never}
      route={{ params: p } as never}
    />
  );
  await act(async () => {
    renderer = create(element(params, navigation));
  });
  const ctx: Ctx = {
    renderer,
    root: renderer.root,
    navigation,
    async pickDate(pickedDate, context) {
      await act(async () => {
        renderer.update(element({ ...params, pickedDate, context }, navigation));
      });
      // The popTo merge clears the params (read-once) — mirror that.
      await act(async () => {
        renderer.update(element({ ...params, pickedDate: null, context: null }, navigation));
      });
    },
  };
  return ctx;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  listEnrolments.mockResolvedValue(SMALL_ROSTER);
  applyOnBehalf.mockResolvedValue({
    id: 'req-1',
    status: 'approved',
    workingDays: 1,
  });
});

describe('the employee picker (spec D4, wire-truth F1)', () => {
  it('opens on the cold CTA entry, offering TRACKED rows only', async () => {
    const { root } = await renderScreen();
    const sheet = root.findAllByType(Sheet)[0];
    expect(sheet.props.title).toBe('Choose team member');
    expect(sheet.props.subtitle).toBe('Who is this leave for?');
    const labels = texts(root);
    expect(labels).toContain('Arya');
    expect(labels).toContain('Suresh');
    expect(labels.includes('Ghost')).toBe(false); // never enrolled → filtered
    // Suresh has no code and no office — his caption shows his phone.
    expect(labels).toContain('9999999999');
  });

  it('the search is always visible and filters by name client-side', async () => {
    // The threshold is gone (device-pass compaction): even a two-person
    // roster carries the search — big companies never scroll blind.
    const { root } = await renderScreen({}, bigRoster());
    const search = root
      .findAllByType(Input)
      .find(i => i.props.placeholder === 'Search name, EMP code or phone...');
    expect(search).toBeDefined();
    await act(async () => {
      search!.props.onChangeText('ary');
    });
    const labels = texts(root);
    expect(labels).toContain('Arya');
    expect(labels.includes('Suresh')).toBe(false);
  });

  it('the needle matches the EMP code and the phone digits, formatting-free', async () => {
    const roster: EnrolmentOverview[] = [
      rosterRow('e1', 'Arya'),
      rosterRow('e2', 'Suresh', '2026-09-28', null),
    ];
    // Arya carries a code + the BE's plain phone shape; Suresh doesn't.
    roster[0] = { ...roster[0], employeeCode: 'EMP-042', phone: '919876543210' };
    const { root } = await renderScreen({}, roster);
    const search = root
      .findAllByType(Input)
      .find(i => i.props.placeholder === 'Search name, EMP code or phone...');
    // Code: "042" (no EMP- prefix needed).
    await act(async () => {
      search!.props.onChangeText('042');
    });
    expect(texts(root)).toContain('Arya');
    expect(texts(root).includes('Suresh')).toBe(false);
    // Phone: the spaces never block the match.
    await act(async () => {
      search!.props.onChangeText('98765 43210');
    });
    expect(texts(root)).toContain('Arya');
    // The row caption shows code · phone so the match is visible.
    expect(texts(root)).toContain('EMP-042 · 919876543210 · Hero wala');
  });

  it('the empty roster renders the enrol-them-first copy', async () => {
    const { root } = await renderScreen({}, []);
    expect(texts(root)).toContain(
      'No team members yet — enrol them from Attendance first.',
    );
  });

  it('picking fills the read-only Team member card with a Change affordance', async () => {
    const { root } = await renderScreen();
    await act(async () => {
      findButtons(root, 'Apply leave for Arya')[0].props.onPress();
    });
    const labels = texts(root);
    expect(labels).toContain('Team member'); // section head + card visible
    expect(labels).toContain('Arya');
    expect(labels).toContain('Hero wala');
    expect(
      root.findAllByType(Button).find(b => b.props.children === 'Change'),
    ).toBeDefined();
    expect(root.findAllByType(Sheet)[0].props.visible).toBe(false);
  });

  it('the count hint appears only once a member is picked — never on the member-less form (Sally F4)', async () => {
    const ctx = await renderScreen();
    // Cold entry: nobody picked — the count slot stays empty (the picker
    // IS the step), not a "Pick dates…" prompt about a form that isn't
    // live yet.
    expect(texts(ctx.root)).not.toContain(
      'Pick dates to see the working-days count.',
    );
    await act(async () => {
      findButtons(ctx.root, 'Apply leave for Arya')[0].props.onPress();
    });
    expect(texts(ctx.root)).toContain(
      'Pick dates to see the working-days count.',
    );
  });
});

describe('the born-approved submit (spec D4)', () => {
  async function pickedScreen() {
    const ctx = await renderScreen();
    await act(async () => {
      findButtons(ctx.root, 'Apply leave for Arya')[0].props.onPress();
    });
    return ctx;
  }

  it('the primary action reads "Approve" (never "Submit for approval")', async () => {
    const { root } = await pickedScreen();
    const approve = root
      .findAllByType(Button)
      .find(b => b.props.children === 'Approve');
    expect(approve).toBeDefined();
    expect(approve!.props.size).toBe('lg');
    expect(approve!.props.fullWidth).toBe(true);
    expect(
      root.findAllByType(Button).find(b => b.props.children === 'Submit for approval'),
    ).toBeUndefined();
    // The submit gates on dates + reason (and the picked employee).
    expect(approve!.props.disabled).toBe(true);
  });

  it('submits the on-behalf body with a fresh key, announces and lands on OwnerLeave all', async () => {
    const ctx = await pickedScreen();
    await ctx.pickDate('2026-10-05', 'from');
    const reason = ctx.root
      .findAllByType(Input)
      .find(i => i.props.accessibilityLabel === 'Reason (required)');
    await act(async () => {
      reason!.props.onChangeText('Family event ');
    });
    await act(async () => {
      ctx.root
        .findAllByType(Button)
        .find(b => b.props.children === 'Approve')!
        .props.onPress();
    });
    expect(applyOnBehalf).toHaveBeenCalledTimes(1);
    const [body, key] = applyOnBehalf.mock.calls[0];
    expect(body).toEqual({
      employeeId: 'e1',
      startDate: '2026-10-05',
      reason: 'Family event', // trimmed
    });
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^[0-9a-f-]{36}$/); // one fresh UUID v4 per tap
    expect(announce).toHaveBeenCalledWith('Leave applied for Arya');
    expect(ctx.navigation.navigate).toHaveBeenCalledWith('OwnerLeave', {
      tab: 'all',
    });
  });

  it('NOT_TRACKED means the TARGET employee: inline server message, NO access refresh', async () => {
    applyOnBehalf.mockRejectedValueOnce({
      status: 403,
      code: 'ATTENDANCE_NOT_TRACKED',
      message: 'Attendance is not tracking this employee.',
    });
    const ctx = await pickedScreen();
    await ctx.pickDate('2026-10-05', 'from');
    const reason = ctx.root
      .findAllByType(Input)
      .find(i => i.props.accessibilityLabel === 'Reason (required)');
    await act(async () => {
      reason!.props.onChangeText('Family');
    });
    await act(async () => {
      ctx.root
        .findAllByType(Button)
        .find(b => b.props.children === 'Approve')!
        .props.onPress();
    });
    const errors = ctx.root.findAllByType(InlineError);
    expect(errors).toHaveLength(1);
    expect(errors[0].props.message).toBe(
      'Attendance is not tracking this employee.',
    );
    expect(refreshAccessNow).not.toHaveBeenCalled();
    expect(ctx.navigation.navigate).not.toHaveBeenCalled();
    // The form stays: the footer button is back (not loading).
    expect(
      ctx.root.findAllByType(Button).find(b => b.props.children === 'Approve')!.props
        .loading,
    ).toBe(false);
  });

  it("a 404 employee renders the FE line: \"This person isn't in your team anymore.\"", async () => {
    applyOnBehalf.mockRejectedValueOnce({
      status: 404,
      code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND',
      message: 'Employee not found.',
    });
    const ctx = await pickedScreen();
    await ctx.pickDate('2026-10-05', 'from');
    const reason = ctx.root
      .findAllByType(Input)
      .find(i => i.props.accessibilityLabel === 'Reason (required)');
    await act(async () => {
      reason!.props.onChangeText('Family');
    });
    await act(async () => {
      ctx.root
        .findAllByType(Button)
        .find(b => b.props.children === 'Approve')!
        .props.onPress();
    });
    expect(texts(ctx.root)).toContain("This person isn't in your team anymore.");
  });
});

describe('the live preview (23-14 — one server truth)', () => {
  async function pickedWithDate() {
    const ctx = await renderScreen();
    await act(async () => {
      findButtons(ctx.root, 'Apply leave for Arya')[0].props.onPress();
    });
    await ctx.pickDate('2026-10-05', 'from');
    await act(async () => {}); // flush the preview promise
    return ctx;
  }

  it('the count chip renders the preview\'s workingDays ("1 working day") with the picked employeeId', async () => {
    const { root } = await pickedWithDate();
    expect(texts(root)).toContain('1 working day');
    expect(previewOnBehalf).toHaveBeenLastCalledWith({
      employeeId: 'e1',
      startDate: '2026-10-05',
    });
  });

  it('the preview carries the effective leaveTypeId once the catalog loads', async () => {
    listCompanyLeaveTypes.mockResolvedValue([makeType('lt-1', 'Sick')]);
    const { root } = await pickedWithDate();
    expect(previewOnBehalf).toHaveBeenLastCalledWith({
      employeeId: 'e1',
      startDate: '2026-10-05',
      leaveTypeId: 'lt-1',
    });
  });

  it('a rejected verdict renders the server message verbatim AND Approve is gated off', async () => {
    previewOnBehalf.mockResolvedValueOnce({
      ok: false,
      errorCode: 'LEAVE_INSUFFICIENT_BALANCE',
      message:
        'Not enough Sick balance — you have 7 days left and this request needs 8 days',
    });
    const ctx = await pickedWithDate();
    expect(texts(ctx.root)).toContain(
      'Not enough Sick balance — you have 7 days left and this request needs 8 days',
    );
    const reason = ctx.root
      .findAllByType(Input)
      .find(i => i.props.accessibilityLabel === 'Reason (required)');
    await act(async () => {
      reason!.props.onChangeText('Family event');
    });
    const approve = ctx.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Approve');
    expect(approve!.props.disabled).toBe(true);
    await act(async () => {
      approve!.props.onPress();
    });
    expect(applyOnBehalf).not.toHaveBeenCalled();
  });
});

describe('the picker failure and reset postures (17-6 review P3)', () => {
  it('a failed roster GET shows the honest error + Try again, which reloads', async () => {
    listEnrolments.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR', message: 'x' });
    const { root } = await renderScreen();
    expect(texts(root)).toContain("Couldn't load your team. Check your connection.");
    // Never the permanent-sounding empty copy on a transient failure.
    expect(texts(root).includes('No team members yet — enrol them from Attendance first.')).toBe(false);
    listEnrolments.mockResolvedValueOnce(SMALL_ROSTER);
    await act(async () => {
      root
        .findAllByType(Button)
        .find(b => b.props.children === 'Try again')!
        .props.onPress();
    });
    expect(texts(root)).toContain('Arya');
  });

  it('a search needle typed and dismissed does not filter the next opening', async () => {
    const { root, renderer } = await renderScreen({}, bigRoster());
    // Pick someone from the cold-entry picker first, so closing later
    // returns to the form instead of stranding it.
    await act(async () => {
      findButtons(root, 'Apply leave for Arya')[0].props.onPress();
    });
    await act(async () => {
      renderer.root
        .findAllByType(Button)
        .find(b => b.props.children === 'Change')!
        .props.onPress();
    });
    const search = renderer.root
      .findAllByType(Input)
      .find(i => i.props.placeholder === 'Search name, EMP code or phone...');
    await act(async () => {
      search!.props.onChangeText('zzz-nobody');
    });
    expect(texts(renderer.root)).toContain('No team members match "zzz-nobody"');
    // Dismiss (an employee IS picked — the sheet just closes)…
    const sheet = renderer.root.findAllByType(Sheet)[0];
    await act(async () => {
      sheet.props.onClose();
    });
    // …and re-open: the stale needle is gone, the roster unfiltered.
    await act(async () => {
      renderer.root
        .findAllByType(Button)
        .find(b => b.props.children === 'Change')!
        .props.onPress();
    });
    const reopened = renderer.root
      .findAllByType(Input)
      .find(i => i.props.placeholder === 'Search name, EMP code or phone...');
    expect(reopened!.props.value).toBe('');
    expect(texts(renderer.root)).toContain('Member 0');
  });
});
