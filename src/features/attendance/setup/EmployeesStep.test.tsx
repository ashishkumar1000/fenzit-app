/**
 * Tests for EmployeesStep (Story 15-8, guarded by 15-9; 20-1 gate): the
 * roster rows render raw truth — avatar, ONE status chip and a BARE switch
 * (the 2026-10 owner redesign; the chip carries what the old per-row hint
 * used to say) — and the 15-9 guard: an UPCOMING (future-dated) row's
 * switch is DISABLED, because a bare enable PUT clamps the start date to
 * today and DELETES the future period (AD-8). Toggling it must be
 * impossible from the wizard; adjusting an upcoming enrolment is the Team
 * enrolment screen's job (spec-15-9).
 *
 * The 20-1 gate: turning a covered row's switch OFF asks through the shared
 * ConfirmDialog FIRST — the DELETE fires only after "Turn off tracking"
 * confirms; "Keep tracking" files NOTHING. First load shows the labelled
 * shimmer; a capped failure shows the error + Retry.
 */
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { ActivityIndicator, Switch, Text } from 'react-native';
import { Button, ConfirmDialog, Input, Skeleton } from '../../../components/ui';
import { EmployeesStep } from './EmployeesStep';
import type { ApiError, EnrolmentOverview } from '../../../services';

const TODAY = '2026-09-28';

function row(overrides: Partial<EnrolmentOverview> = {}): EnrolmentOverview {
  return {
    employeeId: 'e1',
    employeeName: 'Priya',
    phone: '+919000000000',
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    enabledAt: null,
    onboardedAt: null,
    officeId: null,
    officeName: null,
    memberStatus: 'active',
    ...overrides,
  };
}

const NEVER = row();
const COVERING = row({
  employeeId: 'e2',
  employeeName: 'Ramesh',
  attendanceStartDate: TODAY,
  officeId: 'o1',
  officeName: 'HQ',
});
const UPCOMING = row({
  employeeId: 'e3',
  employeeName: 'Arjun',
  attendanceStartDate: '2026-11-01',
  officeId: 'o2',
  officeName: 'Branch',
});

type Props = Parameters<typeof EmployeesStep>[0];

function baseProps(): Props {
  return {
    roster: [],
    liveOffices: [],
    today: TODAY,
    isLoading: false,
    hasLoaded: true,
    error: null as ApiError | null,
    onRetry: () => {},
    rowError: () => null,
    isRowPending: () => false,
    onEnable: async () => true,
    onDisable: async () => true,
  };
}

/** The row's Switch, located by the employee's name Text — the bare
 *  switch carries no label (the 2026-10 redesign moved the status onto
 *  the chip); the nearest ancestor holding exactly one Switch is the row. */
function rowSwitch(
  root: ReactTestInstance,
  name: string,
): ReactTestInstance {
  const nameText = root.findAll(
    (n) => n.type === Text && n.props.children === name,
  );
  expect(nameText).toHaveLength(1);
  let node = nameText[0];
  while (node.parent) {
    node = node.parent;
    const switches = node.findAll((m) => m.type === Switch);
    if (switches.length === 1) return switches[0];
  }
  throw new Error(`no Switch found in the row for ${name}`);
}

/** All string Texts (the chips, tags, names). */
function stringTexts(root: ReactTestInstance): string[] {
  return root
    .findAll((n) => n.type === Text && typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
}

describe('EmployeesStep — the 15-9 upcoming-row guard', () => {
  it('an upcoming row renders a DISABLED switch with the tracking-begins hint; toggling it PUTs nothing', async () => {
    const onEnable = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[UPCOMING]} onEnable={onEnable} />,
      );
    });

    expect(stringTexts(renderer.root)).toContain('Starts 2026-11-01');

    const sw = rowSwitch(renderer.root, 'Arjun');
    expect(sw.props.disabled).toBe(true);

    // Even a forced toggle fires no enable (the model-level invariant).
    await act(async () => {
      sw.props.onValueChange(true);
    });
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('the never-row switch stays enabled (the wizard enrolment-lite flow is untouched)', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[NEVER]} />,
      );
    });
    expect(rowSwitch(renderer.root, 'Priya').props.disabled).toBe(false);
  });

  it('the covering-row switch stays enabled', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} roster={[COVERING]} />,
      );
    });
    expect(rowSwitch(renderer.root, 'Ramesh').props.disabled).toBe(false);
  });
});

