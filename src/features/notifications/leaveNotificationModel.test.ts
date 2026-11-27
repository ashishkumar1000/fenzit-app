/**
 * Model tests for `leaveNotificationModel` (Story 17-6, spec §5): every
 * D5 table event → EXACT copy + icon + tap classification; the reason
 * NULL branch (branch on `reason != null`, never key presence); the
 * revokedDates source (never the span); single-day collapse; the
 * enumerated classifiers (all 8 events classified per role — and the live
 * 9th `leave.*` event `leave.pending_reminder` stays UNclassified so it
 * keeps rendering the generic card); payload drift degrades, never crashes.
 */
import type { ApiNotification } from '../../services';
import {
  LEAVE_APPROVER_EVENTS,
  LEAVE_EMPLOYEE_EVENTS,
  LEAVE_OWNER_EVENTS,
  buildLeaveCards,
  isLeaveApproverEvent,
  isLeaveEmployeeEvent,
  isLeaveOwnerEvent,
} from './leaveNotificationModel';
import { notificationEventAction } from './notificationEventRegistry';

function notification(overrides: Partial<ApiNotification> & { eventType: string; payload?: unknown }): ApiNotification {
  return {
    id: 'n1',
    jobId: null,
    entityType: 'leave',
    entityId: 'req-1',
    payload: {},
    readAt: null,
    createdAt: '2026-09-29T10:00:00Z',
    ...overrides,
  } as ApiNotification;
}

const SPAN = { startDate: '2026-10-05', endDate: '2026-10-09' };

describe('the enumerated classifiers (wire-truth F6)', () => {
  it('classify exactly the shipped table events (9 from 17-6/19-4 + 2 Epic-24 approver notices)', () => {
    for (const event of LEAVE_OWNER_EVENTS) {
      expect(isLeaveOwnerEvent(event)).toBe(true);
      expect(isLeaveEmployeeEvent(event)).toBe(false);
    }
    for (const event of LEAVE_EMPLOYEE_EVENTS) {
      expect(isLeaveEmployeeEvent(event)).toBe(true);
      expect(isLeaveOwnerEvent(event)).toBe(false);
    }
    for (const event of LEAVE_APPROVER_EVENTS) {
      expect(isLeaveApproverEvent(event)).toBe(true);
      expect(isLeaveOwnerEvent(event)).toBe(false);
      expect(isLeaveEmployeeEvent(event)).toBe(false);
    }
    expect(LEAVE_OWNER_EVENTS.length + LEAVE_EMPLOYEE_EVENTS.length).toBe(9);
    expect(LEAVE_APPROVER_EVENTS).toHaveLength(2);
  });

  it('leave.pending_reminder is an owner-style event, but a manager recipient gets a card too', () => {
    expect(isLeaveOwnerEvent('leave.pending_reminder')).toBe(true);
    expect(isLeaveEmployeeEvent('leave.pending_reminder')).toBe(false);
    const n = notification({ eventType: 'leave.pending_reminder', payload: { pendingCount: 2 } });
    expect(notificationEventAction(n, 'company_admin')).toBe('leave');
    // Epic 24: recipient sets are tree-derived — an employee/viewer manager
    // receives the reminder and must see a real card.
    expect(notificationEventAction(n, 'employee')).toBe('leave');
    expect(notificationEventAction(n, 'viewer')).toBe('leave');
  });

  it('the registry routes every enumerated leave event to the leave card, for every role', () => {
    for (const role of ['company_admin', 'employee', 'viewer'] as const) {
      expect(
        notificationEventAction(notification({ eventType: 'leave.applied' }), role),
      ).toBe('leave');
      expect(
        notificationEventAction(notification({ eventType: 'leave.approved' }), role),
      ).toBe('leave');
      expect(
        notificationEventAction(notification({ eventType: 'leave.approver_added' }), role),
      ).toBe('leave');
    }
  });
});

describe('owner cards (spec D5 table)', () => {
  it('leave.applied → "{name} applied for leave" / "{dates} · {n} working days", CalendarOff, Pending', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.applied', payload: { employeeName: 'Arya', ...SPAN, workingDays: 3 } })],
      'company_admin',
    );
    expect(card).toMatchObject({
      title: 'Arya applied for leave',
      message: '5–9 Oct 2026 · 3 working days',
      icon: 'CalendarOff',
      tap: 'owner-pending',
    });
  });

  it('leave.employee_cancelled → the EXACT cancelledDates, not the span (split truth), CalendarX, All', () => {
    const [card] = buildLeaveCards(
      [
        notification({
          eventType: 'leave.employee_cancelled',
          payload: { employeeName: 'Arya', ...SPAN, cancelledDates: ['2026-10-09'] },
        }),
      ],
      'company_admin',
    );
    expect(card).toMatchObject({
      title: 'Arya cancelled leave',
      message: '9 Oct 2026',
      icon: 'CalendarX',
      tap: 'owner-all',
    });
  });

  it('leave.employee_cancelled without cancelledDates degrades to the span', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.employee_cancelled', payload: { employeeName: 'Arya', ...SPAN } })],
      'company_admin',
    );
    expect(card.message).toBe('5–9 Oct 2026');
  });

  it('leave.checkin_auto_cancel → the leaveDate line, CalendarX, All', () => {
    const [card] = buildLeaveCards(
      [
        notification({
          eventType: 'leave.checkin_auto_cancel',
          payload: { employeeName: 'Suresh', leaveDate: '2026-10-05' },
        }),
      ],
      'company_admin',
    );
    expect(card).toMatchObject({
      title: 'Suresh checked in on leave',
      message: 'Their leave on 5 Oct 2026 was cancelled.',
      icon: 'CalendarX',
      tap: 'owner-all',
    });
  });
});

