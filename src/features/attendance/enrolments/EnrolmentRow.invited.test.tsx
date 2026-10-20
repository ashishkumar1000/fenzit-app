/**
 * Team attendance row, invited employees: the server refuses to track a person
 * who has not signed in yet, so the switch must not turn them ON. A switch that
 * is already on (for example, tracked before an invite was re-sent) can still
 * be turned OFF, so the owner is never stuck with tracking they cannot stop.
 */
import { act, create } from 'react-test-renderer';
import { Switch } from 'react-native';
import { EnrolmentRow } from './EnrolmentRow';
import type { EnrolmentOverview } from '../../../services';

const TODAY = '2026-10-21';

function row(overrides: Partial<EnrolmentOverview> = {}): EnrolmentOverview {
  return {
    employeeId: 'e1',
    employeeName: 'Suresh',
    phone: '+911212121212',
    attendanceEnabled: true,
    attendanceAccess: 'none',
    attendanceStartDate: null,
    enabledAt: null,
    onboardedAt: null,
    officeId: null,
    officeName: null,
    memberStatus: 'invited',
    ...overrides,
  };
}

function props(overrides: Partial<React.ComponentProps<typeof EnrolmentRow>> = {}) {
  return {
    row: row(),
    today: TODAY,
    isPending: false,
    hasError: false,
    pickedStart: null,
    onPickStart: jest.fn(),
    onToggleOn: jest.fn(),
    onDisable: jest.fn(),
    onCancelStart: jest.fn(),
    onChangeOffice: jest.fn(),
    moveNote: null,
    ...overrides,
  };
}

function switchOf(renderer: ReturnType<typeof create>) {
  return renderer.root.findByType(Switch);
}

describe('EnrolmentRow — invited employee', () => {
  it('a switch that is off is disabled, and a forced turn-on reaches no handler', async () => {
    const p = props();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EnrolmentRow {...p} />);
    });
    const sw = switchOf(renderer);
    expect(sw.props.disabled).toBe(true);
    await act(async () => {
      sw.props.onValueChange(true);
    });
    expect(p.onToggleOn).not.toHaveBeenCalled();
    expect(p.onDisable).not.toHaveBeenCalled();
  });

  it('shows why the switch is disabled, in plain words', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EnrolmentRow {...props()} />);
    });
    const texts = renderer.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(texts).toContain("Hasn't signed in yet. They can be tracked after their first sign-in.");
  });

  it('a switch that is already on can still be turned off', async () => {
    const p = props({
      row: row({ attendanceAccess: 'active', attendanceStartDate: TODAY, officeId: 'o1', officeName: 'HQ' }),
    });
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EnrolmentRow {...p} />);
    });
    const sw = switchOf(renderer);
    expect(sw.props.disabled).toBe(false);
    await act(async () => {
      sw.props.onValueChange(false);
    });
    expect(p.onDisable).toHaveBeenCalledTimes(1);
  });

  it('an active employee keeps an enabled switch that can turn tracking on', async () => {
    const p = props({ row: row({ memberStatus: 'active' }) });
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EnrolmentRow {...p} />);
    });
    const sw = switchOf(renderer);
    expect(sw.props.disabled).toBe(false);
    await act(async () => {
      sw.props.onValueChange(true);
    });
    expect(p.onToggleOn).toHaveBeenCalledTimes(1);
  });
});
