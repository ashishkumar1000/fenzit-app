/**
 * Push tap routing matrix (Firebase CAP-3): a `{ type, id }` push must land
 * where the bell's tap for the same event lands, per role, with the
 * attendance reachability guard honoured. Each row below is one decision
 * a real user can reach from a notification tap.
 */
import type { UserRole } from '../../services';
import { openTapTarget, pushTapTargetForEvent } from './notificationTapModel';

let mockReachable = true;

jest.mock('../../services/attendanceAccessEvents', () => ({
  isAttendanceEventType: (t: string) =>
    typeof t === 'string' && t.startsWith('attendance.'),
  isAttendanceReachable: () => mockReachable,
}));

jest.mock('../../services/telemetry', () => ({
  logEvent: jest.fn(),
}));

const JOB = 'job-123';
const LEAVE_ID = 'leave-456';
const OWNER: UserRole = 'company_admin';
const VIEWER: UserRole = 'viewer';
const EMPLOYEE: UserRole = 'employee';

describe('pushTapTargetForEvent — push tap routing matrix', () => {
  beforeEach(() => {
    mockReachable = true;
  });

  describe('no navigation (app opens only)', () => {
    it('a missing type never navigates', () => {
      expect(pushTapTargetForEvent(null, JOB, EMPLOYEE)).toBeNull();
    });

    it('an unknown type with no id never navigates', () => {
      expect(pushTapTargetForEvent('mystery.event', null, EMPLOYEE)).toBeNull();
    });

    it('a job-less event with no id never navigates', () => {
      expect(pushTapTargetForEvent('leave.approved', null, OWNER)).toBeNull();
    });
  });

  describe('job events', () => {
    it('job.assigned lands an employee on TechJobDetail with the job id', () => {
      expect(pushTapTargetForEvent('job.assigned', JOB, EMPLOYEE)).toEqual({
        route: 'TechJobDetail',
        params: { jobId: JOB },
      });
    });

    it('job.assigned lands an owner on the admin JobDetail', () => {
      expect(pushTapTargetForEvent('job.assigned', JOB, OWNER)).toEqual({
        route: 'JobDetail',
        params: { jobId: JOB },
      });
    });

    it('a workflow-step job event lands a viewer on JobDetail', () => {
      expect(pushTapTargetForEvent('job.step_completed', JOB, VIEWER)).toEqual({
        route: 'JobDetail',
        params: { jobId: JOB },
      });
    });

    it('a job event with no signed-in role never lands the owner route on an employee tree', () => {
      // A null role means the session is not known yet: the tap must not
      // guess JobDetail (an owner-stack screen the employee tree lacks).
      expect(pushTapTargetForEvent('job.assigned', JOB, null)).toBeNull();
    });
  });

  describe('report events (company-wide roles only)', () => {
    it.each(['report_ready', 'report_failed'])(
      '%s lands an owner or viewer on Reports',
      (type) => {
        expect(pushTapTargetForEvent(type, 'r1', OWNER)).toEqual({ route: 'Reports' });
        expect(pushTapTargetForEvent(type, 'r1', VIEWER)).toEqual({ route: 'Reports' });
      },
    );

    it('a report event never navigates an employee', () => {
      expect(pushTapTargetForEvent('report_ready', 'r1', EMPLOYEE)).toBeNull();
    });
  });

  describe('attendance reminders (role-agnostic literals)', () => {
    it('reminder_not_checked_in lands the owner on AttendanceDashboard, bypassing the guard', () => {
      mockReachable = false;
      expect(
        pushTapTargetForEvent('attendance.reminder_not_checked_in', null, OWNER),
      ).toEqual({ route: 'AttendanceDashboard' });
    });

    it('reminder_checkin lands an employee on the Attendance tab when reachable', () => {
      expect(
        pushTapTargetForEvent('attendance.reminder_checkin', null, EMPLOYEE),
      ).toEqual({ route: 'TechnicianTabsAttendance' });
    });

    it('reminder_checkout is guarded: no tab, no navigation', () => {
      mockReachable = false;
      expect(
        pushTapTargetForEvent('attendance.reminder_checkout', null, EMPLOYEE),
      ).toBeNull();
    });
  });

  describe('attendance events for the technician (guarded tab)', () => {
    it('lands the employee on the Attendance tab when reachable', () => {
      expect(
        pushTapTargetForEvent('attendance.holiday_added', null, EMPLOYEE),
      ).toEqual({ route: 'TechnicianTabsAttendance' });
    });

    it('a revoked enrolment (guard off) blocks the tap — the bell and the push agree', () => {
      mockReachable = false;
      expect(
        pushTapTargetForEvent('attendance.holiday_added', null, EMPLOYEE),
      ).toBeNull();
    });

    it('owners get no attendance deep link (the bell shows these as generic rows)', () => {
      expect(
        pushTapTargetForEvent('attendance.fake_location', null, OWNER),
      ).toBeNull();
    });
  });

  describe('leave events', () => {
    it('leave.applied lands the owner on the Needs-review filter of the Requests pane', () => {
      expect(pushTapTargetForEvent('leave.applied', null, OWNER)).toEqual({
        route: 'OwnerLeave',
        params: { tab: 'requests', filter: 'pending' },
      });
    });

    it('leave.pending_reminder lands the owner on the Needs-review filter of the Requests pane', () => {
      expect(
        pushTapTargetForEvent('leave.pending_reminder', null, OWNER),
      ).toEqual({
        route: 'OwnerLeave',
        params: { tab: 'requests', filter: 'pending' },
      });
    });

    it('an owner review event (leave.employee_cancelled) lands the owner on the All filter', () => {
      expect(
        pushTapTargetForEvent('leave.employee_cancelled', null, OWNER),
      ).toEqual({
        route: 'OwnerLeave',
        params: { tab: 'requests', filter: 'all' },
      });
    });

    it('an employee decision event is not an owner event: the owner gets no navigation', () => {
      expect(pushTapTargetForEvent('leave.approved', null, OWNER)).toBeNull();
    });

    it('an employee leave decision rides the guarded Attendance tab', () => {
      expect(pushTapTargetForEvent('leave.approved', null, EMPLOYEE)).toEqual({
        route: 'TechnicianTabsAttendance',
      });
      mockReachable = false;
      expect(pushTapTargetForEvent('leave.approved', null, EMPLOYEE)).toBeNull();
    });
  });

  describe('unknown types with an id (registry fallback)', () => {
    it('an unknown workflow key with a job id opens that job for the role', () => {
      expect(pushTapTargetForEvent('job.future_step', JOB, EMPLOYEE)).toEqual({
        route: 'TechJobDetail',
        params: { jobId: JOB },
      });
    });

    it('an unknown leave type carrying an entity id never opens a job card', () => {
      // The backend sends job_id ?? entity_id as the id, so a leave event
      // with no job reaches the fallback with a leave UUID in `id`.
      expect(pushTapTargetForEvent('leave.future_state', LEAVE_ID, OWNER)).toBeNull();
      expect(pushTapTargetForEvent('leave.future_state', LEAVE_ID, EMPLOYEE)).toBeNull();
    });

    it('an unknown attendance type carrying an entity id never opens a job card', () => {
      // The attendance family lands on the attendance tab (or nothing, when
      // the seam is closed). The requirement is only that it is never a job.
      expect(
        pushTapTargetForEvent('attendance.future_state', LEAVE_ID, EMPLOYEE)?.route,
      ).not.toBe('TechJobDetail');
    });

    it('a workflow step key (no dot) with a job id still opens the job, even if it looks like a family name', () => {
      expect(pushTapTargetForEvent('leave_review_step', JOB, EMPLOYEE)).toEqual({
        route: 'TechJobDetail',
        params: { jobId: JOB },
      });
    });
  });
});