describe('employee cards (spec D5 table)', () => {
  it('leave.applied_on_behalf → "Leave applied for you" · span · count, CalendarOff, guarded tap', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.applied_on_behalf', payload: { ...SPAN, workingDays: 3 } })],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave applied for you',
      message: '5–9 Oct 2026 · 3 working days',
      icon: 'CalendarOff',
      tap: 'attendance-guarded',
    });
  });

  it('leave.approved → "Leave approved", CheckCircle2', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.approved', payload: { ...SPAN, workingDays: 3 } })],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave approved',
      message: '5–9 Oct 2026 · 3 working days',
      icon: 'CheckCircle2',
    });
  });

  it('leave.rejected WITH a reason → `{dates} — "{reason}"`, XCircle', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.rejected', payload: { ...SPAN, reason: 'Harvest week' } })],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave rejected',
      message: '5–9 Oct 2026 — "Harvest week"',
      icon: 'XCircle',
    });
  });

  it('leave.rejected with reason NULL → "{dates}" alone (branch on != null, never key presence)', () => {
    const cards = buildLeaveCards(
      [
        // Key present but null — the live shape for an empty reject reason.
        notification({ eventType: 'leave.rejected', payload: { ...SPAN, reason: null } }),
        // Key absent — same copy, defensive.
        notification({ id: 'n2', eventType: 'leave.rejected', payload: { ...SPAN } }),
      ],
      'employee',
    );
    for (const card of cards) {
      expect(card.message).toBe('5–9 Oct 2026');
    }
  });

  it('leave.owner_revoked → the revokedDates source + reason suffix, Undo2', () => {
    const [card] = buildLeaveCards(
      [
        notification({
          eventType: 'leave.owner_revoked',
          payload: { ...SPAN, revokedDates: ['2026-10-08', '2026-10-09'], reason: 'Coverage gap' },
        }),
      ],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave revoked',
      message: '8 Oct 2026, 9 Oct 2026 no longer count as leave — Coverage gap',
      icon: 'Undo2',
    });
  });

  it('leave.owner_revoked without a reason → the bare line, SINGULAR for one date', () => {
    const [card] = buildLeaveCards(
      [
        notification({
          eventType: 'leave.owner_revoked',
          payload: { ...SPAN, revokedDates: ['2026-10-09'], reason: null },
        }),
      ],
      'employee',
    );
    expect(card.message).toBe('9 Oct 2026 no longer counts as leave');
  });

  it('leave.cancelled_by_disable with cancelledDates → the exact dates, not the span', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.cancelled_by_disable', payload: { ...SPAN, cancelledDates: ['2026-10-05', '2026-10-06'] } })],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave cancelled',
      message: '5 Oct 2026, 6 Oct 2026',
      icon: 'CalendarX',
      tap: 'attendance-guarded',
    });
  });

  it('leave.cancelled_by_disable → "Leave cancelled" / "{dates}", CalendarX, guarded (no-op when none)', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.cancelled_by_disable', payload: { ...SPAN } })],
      'employee',
    );
    expect(card).toMatchObject({
      title: 'Leave cancelled',
      message: '5–9 Oct 2026',
      icon: 'CalendarX',
      tap: 'attendance-guarded',
    });
  });
});

describe('payload truths shared across events', () => {
  it('a single-day span collapses to one date everywhere', () => {
    const [card] = buildLeaveCards(
      [
        notification({
          eventType: 'leave.applied',
          payload: { employeeName: 'Arya', startDate: '2026-10-05', endDate: '2026-10-05', workingDays: 1 },
        }),
      ],
      'company_admin',
    );
    expect(card.message).toBe('5 Oct 2026 · 1 working day');
  });

  it('unread rows carry their id for the optimistic mark-read', () => {
    const [read, unread] = buildLeaveCards(
      [
        notification({ eventType: 'leave.approved', payload: { ...SPAN, workingDays: 1 }, readAt: '2026-09-29T11:00:00Z' }),
        notification({ id: 'n2', eventType: 'leave.approved', payload: { ...SPAN, workingDays: 1 } }),
      ],
      'employee',
    );
    expect(read.unreadIds).toEqual([]);
    expect(unread.unreadIds).toEqual(['n2']);
  });

  it('a drifted payload on a KNOWN event degrades to the minimal honest card', () => {
    const [card] = buildLeaveCards(
      [notification({ eventType: 'leave.approved', payload: { oops: true } })],
      'employee',
    );
    expect(card).toMatchObject({ title: 'Leave approved', message: null });
  });

  it('unknown leave-shaped events never build leave cards (the generic card owns them)', () => {
    const cards = buildLeaveCards(
      [notification({ eventType: 'leave.something_new', payload: {} })],
      'company_admin',
    );
    expect(cards).toEqual([]);
  });
});

describe('buildLeaveCards — viewer', () => {
  it('builds real cards for a viewer manager (Epic 24: recipients are tree-derived)', () => {
    const rows = [
      ...LEAVE_OWNER_EVENTS,
      ...LEAVE_EMPLOYEE_EVENTS,
      ...LEAVE_APPROVER_EVENTS,
    ].map(eventType => notification({ eventType }));
    expect(buildLeaveCards(rows, 'viewer')).toHaveLength(rows.length);
  });

  it('an empty list builds an empty list for every role', () => {
    for (const role of ['company_admin', 'employee', 'viewer'] as const) {
      expect(buildLeaveCards([], role)).toEqual([]);
    }
  });
});
