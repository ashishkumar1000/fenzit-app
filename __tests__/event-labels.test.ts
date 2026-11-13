/**
 * Activity-event display labels (`src/features/jobDetail/eventLabels.ts`) —
 * non-step event types must render their friendly label (never the snake_case
 * raw value), and anything unknown must pass through raw rather than crash or
 * render `undefined` (AC 3). Step events are resolved at the timeline level
 * with template-aware lookup (see ActivityTimeline).
 */
import {
  eventLabel,
  eventStatusKey,
  resolveEventLabel,
} from '../src/features/jobDetail/eventLabels';

/** The non-step event types the backend emits (api-contracts §4). */
const KNOWN_EVENT_TYPES = [
  'job_created',
  'job_reassigned',
  'job_cancelled',
  'conflict_resolved',
] as const;

const EXPECTED_LABELS: Record<(typeof KNOWN_EVENT_TYPES)[number], string> = {
  job_created: 'Job created',
  job_reassigned: 'Reassigned to another employee',
  job_cancelled: 'Job cancelled',
  conflict_resolved: 'Sent a saved update',
};

describe('eventLabel', () => {
  it('has a friendly label for each of the four known non-step event types', () => {
    expect(KNOWN_EVENT_TYPES).toHaveLength(4);
    KNOWN_EVENT_TYPES.forEach(eventType => {
      expect(eventLabel(eventType)).toBe(EXPECTED_LABELS[eventType]);
    });
  });

  it('never returns the raw snake_case value for a known type', () => {
    KNOWN_EVENT_TYPES.forEach(eventType => {
      expect(eventLabel(eventType)).not.toContain('_');
    });
  });

  it.each(['something_new', 'step_forthcoming', '', 'JOB_CREATED'])(
    'passes an unknown event type (%s) through raw',
    unknown => {
      expect(eventLabel(unknown)).toBe(unknown);
    },
  );

  it('passes step event types through raw (ActivityTimeline handles template lookup)', () => {
    // Step events are resolved at the timeline level with template-aware lookup.
    expect(eventLabel('step_on_my_way')).toBe('step_on_my_way');
    expect(eventLabel('step_completed')).toBe('step_completed');
  });
});

describe('eventLabel — Epic 22 approval lifecycle', () => {
  // These four rows exist because the raw snake_case keys WERE reaching the
  // screen before Epic 22's extension: the ledger note "the suites passed
  // with the maps deleted" was the gap. Each row fails if its LABELS entry
  // is ever removed — the passthrough fallback would return the raw key.
  const LIFECYCLE_LABELS: Record<string, string> = {
    job_submitted: 'Submitted for approval',
    job_approved: 'Approved',
    job_rejected: 'Rejected',
    job_edited: 'Changed by owner',
  };

  it.each(Object.entries(LIFECYCLE_LABELS))(
    'labels %s as "%s", never the raw key',
    (eventType, expected) => {
      expect(eventLabel(eventType)).toBe(expected);
      expect(eventLabel(eventType)).not.toContain('_');
    },
  );

  it('the header badge resolves lifecycle labels without a template too', () => {
    for (const eventType of Object.keys(LIFECYCLE_LABELS)) {
      expect(resolveEventLabel(eventType)).toBe(LIFECYCLE_LABELS[eventType]);
    }
  });
});

describe('eventStatusKey — the timeline dot colours', () => {
  it('codes the approval lifecycle: waiting amber, approved green, rejected red', () => {
    expect(eventStatusKey('job_submitted')).toBe('pendingApproval');
    expect(eventStatusKey('job_approved')).toBe('done');
    expect(eventStatusKey('job_rejected')).toBe('rejected');
  });

  it('keeps the non-lifecycle rows neutral and codes the old rules', () => {
    expect(eventStatusKey('job_edited')).toBe('neutral');
    expect(eventStatusKey('job_created')).toBe('neutral');
    expect(eventStatusKey('job_reassigned')).toBe('neutral');
    expect(eventStatusKey('conflict_resolved')).toBe('neutral');
    expect(eventStatusKey('job_cancelled')).toBe('cancelled');
    expect(eventStatusKey('step_completed')).toBe('done');
    expect(eventStatusKey('step_on_my_way')).toBe('progress');
    expect(eventStatusKey('brand_new_event')).toBe('neutral');
  });

  it('guards against a missing event type instead of crashing', () => {
    expect(eventStatusKey('')).toBe('neutral');
    expect(eventStatusKey(undefined as unknown as string)).toBe('neutral');
    expect(eventStatusKey(null as unknown as string)).toBe('neutral');
  });

  it('treats any step_* prefix as in progress, including unknown steps', () => {
    expect(eventStatusKey('step_forthcoming')).toBe('progress');
  });
});