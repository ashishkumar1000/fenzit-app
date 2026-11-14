/**
 * Tests for mergeJobIntoDetail — the rule that keeps a `JobDetail` intact
 * when a mutation/list-shape `ApiJob` lands on it (Crashlytics 2026-11:
 * thin `{ id, name }` embeds clobbered the full person profiles and the
 * screen crashed on `technician.skills.length`).
 *
 * QA mindset: test the contract, not the implementation. The embed-guard
 * cases below fail under the old bare spread; the pass-through cases
 * (plain fields, detail-only arrays) document behavior shared with a bare
 * spread — they pin the contract so a rewrite cannot silently change it.
 */
import { mergeJobIntoDetail } from './jobDetailMerge';
import type { ApiJob, JobDetail } from './resources/jobs';

/** A plain job row — the fields every job response carries, no embeds. */
function makeRow(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    technicianId: 'tech-1',
    serviceLocation: '12 MG Road, Bengaluru',
    skill: { id: 'skill-1', name: 'AC Service' },
    scheduledStart: '2026-09-04T10:00:00.000Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-01T06:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-01T06:00:00.000Z',
    ...overrides,
  };
}

/** A full detail as `GET /jobs/:id` returns it. */
function makeDetail(): JobDetail {
  return {
    ...makeRow(),
    technician: {
      id: 'tech-1',
      name: 'Ravi Kumar',
      countryCode: '+91',
      phoneNumber: '9000000000',
      skills: ['plumber'],
      avatarUrl: 'https://r2.example/tech-1.jpg',
    },
    customer: {
      id: 'customer-1',
      name: 'Sharma Residence',
      countryCode: '+91',
      phoneNumber: '9000000001',
      address: '12 MG Road',
      city: 'Bengaluru',
      latitude: 12.9716,
      longitude: 77.5946,
      addressDetails: 'Flat 302',
      formattedAddress: '12 MG Road, Bengaluru',
    },
    activityLog: [
      {
        id: 'log-1',
        eventType: 'job_created',
        actorId: 'u-1',
        metadata: null,
        createdAt: '2026-09-01T06:00:00.000Z',
      },
    ],
    attachments: [
      { id: 'att-1', type: 'photo', url: null, createdAt: '2026-09-01T06:00:00.000Z' },
    ],
  };
}

/**
 * The mutation response the backend sends — the plain row plus the THIN
 * `{ id, name }` embeds (Epic 23). Deliberately NOT built from the detail
 * fixture: a mutation response never carries `activityLog`/`attachments`.
 */
function makeMutationResponse(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    ...makeRow(),
    technician: { id: 'tech-1', name: 'Ravi Kumar' },
    customer: { id: 'customer-1', name: 'Sharma Residence' },
    ...overrides,
  };
}

describe('mergeJobIntoDetail', () => {
  it('returns null for a null detail (the caller keeps its loading guard)', () => {
    expect(mergeJobIntoDetail(null, makeMutationResponse())).toBeNull();
  });

  it('returns a NEW object and does not mutate either input', () => {
    const detail = makeDetail();
    const job = makeMutationResponse();
    const merged = mergeJobIntoDetail(detail, job);
    // React's setDetail relies on a NEW object; a same-reference return
    // would skip re-renders. The response keeps its thin embeds too.
    expect(merged).not.toBe(detail);
    expect(job.technician).toEqual({ id: 'tech-1', name: 'Ravi Kumar' });
  });

  it("keeps the detail's full person profiles when the response embeds are thin", () => {
    const merged = mergeJobIntoDetail(makeDetail(), makeMutationResponse());
    expect(merged?.technician).toEqual({
      id: 'tech-1',
      name: 'Ravi Kumar',
      countryCode: '+91',
      phoneNumber: '9000000000',
      skills: ['plumber'],
      avatarUrl: 'https://r2.example/tech-1.jpg',
    });
    expect(merged?.customer.address).toBe('12 MG Road');
    expect(merged?.customer.formattedAddress).toBe('12 MG Road, Bengaluru');
  });

  it("keeps the detail's embeds when the response embeds are null (backend null-safety)", () => {
    // The backend's normalizeSkillEmbed (fenzit-be) maps an unreadable
    // embed to null rather than dropping the row — the detail's REAL
    // profiles must survive that.
    const merged = mergeJobIntoDetail(
      makeDetail(),
      makeMutationResponse({ technician: null, customer: null }),
    );
    expect(merged?.technician.phoneNumber).toBe('9000000000');
    expect(merged?.customer.city).toBe('Bengaluru');
  });

  it("keeps the detail's embeds when the response carries none (older backend)", () => {
    const { technician: _t, customer: _c, ...noEmbeds } = makeMutationResponse();
    const merged = mergeJobIntoDetail(makeDetail(), noEmbeds);
    expect(merged?.technician.skills).toEqual(['plumber']);
  });

  it('strips detail-only keys a drifted response may carry (stale arrays must not survive)', () => {
    // A list-shape response never has these keys; if a future backend
    // accidentally adds one, its 1-hour presigned URLs / old log must not
    // overwrite the detail's until the refetch.
    const drifted = {
      ...makeMutationResponse(),
      activityLog: [{ id: 'log-stale', eventType: 'x', actorId: null, metadata: null, createdAt: '' }],
      attachments: [{ id: 'att-stale', type: 'signature' as const, url: 'https://stale', createdAt: '' }],
    } as ApiJob;
    const merged = mergeJobIntoDetail(makeDetail(), drifted);
    expect(merged?.activityLog).toHaveLength(1);
    expect(merged?.activityLog[0]?.id).toBe('log-1');
    expect(merged?.attachments).toHaveLength(1);
  });

  it('applies the response plain fields over the detail (status, step, timestamps)', () => {
    const merged = mergeJobIntoDetail(
      makeDetail(),
      makeMutationResponse({
        status: 'in_progress',
        currentStep: 'arrival',
        currentStepIndex: 1,
        updatedAt: '2026-09-04T10:05:00.000Z',
      }),
    );
    expect(merged?.status).toBe('in_progress');
    expect(merged?.currentStep).toBe('arrival');
    expect(merged?.currentStepIndex).toBe(1);
    expect(merged?.updatedAt).toBe('2026-09-04T10:05:00.000Z');
  });

  it('keeps the detail-only arrays (activityLog, attachments) untouched', () => {
    const merged = mergeJobIntoDetail(makeDetail(), makeMutationResponse());
    expect(merged?.activityLog).toHaveLength(1);
    expect(merged?.attachments).toHaveLength(1);
  });
});
