/**
 * `LeaveDetailSheet`'s Epic 24 manager variant: a row the server says the
 * caller may not decide shows the quiet reason and NO action buttons (the
 * sheet is the manager's only decision surface, so the rule must hold here
 * as well as on the card), and the card's Decline opens straight at the
 * reason stage.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button } from '../../../components/ui';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveDetailSheet } from './LeaveDetailSheet';

function makeRow(overrides: Partial<LeaveRequestRow> = {}): LeaveRequestRow {
  return {
    id: 'r1',
    employeeId: 'u-riya',
    employeeName: 'Riya Nair',
    employeeCode: 'EMP-004',
    startDate: '2026-12-07',
    endDate: '2026-12-07',
    part: 'full_day',
    reason: 'Family event',
    status: 'pending',
    workingDays: 1,
    totalDays: 1,
    leaveTypeName: 'Casual leave',
    decision: { canDecide: false, reason: 'higher_manager' },
    dates: [],
    ...overrides,
  } as LeaveRequestRow;
}

function flatten(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  return '';
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll(n => n.type === Text)
    .map(node => flatten(node.props.children));
}

function renderSheet(props: Partial<Parameters<typeof LeaveDetailSheet>[0]> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <LeaveDetailSheet
        visible
        request={makeRow()}
        actionState={{ kind: 'idle' }}
        onClose={jest.fn()}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onDismissHandled={jest.fn()}
        {...props}
      />,
    );
  });
  return renderer;
}

function buttonLabels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Button)
    .map(button => button.props.children as string);
}

it('a read-only note replaces the action slot entirely', () => {
  const renderer = renderSheet({ readOnlyNote: 'Someone closer to Riya decides this.' });
  expect(texts(renderer.root)).toContain('Someone closer to Riya decides this.');
  expect(buttonLabels(renderer)).not.toContain('Approve');
  expect(buttonLabels(renderer)).not.toContain('Reject');
});

it('without a note a decidable pending row still offers Reject and Approve', () => {
  const renderer = renderSheet({
    request: makeRow({ decision: { canDecide: true, reason: null } }),
  });
  expect(buttonLabels(renderer)).toContain('Approve');
  expect(buttonLabels(renderer)).toContain('Reject');
});

it('openStage="reject" opens straight at the reason input', () => {
  const renderer = renderSheet({
    request: makeRow({ decision: { canDecide: true, reason: null } }),
    openStage: 'reject',
  });
  expect(buttonLabels(renderer)).toContain('Reject request');
  expect(buttonLabels(renderer)).not.toContain('Approve');
});
