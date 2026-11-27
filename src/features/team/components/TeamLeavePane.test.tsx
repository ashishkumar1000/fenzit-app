/**
 * TeamLeavePane — the Leave segment's wiring (Epic 24, 24-5): the queue's
 * four postures, the per-row decision matrix (inline Approve, Decline →
 * the sheet's reason stage), the read-only note, and the announced count.
 */
import { act, create } from 'react-test-renderer';
import type ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { InlineError, Button } from '../../../components/ui';
import { LeaveRequestCard } from '../../attendance/leave/LeaveRequestCard';
import { LeaveDetailSheet } from '../../attendance/leave/LeaveDetailSheet';
import type { LeaveRequestRow } from '../../../services';
import { TeamLeavePane } from './TeamLeavePane';

let mockQueue: Record<string, unknown> = {};

jest.mock('../useTeamLeaveQueue', () => ({
  useTeamLeaveQueue: () => mockQueue,
}));

jest.mock('../useTeammatesOff', () => ({
  useTeammatesOff: () => ({ line: null }),
}));

jest.mock('../../attendance/leave/useDetailBalances', () => ({
  useDetailBalances: () => ({ balances: [], loading: false, error: null }),
}));

jest.mock('../../attendance/leave/LeaveBalancesCard', () => ({
  LeaveBalancesCard: () => null,
}));

function makeQueue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [],
    loading: false,
    error: null,
    refreshing: false,
    loadingMore: false,
    loadMoreError: false,
    notice: null,
    actionError: null,
    busyId: null,
    clearNotice: jest.fn(),
    clearActionError: jest.fn(),
    retry: jest.fn(),
    onRefresh: jest.fn(),
    loadMore: jest.fn(),
    decide: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

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
    decision: { canDecide: true, reason: null },
    dates: [],
    ...overrides,
  } as LeaveRequestRow;
}

async function renderPane(onCountChange = jest.fn()): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <TeamLeavePane myId="u-me" enabled onCountChange={onCountChange} />,
    );
  });
  return renderer;
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.filter((c: unknown) => typeof c === 'string').join('')
      : String(node.props.children),
  );
}

beforeEach(() => {
  mockQueue = makeQueue();
});

it('a failed first load shows the error and Retry', async () => {
  const retry = jest.fn();
  mockQueue = makeQueue({ error: "Couldn't load leave requests.", retry });
  const renderer = await renderPane();

  expect(renderer.root.findAllByType(InlineError)).toHaveLength(1);
  expect(texts(renderer)).toContain("Couldn't load leave requests.");
  const retryButton = renderer.root
    .findAllByType(Button)
    .find(button => button.props.children === 'Retry');
  expect(retryButton).toBeDefined();
  retryButton!.props.onPress();
  expect(retry).toHaveBeenCalled();
});

it('a failed refresh with rows on screen keeps them and says why they may be stale', async () => {
  mockQueue = makeQueue({
    items: [makeRow()],
    error: "Couldn't load leave requests.",
  });
  const renderer = await renderPane();

  expect(renderer.root.findAllByType(LeaveRequestCard)).toHaveLength(1);
  expect(texts(renderer)).toContain("Couldn't load leave requests.");
});

it('approves inline with the row instance', async () => {
  const decide = jest.fn().mockResolvedValue({ ok: true });
  const row = makeRow();
  mockQueue = makeQueue({ items: [row], decide });
  const renderer = await renderPane();

  const card = renderer.root.findAllByType(LeaveRequestCard)[0];
  await act(async () => {
    card.props.onApprove();
  });

  expect(decide).toHaveBeenCalledWith(row, 'approve');
});

it('Decline opens the detail sheet at the reason stage', async () => {
  mockQueue = makeQueue({ items: [makeRow()] });
  const renderer = await renderPane();

  const card = renderer.root.findAllByType(LeaveRequestCard)[0];
  await act(async () => {
    card.props.onDecline();
  });

  const sheet = renderer.root.findAllByType(LeaveDetailSheet)[0];
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.openStage).toBe('reject');
});

it('a row someone closer owns is carded read-only and opens the plain detail', async () => {
  mockQueue = makeQueue({
    items: [makeRow({ decision: { canDecide: false, reason: 'higher_manager' } })],
  });
  const renderer = await renderPane();

  const card = renderer.root.findAllByType(LeaveRequestCard)[0];
  expect(card.props.readOnlyNote).toBe('Someone closer to Riya decides this.');
  expect(card.props.onApprove).toBeUndefined();
  expect(card.props.onDecline).toBeUndefined();

  await act(async () => {
    card.props.onPress();
  });
  expect(renderer.root.findAllByType(LeaveDetailSheet)[0].props.openStage).toBe('detail');
});

it('announces the actionable count for the segment label', async () => {
  mockQueue = makeQueue({
    items: [
      makeRow({ id: 'r1' }),
      makeRow({ id: 'r2', decision: { canDecide: false, reason: 'higher_manager' } }),
    ],
  });
  const onCountChange = jest.fn();
  await renderPane(onCountChange);

  expect(onCountChange).toHaveBeenLastCalledWith(1);
});