describe('EmployeesStep — invited employees cannot be tracked yet', () => {
  // Given an office, a forced turn-on would reach onEnable without the guard.
  const INVITED = row({
    employeeId: 'e4',
    employeeName: 'Suresh',
    memberStatus: 'invited',
    officeId: 'o1',
    officeName: 'HQ',
  });

  it('an invited row that is already tracked can be switched OFF, through the confirm dialog first', async () => {
    const onDisable = jest.fn(async () => true);
    const tracked = row({
      employeeId: 'e6',
      employeeName: 'Suresh',
      memberStatus: 'invited',
      attendanceStartDate: TODAY,
      officeId: 'o1',
      officeName: 'HQ',
    });
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          roster={[tracked]}
          onDisable={onDisable}
        />,
      );
    });
    const sw = rowSwitch(renderer.root, 'Suresh');
    expect(sw.props.disabled).toBe(false);

    await act(async () => {
      sw.props.onValueChange(false);
    });
    const dialog = renderer.root
      .findAllByType(ConfirmDialog)
      .find((d) => d.props.visible === true);
    expect(dialog).toBeDefined();
    expect(onDisable).not.toHaveBeenCalled();

    act(() => {
      dialog!.props.onConfirm();
    });
    expect(onDisable).toHaveBeenCalledWith('e6');
  });

  it('an invited row shows the not-signed-in hint and a DISABLED switch; a forced toggle enables nothing', async () => {
    const onEnable = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          roster={[INVITED]}
          liveOffices={[{ id: 'o1', name: 'HQ' } as never]}
          onEnable={onEnable}
        />,
      );
    });

    expect(stringTexts(renderer.root)).toContain("Hasn't signed in yet");

    const sw = rowSwitch(renderer.root, 'Suresh');
    expect(sw.props.disabled).toBe(true);

    await act(async () => {
      sw.props.onValueChange(true);
    });
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('an active row with the same details keeps its enabled switch', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          roster={[row({ employeeId: 'e5', employeeName: 'Suresh' })]}
        />,
      );
    });
    expect(rowSwitch(renderer.root, 'Suresh').props.disabled).toBe(false);
  });
});

describe('EmployeesStep — the 20-1 switch-off gate', () => {
  let lastRenderer: ReturnType<typeof create> | null = null;

  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  /** Renders one roster and returns the OFF toggle plus the dialog finder. */
  function renderRoster(
    extra: Partial<ReturnType<typeof baseProps>> = {},
  ): { root: ReturnType<typeof create>['root'] } {
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          roster={[COVERING]}
          {...extra} />,
      );
    });
    lastRenderer = renderer;
    return { root: renderer.root as ReturnType<typeof create>['root'] };
  }

  function upDialog(root: ReturnType<typeof create>['root']) {
    return (
      root.findAllByType(ConfirmDialog).find((d) => d.props.visible === true) ??
      null
    );
  }

  it('turning a covered row OFF asks FIRST — no DELETE until "Turn off tracking" confirms', async () => {
    const onDisable = jest.fn(async () => true);
    const { root } = renderRoster({ onDisable });
    expect(upDialog(root)).toBeNull(); // nothing asks until the switch moves

    const sw = rowSwitch(root, 'Ramesh');
    await act(async () => {
      sw.props.onValueChange(false);
    });
    expect(upDialog(root)).not.toBeNull();
    expect(onDisable).not.toHaveBeenCalled(); // the ask is not the write

    act(() => {
      upDialog(root)!.props.onConfirm();
    });
    expect(onDisable).toHaveBeenCalledWith('e2');
    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('"Keep tracking" files NOTHING — the ask closes and the tracking stays', async () => {
    const onDisable = jest.fn(async () => true);
    const { root } = renderRoster({ onDisable });
    const sw = rowSwitch(root, 'Ramesh');
    await act(async () => {
      sw.props.onValueChange(false);
    });
    act(() => {
      upDialog(root)!.props.onCancel();
    });
    expect(upDialog(root)).toBeNull();
    expect(onDisable).not.toHaveBeenCalled();
  });

  it('a mid-flight row has NO switch at all — the spinner replaces it, so no ask can even open', async () => {
    const onDisable = jest.fn(async () => true);
    const isRowPending = jest.fn((id: string) => id === 'e2');
    const { root } = renderRoster({ isRowPending });
    expect(upDialog(root)).toBeNull();

    // The structural lock: the row renders the action spinner INSTEAD of
    // the switch — there is nothing to toggle, so the ask is unreachable.
    expect(root.findAll((n) => n.type === Switch)).toHaveLength(0);
    expect(root.findAllByType(ActivityIndicator as never).length).toBeGreaterThan(0);
    expect(onDisable).not.toHaveBeenCalled();
  });
});

