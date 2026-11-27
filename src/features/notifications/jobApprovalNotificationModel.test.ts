/**
 * The Epic 22 approval-lifecycle cards, plus Epic 24's two tree-change
 * notices (`job.approver_added` / `job.approver_removed`). The new pair is
 * the reason this file exists: the inbox must render both titles, and the
 * removed notice must stay inert (`tappable: false`) — its job may have left
 * the reader's branch, so a tap would 404.
 */
import {
  JOB_APPROVAL_EVENTS,
  buildJobApprovalCards,
  isJobApprovalEvent,
} from './jobApprovalNotificationModel';
import type { ApiNotification } from '../../services';

function row(
  eventType: string,
  payload: Record<string, unknown> = {
    job_number: 'JB-2026-0007',
    customer_name: 'Asha Rao',
  },
  overrides: Partial<ApiNotification> = {},
): ApiNotification {
  return {
    id: `n-${eventType}`,
    jobId: 'job-1',
    eventType,
    entityType: 'job',
    entityId: 'job-1',
    payload,
    readAt: null,
    createdAt: '2026-11-27T08:00:00.000Z',
    ...overrides,
  };
}

describe('isJobApprovalEvent', () => {
  it('classifies all seven approval events and nothing else', () => {
    for (const event of JOB_APPROVAL_EVENTS) {
      expect(isJobApprovalEvent(event)).toBe(true);
    }
    expect(JOB_APPROVAL_EVENTS).toHaveLength(7);
    expect(isJobApprovalEvent('job.assigned')).toBe(false);
    expect(isJobApprovalEvent('job.future_step')).toBe(false);
  });
});

describe('buildJobApprovalCards', () => {
  it('gives every event its fixed title and one card per row', () => {
    const cards = buildJobApprovalCards(JOB_APPROVAL_EVENTS.map(event => row(event)));

    expect(cards).toHaveLength(7);
    expect(cards.map(card => card.title)).toEqual([
      'New job waiting for approval',
      'Your job was approved',
      'Your job was rejected',
      'Your pending job was cancelled',
      'Your pending job was changed',
      'Now waiting for your approval',
      'No longer yours to approve',
    ]);
    expect(cards[0].message).toBe('JB-2026-0007 · Asha Rao');
  });

  it('keeps only job.approver_removed inert', () => {
    const cards = buildJobApprovalCards(JOB_APPROVAL_EVENTS.map(event => row(event)));
    const byEvent = new Map(
      JOB_APPROVAL_EVENTS.map((event, index) => [event, cards[index]]),
    );

    expect(byEvent.get('job.approver_removed')!.tappable).toBe(false);
    for (const event of JOB_APPROVAL_EVENTS) {
      if (event === 'job.approver_removed') continue;
      expect(byEvent.get(event)!.tappable).toBe(true);
    }
  });

  it('drops a jobless row (wire drift) rather than building a dead card', () => {
    expect(buildJobApprovalCards([row('job.submitted', {}, { jobId: null })])).toEqual([]);
  });
});
