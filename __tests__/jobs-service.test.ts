/**
 * `jobService.list`'s query building — the wire half of the status-filter
 * contract (AC 2). The store tests mock the whole services module, so this
 * is the only place the real `list()` executes: `apiClient` is mocked and
 * we assert the exact `params` axios will send.
 *
 * Also covers the `update` wire path (Story 1-3): the PATCH verb, URL and
 * body must be exact — the store tests mock `jobService`, so a verb/URL
 * regression here would otherwise ship unnoticed.
 */
jest.mock('../src/services/api/apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

import { jobService } from '../src/services/resources/jobs';
import { apiClient } from '../src/services/api/apiClient';
import type { ApiJob } from '../src/services';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { data: [], nextCursor: null, hasMore: false } });
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  patch.mockReset();
  patch.mockResolvedValue({ data: {} });
});

it('sends no params for the default (all) query', async () => {
  await jobService.list();
  expect(get).toHaveBeenCalledWith('/jobs', { params: {} });
});

it('sends the status array for a filtered query', async () => {
  await jobService.list({ status: ['scheduled', 'in_progress'] });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: { status: ['scheduled', 'in_progress'] },
  });
});

it('drops an empty status array rather than sending an empty param', async () => {
  await jobService.list({ status: [] });
  expect(get).toHaveBeenCalledWith('/jobs', { params: {} });
});

it('passes the scope through untouched when given', async () => {
  await jobService.list({ scope: 'overdue' });
  expect(get).toHaveBeenCalledWith('/jobs', { params: { scope: 'overdue' } });
});

it('sends scope + status together for a filtered scope query (as the store does)', async () => {
  await jobService.list({ scope: 'today', status: ['completed'] });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: { scope: 'today', status: ['completed'] },
  });
});

it('sends scope + date together for today (date is server-rejected for other scopes)', async () => {
  await jobService.list({ scope: 'today', date: '2026-09-03' });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: { scope: 'today', date: '2026-09-03' },
  });
});

it('passes cursor, date, technicianId and limit through untouched', async () => {
  await jobService.list({
    date: '2026-09-03',
    technicianId: 'tech-1',
    cursor: 'cursor-1',
    limit: 10,
  });
  expect(get).toHaveBeenCalledWith('/jobs', {
    params: {
      date: '2026-09-03',
      technicianId: 'tech-1',
      cursor: 'cursor-1',
      limit: 10,
    },
  });
});

it('getById hits /jobs/:id and forwards the abort signal', async () => {
  const controller = new AbortController();
  await jobService.getById('j-1', controller.signal);
  expect(get).toHaveBeenCalledWith('/jobs/j-1', { signal: controller.signal });
});

it('getById works without a signal (no abort requested)', async () => {
  await jobService.getById('j-1');
  expect(get).toHaveBeenCalledWith('/jobs/j-1', { signal: undefined });
});
it('update PATCHes /jobs/:id with the cancel payload verbatim', async () => {
  const cancelled: ApiJob = {
    id: 'j-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 't1',
    serviceLocation: '12 Anna Nagar, Chennai',
    skill: { id: 's-1', name: 'plumbing' },
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'cancelled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    updatedAt: '2026-09-03T11:00:00Z',
  };
  patch.mockResolvedValueOnce({ data: cancelled });

  await expect(jobService.update('j-1', { status: 'cancelled' })).resolves.toBe(cancelled);
  // Exactly the PATCH verb on /jobs/:id — a POST here would create, not edit.
  expect(patch).toHaveBeenCalledTimes(1);
  expect(patch).toHaveBeenCalledWith('/jobs/j-1', { status: 'cancelled' });
});

it('update PATCHes /jobs/:id with only the edited fields', async () => {
  await jobService.update('j-1', {
    description: 'AC leaking',
    priority: 'urgent',
    technicianId: 'tech-2',
  });
  expect(patch).toHaveBeenCalledWith('/jobs/j-1', {
    description: 'AC leaking',
    priority: 'urgent',
    technicianId: 'tech-2',
  });
});

describe('decidePending — the owner decision wire path (Epic 22)', () => {
  it('POSTs /jobs/:id/approval with decision only (no reason on approve)', async () => {
    await jobService.decidePending('j-1', 'approve');
    // Exactly the POST verb on the approval endpoint — anything else would
    // be a create or an edit, not a decision.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/jobs/j-1/approval', { decision: 'approve' });
  });

  it('carries the reject reason on the body', async () => {
    await jobService.decidePending('j-1', 'reject', 'Duplicate visit');
    expect(post).toHaveBeenCalledWith('/jobs/j-1/approval', {
      decision: 'reject',
      reason: 'Duplicate visit',
    });
  });

  it('omits the reason key entirely when it is absent, not an empty string', async () => {
    // The server trims; the app must not send a reason-less key or an empty
    // one — an approval has nothing to explain, and a reject with no reason
    // is "reason omitted" on the wire, never `reason: undefined`.
    await jobService.decidePending('j-1', 'reject');
    expect(post).toHaveBeenCalledWith('/jobs/j-1/approval', { decision: 'reject' });
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect('reason' in body).toBe(false);
  });

  it('sends an empty-string reason as omitted too (trimmed to nothing)', async () => {
    await jobService.decidePending('j-1', 'reject', '   ');
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect('reason' in body).toBe(false);
  });

  it('returns the post-decision job from res.data', async () => {
    const decided = { id: 'j-1', status: 'approved' } as unknown as ApiJob;
    post.mockResolvedValueOnce({ data: decided });
    await expect(jobService.decidePending('j-1', 'approve')).resolves.toBe(decided);
  });

  it('does not swallow a 409 JOB_NOT_PENDING — the caller reconciles on it', async () => {
    // The detail screen's contract: a silent refetch on this exact error.
    // If the service ever wrapped it, the reconciliation would break. The
    // CODE matters as much as the status — the screen switches on it.
    post.mockRejectedValueOnce(
      Object.assign(new Error('Already decided'), { status: 409, code: 'JOB_NOT_PENDING' }),
    );
    await expect(jobService.decidePending('j-2', 'approve')).rejects.toMatchObject({
      status: 409,
      code: 'JOB_NOT_PENDING',
    });
    expect(post).toHaveBeenCalledWith('/jobs/j-2/approval', { decision: 'approve' });
  });
});

describe('create — the idempotency key header (Epic 22)', () => {
  const makeInput = () => ({
    customerId: 'c-1',
    serviceLocation: '12 Anna Nagar, Chennai',
    skillId: 'sk-1',
    scheduledStart: '2026-11-14T10:00:00Z',
    technicianId: 'emp-1',
  } as const);

  it('a keyed call POSTs with the X-Idempotency-Key config arg (a double-tap must replay, never double-create)', async () => {
    post.mockResolvedValueOnce({ data: { id: 'j-1' } });
    await jobService.create(makeInput(), 'uuid-key-1');
    expect(post.mock.calls[0]).toHaveLength(3);
    expect(post.mock.calls[0][2]).toEqual({ headers: { 'X-Idempotency-Key': 'uuid-key-1' } });
  });

  it('a keyless call stays a two-argument post (the verbatim-body contract)', async () => {
    post.mockResolvedValueOnce({ data: { id: 'j-2' } });
    await jobService.create(makeInput());
    expect(post.mock.calls[0]).toHaveLength(2);
  });
});