describe('EmployeesStep — the 2026-10 redesign (search, count tags, chips)', () => {
  it('a roster of six or fewer hides the search; seven shows it and it narrows by name', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      row({ employeeId: `e${i}`, employeeName: `Member ${i}` }),
    );
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EmployeesStep {...baseProps()} roster={six} />);
    });
    expect(renderer.root.findAll((n) => n.type === Input)).toHaveLength(0);

    const seven = [...six, row({ employeeId: 'e9', employeeName: 'Zoya' })];
    act(() => {
      renderer.update(<EmployeesStep {...baseProps()} roster={seven} />);
    });
    const input = renderer.root.findAll((n) => n.type === Input);
    expect(input).toHaveLength(1);
    act(() => {
      input[0].props.onChangeText('zoy');
    });
    const t = stringTexts(renderer.root);
    expect(t).toContain('1 Member found');
    expect(t).toContain('Zoya');
    expect(t.some((x) => x === 'Member 0')).toBe(false);
  });

  it('the count tags: every member counts, and rows that cannot enable get the amber tag', () => {
    const roster = [
      COVERING,
      NEVER,
      UPCOMING,
      row({ employeeId: 'e4', employeeName: 'Suresh', memberStatus: 'invited' }),
    ];
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EmployeesStep {...baseProps()} roster={roster} />);
    });
    const t = stringTexts(renderer.root);
    expect(t).toContain('4 Members found');
    expect(t).toContain('2 not enabled'); // upcoming Arjun + invited Suresh
  });

  it('a row shows the phone tag inline after the name, wrapping never truncating', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EmployeesStep {...baseProps()} roster={[COVERING]} />);
    });
    const t = stringTexts(renderer.root);
    expect(t).toContain('+919000000000');
    expect(t).toContain('HQ assigned'); // the one status chip carries the office
  });
});

describe('EmployeesStep — 20-1 loading feedback', () => {
  let lastRenderer: ReturnType<typeof create> | null = null;

  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  function upDialog(root: ReturnType<typeof create>['root']) {
    return (
      root.findAllByType(ConfirmDialog).find((d) => d.props.visible === true) ??
      null
    );
  }

  it('first load with nothing loaded: the labelled shimmer — never "invite technicians first"', () => {
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep {...baseProps()} isLoading hasLoaded={false} />,
      );
    });
    lastRenderer = renderer;
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Loading attendance' }).length,
    ).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(
      renderer.root.findAll((n) => n.props.children === 'Invite technicians first').length,
    ).toBe(0);
  });

  it('a capped failure shows the error + Retry; Retry re-fires onRetry once', async () => {
    const onRetry = jest.fn();
    let renderer!: NonNullable<typeof lastRenderer>;
    act(() => {
      renderer = create(
        <EmployeesStep
          {...baseProps()}
          hasLoaded={false}
          error={{ status: 500, message: 'down' } as unknown as ApiError}
          onRetry={onRetry} />,
      );
    });
    lastRenderer = renderer;
    expect(
      renderer.root.findAllByProps({ message: "Couldn't load your team. Check your connection and try again." }).length,
    ).toBeGreaterThan(0);
    expect(upDialog(renderer.root)).toBeNull();
    const btn = renderer.root.findAllByType(Button).find(
      (b) => b.props.children === 'Retry',
    );
    if (!btn) throw new Error('Retry button not found');
    await act(async () => {
      btn.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