describe('openTapTarget — the executor composes the OwnerLeave navigate params', () => {
  // The executor used to be unobserved for the OwnerLeave branch: dropping
  // the `filter` param shipped no failure, and a push tap for an owner-all
  // event landed on Needs review with the relevant request hidden (the
  // landing-visibility rule — the review's verification gap, 2026-11-26).
  it('the owner-pending target navigates with BOTH tab and filter', () => {
    const navigate = jest.fn();
    openTapTarget(
      navigate,
      { route: 'OwnerLeave', params: { tab: 'requests', filter: 'pending' } },
      'inbox',
    );
    expect(navigate).toHaveBeenCalledWith('OwnerLeave', {
      tab: 'requests',
      filter: 'pending',
    });
  });

  it('the push tap for an owner-all event lands on the All filter through the executor', () => {
    const navigate = jest.fn();
    // employee_cancelled is an OWNER event (the owner-all branch);
    // leave.approved is the employee's own decision event.
    const target = pushTapTargetForEvent('leave.employee_cancelled', LEAVE_ID, OWNER);
    expect(target).toEqual({
      route: 'OwnerLeave',
      params: { tab: 'requests', filter: 'all' },
    });
    openTapTarget(navigate, target, 'push');
    expect(navigate).toHaveBeenCalledWith('OwnerLeave', {
      tab: 'requests',
      filter: 'all',
    });
  });

  it('a null target is a no-op', () => {
    const navigate = jest.fn();
    openTapTarget(navigate, null, 'push');
    expect(navigate).not.toHaveBeenCalled();
  });
});
