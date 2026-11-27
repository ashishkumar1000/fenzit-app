/**
 * TeamJobsPane — the Jobs segment's wiring (Epic 24, 24-5): the decision
 * matrix, the RejectJobSheet flow (a failure keeps the sheet open with the
 * typed reason and the error inside), and the announced count.
 */
import { act, create } from 'react-test-renderer';
import type ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import type { ApiJob } from '../../../services';
import { RejectJobSheet } from '../../jobDetail/components/RejectJobSheet';
import { TeamJobApprovalCard } from './TeamJobApprovalCard';
import { TeamJobsPane } from './TeamJobsPane';

let mockQueue: Record<string, unknown> = {};

jest.mock('../useTeamJobQueue', () => ({
  useTeamJobQueue: () => mockQueue,
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

function makeJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: 'j1',
    jobNumber: 'JB-2026-0007',
    tenantId: 't1',
    customerId: 'c1',
    customer: { id: 'c1', name: 'Asha Rao' },
    technicianId: null,
    serviceLocation: '12 Anna Nagar',
    scheduledStart: '2026-12-07T04:30:00.000Z',
    scheduledEnd: '2026-12-07T05:30:00.000Z',
    status: 'pending_approval',
    completedAt: null,
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-12-01T09:00:00.000Z',
    updatedAt: '2026-12-01T09:00:00.000Z',
    createdBy: 'u-riya',
    skill: { id: 's1', name: 'Plumbing' },
    decision: { canDecide: true, reason: null },
    ...overrides,
  } as ApiJob;
}

const team = {
  managerId: 'u-owner',
  managerName: 'PQA Owner Ashok Rao',
  chain: [],
  headcount: 1,
  directReports: 1,
  members: [
    { userId: 'u-riya', name: 'Riya Nair', employeeCode: 'EMP-004', status: 'active', avatarUrl: null },
  ],
};

async function renderPane(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <TeamJobsPane team={team} enabled onOpenJob={jest.fn()} />,
    );
  });
  return renderer;
}

beforeEach(() => {
  mockQueue = makeQueue();
});

it('names the creator from the directory and approves inline', async () => {
  const decide = jest.fn().mockResolvedValue({ ok: true });
  const job = makeJob();
  mockQueue = makeQueue({ items: [job], decide });
  const renderer = await renderPane();

  const card = renderer.root.findAllByType(TeamJobApprovalCard)[0];
  expect(card.props.fromName).toBe('Riya Nair');

  await act(async () => {
    card.props.onApprove();
  });
  expect(decide).toHaveBeenCalledWith(job, 'approve');
});

it('a row someone closer owns is read-only and offers no decline', async () => {
  mockQueue = makeQueue({
    items: [makeJob({ decision: { canDecide: false, reason: 'higher_manager' } })],
  });
  const renderer = await renderPane();

  const card = renderer.root.findAllByType(TeamJobApprovalCard)[0];
  expect(card.props.readOnlyNote).toBe('Someone closer to Riya decides this.');
  expect(card.props.onApprove).toBeUndefined();
  expect(card.props.onDecline).toBeUndefined();
});

it('opens the reject sheet from the card', async () => {
  mockQueue = makeQueue({ items: [makeJob()] });
  const renderer = await renderPane();

  await act(async () => {
    renderer.root.findAllByType(TeamJobApprovalCard)[0].props.onDecline();
  });

  const sheet = renderer.root.findAllByType(RejectJobSheet)[0];
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.employeeName).toBe('Riya Nair');
});

it('a failed decline keeps the sheet open with the typed reason and the error inside', async () => {
  const decide = jest
    .fn()
    .mockResolvedValue({ ok: false, kind: 'error', message: "Couldn't reach the server." });
  mockQueue = makeQueue({ items: [makeJob()], decide });
  const renderer = await renderPane();

  await act(async () => {
    renderer.root.findAllByType(TeamJobApprovalCard)[0].props.onDecline();
  });
  await act(async () => {
    renderer.root.findAllByType(RejectJobSheet)[0].props.onConfirm('Overbooked');
  });

  expect(decide).toHaveBeenCalledWith(expect.objectContaining({ id: 'j1' }), 'reject', 'Overbooked');
  const sheet = renderer.root.findAllByType(RejectJobSheet)[0];
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.error).toBe("Couldn't reach the server.");
});

it('a successful decline closes the sheet', async () => {
  const decide = jest.fn().mockResolvedValue({ ok: true });
  mockQueue = makeQueue({ items: [makeJob()], decide });
  const renderer = await renderPane();

  await act(async () => {
    renderer.root.findAllByType(TeamJobApprovalCard)[0].props.onDecline();
  });
  await act(async () => {
    renderer.root.findAllByType(RejectJobSheet)[0].props.onConfirm('');
  });

  expect(renderer.root.findAllByType(RejectJobSheet)[0].props.visible).toBe(false);
});

it('announces the actionable count for the segment label', async () => {
  mockQueue = makeQueue({
    items: [makeJob({ id: 'j1' }), makeJob({ id: 'j2', decision: { canDecide: false, reason: 'higher_manager' } })],
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const onCountChange = jest.fn();
  await act(async () => {
    renderer = create(
      <TeamJobsPane team={team} enabled onCountChange={onCountChange} onOpenJob={jest.fn()} />,
    );
  });

  expect(onCountChange).toHaveBeenLastCalledWith(1);
  expect(renderer).toBeDefined();
});
