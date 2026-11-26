/**
 * LeaveRequestCard tests (the two-tab redesign, 2026-11). The screen suite
 * treats the card opaquely (counts + handler props) — the review's
 * verification gap: the card's per-status annotations (the terminal notes,
 * the planned-absence tag, the type tag, the quoted reason, the a11y
 * label's decision-critical content) shipped unasserted. Pins them here.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Badge, Button } from '../../../components/ui';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveRequestCard } from './LeaveRequestCard';

function row(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'e1',
    employeeName: 'Arya',
    employeeCode: 'EMP-001',
    officeName: 'HQ Whitefield',
    leaveTypeName: 'Earned Leave',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    part: 'full_day',
    reason: 'Family function',
    status: 'pending',
    workingDays: 3,
    totalDays: 5,
    createdBy: 'self',
    createdAt: '2026-09-29T10:00:00Z',
    dates: [
      { date: '2026-10-05', state: 'pending' },
      { date: '2026-10-06', state: 'pending' },
    ],
    ...overrides,
  };
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function textsInOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function renderCard(request: LeaveRequestRow, handlers: Partial<Record<'onPress' | 'onApprove' | 'onDecline' | 'onRevoke', () => void>> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<LeaveRequestCard request={request} {...handlers} />);
  });
  return renderer.root;
}

/** The card's composed a11y label (the owner decides by voice). */
function a11yLabel(root: ReactTestRenderer.ReactTestInstance): string {
  const node = root.findAll(n =>
    typeof n.props.accessibilityLabel === 'string' &&
    n.props.accessibilityLabel.startsWith('Leave request for'),
  )[0];
  expect(node).toBeDefined();
  return node!.props.accessibilityLabel as string;
}

describe('LeaveRequestCard — the per-status annotations', () => {
  it('a pending row renders Approve + Decline and fires the handlers', () => {
    const onApprove = jest.fn();
    const onDecline = jest.fn();
    const root = renderCard(row(), { onApprove, onDecline });
    const approve = root.findAll(
      n => n.type === Button && n.props.onPress === onApprove,
    );
    expect(approve).toHaveLength(1);
    act(() => {
      approve[0]!.props.onPress();
    });
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(textsInOrder(root)).toContain('Decline');
  });

  it('a revoked row reads "Revoked by admin" — never the mock\'s self-withdrawal copy', () => {
    const root = renderCard(
      row({ status: 'revoked', dates: row().dates.map(d => ({ ...d, state: 'revoked' })) }),
    );
    expect(textsInOrder(root)).toContain('Revoked by admin');
    expect(textsInOrder(root)).not.toContain('Self-withdrawn');
    // Terminal rows carry no actions.
    expect(textsInOrder(root)).not.toContain('Approve');
    expect(textsInOrder(root)).not.toContain('Revoke');
  });

  it('a cancelled row reads "No action needed"; a rejected row reads nothing', () => {
    const cancelled = renderCard(
      row({ status: 'cancelled', dates: row().dates.map(d => ({ ...d, state: 'cancelled' })) }),
    );
    expect(textsInOrder(cancelled)).toContain('No action needed');
    const rejected = renderCard(
      row({ status: 'rejected', dates: row().dates.map(d => ({ ...d, state: 'rejected' })) }),
    );
    // The rejection reason is not on the wire — no note is honest.
    expect(textsInOrder(rejected)).not.toContain('Revoked by admin');
    expect(textsInOrder(rejected)).not.toContain('No action needed');
  });

  it('an approved FUTURE span carries the "Planned absence" tag; a past one does not', () => {
    const future = renderCard(
      row({ status: 'approved', startDate: '2027-01-10', endDate: '2027-01-12' }),
    );
    expect(textsInOrder(future)).toContain('Planned absence');
    const past = renderCard(row({ status: 'approved' }));
    expect(textsInOrder(past)).not.toContain('Planned absence');
    expect(textsInOrder(past)).toContain('Revoke');
  });

  it('the type tag and the quoted reason render as their own lines', () => {
    const root = renderCard(row());
    expect(textsInOrder(root)).toContain('Earned Leave');
    expect(textsInOrder(root)).toContain('“Family function”');
  });

  it('a whitespace-only reason renders no quote line and names no reason in the label', () => {
    const root = renderCard(row({ reason: '   ' }));
    expect(textsInOrder(root)).not.toContain('“   ”');
    expect(a11yLabel(root)).not.toContain('reason:');
  });

  it('the a11y label composes the decision-critical content: name, dates, days, type, status, code, reason', () => {
    const root = renderCard(row());
    const label = a11yLabel(root);
    expect(label).toContain('Arya');
    expect(label).toContain('5–9 Oct 2026');
    expect(label).toContain('3 working days');
    expect(label).toContain('Earned Leave');
    expect(label).toContain('Pending');
    expect(label).toContain('EMP-001');
    expect(label).toContain('reason: Family function');
  });

  it('the status chip is the design dot chip — one Badge carrying the leading status dot', () => {
    const root = renderCard(row());
    const badges = root.findAllByType(Badge);
    expect(badges).toHaveLength(1);
    expect(badges[0]!.props.dot).toBe(true);
    expect(badges[0]!.props.tone).toBe('soft');
  });
});
