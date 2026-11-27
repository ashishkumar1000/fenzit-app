/**
 * notificationTapModel.ts — the bell's kind→route tap decision, extracted
 * pure so push taps and inbox taps share ONE mapping (Firebase spec CAP-3:
 * "a push tap lands exactly where the bell's tap for the same event lands
 * — one shared mapping, same role rules, same attendance guard").
 *
 * The decisions moved here verbatim from NotificationsScreen's three tap
 * handlers (job/report cards, attendance cards, leave cards); the screen
 * now computes a `NotificationTapTarget` and hands it to
 * `openTapTarget`, and the push bridge does the same from its
 * `{ type, id }` data payload via `pushTapTargetForEvent`. Existing screen
 * behaviour is bit-identical:
 *   - job cards → JobDetail (owner) / TechJobDetail (employee);
 *   - report cards → Reports, company-wide roles only;
 *   - attendance `dashboard` tap → AttendanceDashboard (owner, bypasses
 *     the guard — an owner-stack route, never the tab seam);
 *   - every other attendance/leave employee tap → the Attendance tab ONLY
 *     while `isAttendanceReachable()` says the tab exists (FR-3: a tap can
 *     never open a route that is not registered), via the nested-delegate
 *     form (device-found bug #2: a plain `navigate('Attendance')` from the
 *     root stack is not handled);
 *   - leave owner taps → OwnerLeave's Requests pane (`owner-pending` opens
 *     the Needs-review filter; every other owner event opens All);
 *   - a blocked guard or an unknown event type yields `null` — the caller
 *     does nothing (no navigation AND no read-mark).
 *
 * No React, no network. The only side effect is the `notification_tap`
 * analytics event fired by `openTapTarget` when a target actually lands.
 */
import { isCompanyWideRole, isEmployeeRole, isAdminRole } from '../auth/roles';
import {
  isAttendanceEventType,
  isAttendanceReachable,
} from '../../services/attendanceAccessEvents';
import { logEvent } from '../../services/telemetry';
import type { UserRole } from '../../services';
import { ATTENDANCE_NOTIFICATION_EVENT } from '../attendance/notifications/notificationEvents';
import {
  REPORT_FAILED_EVENT,
  REPORT_READY_EVENT,
} from './reportNotificationModel';
import {
  LEAVE_APPROVER_EVENTS,
  LEAVE_EMPLOYEE_EVENTS,
  LEAVE_OWNER_EVENTS,
} from './leaveNotificationModel';

/**
 * Where a notification tap lands. `TechnicianTabsAttendance` is the
 * nested-delegate form (`navigate('TechnicianTabs', { screen: 'Attendance' })`)
 * — the Attendance route is a TAB inside TechnicianTabs, invisible to the
 * root stack's plain navigate (device-found: "The action 'NAVIGATE' … was
 * not handled").
 */
export type NotificationTapTarget =
  | { readonly route: 'JobDetail'; readonly params: { readonly jobId: string } }
  | { readonly route: 'TechJobDetail'; readonly params: { readonly jobId: string } }
  | { readonly route: 'Reports' }
  | { readonly route: 'AttendanceDashboard' }
  | { readonly route: 'TechnicianTabsAttendance' }
  | {
      readonly route: 'YourTeam';
      readonly params: { readonly segment: 'leave' };
    }
  | { readonly route: 'OwnerLeave'; readonly params: { readonly tab: 'requests'; readonly filter?: 'pending' | 'all' } };

/**
 * The navigation call the executor needs — structural, so both the screen's
 * `navigation` prop and `navigationRef` adapt with a one-line arrow (the
 * route names cross both stacks' param lists, which no single type covers).
 */
export type TapNavigate = (name: string, params?: Record<string, unknown>) => void;

/** The registry's card-kind vocabulary — also the analytics `type` value. */
export type NotificationTapKind = 'job' | 'report' | 'attendance' | 'leave';

/**
 * The JOB cards' decision (the screen's `handleCardPress`, job branch):
 * the viewer for the signed-in role's tree — JobDetail for owner roles,
 * TechJobDetail for an employee (Story 14-3's role-routed deep link).
 */
export function tapTargetForJobCard(
  role: UserRole | null,
  jobId: string,
): NotificationTapTarget {
  if (isEmployeeRole(role)) {
    return { route: 'TechJobDetail', params: { jobId } };
  }
  return { route: 'JobDetail', params: { jobId } };
}

/**
 * The REPORT cards' decision (the screen's `handleCardPress`, report
 * branch): a report notification points at a REPORT, not a job — the
 * Reports screen (Epic 12), company-wide roles only. A non-company-wide
 * role's report rows render generic (the card kind is unreachable for
 * them), so the null here mirrors the screen's old early return.
 */
export function tapTargetForReportCard(role: UserRole | null): NotificationTapTarget | null {
  if (!isCompanyWideRole(role)) return null;
  return { route: 'Reports' };
}

/**
 * The attendance cards' decision (the screen's `handleAttendanceCardPress`):
 * the owner's `dashboard` tap bypasses the reachability guard (it lands on
 * the AttendanceDashboard, an owner-stack route that never rides the tab
 * seam) — the `attendanceReachable` THUNK is invoked ONLY for the guarded
 * branch, so a dashboard tap never consults the access seam at all (the
 * 19-4 pinned behaviour); every guarded tap consults it FIRST — `false`
 * (the Attendance tab does not exist for this user) yields `null`, a
 * strict no-op (no navigation AND no read-mark mutation; the frozen 15-10
 * matrix).
 */
export function tapTargetForAttendance(
  tap: 'attendance-guarded' | 'dashboard',
  attendanceReachable: () => boolean,
): NotificationTapTarget | null {
  if (tap === 'dashboard') return { route: 'AttendanceDashboard' };
  if (!attendanceReachable()) return null;
  return { route: 'TechnicianTabsAttendance' };
}

/**
 * The leave cards' decision (the screen's `handleLeaveCardPress`): the
 * employee-side `attendance-guarded` tap consults the same guard (lazily —
 * an owner tap never reads the seam); owner taps land on the Leave
 * surface's Requests pane with the right filter (`owner-pending` →
 * Needs-review — the actionable queue; `owner-all` → All).
 *
 * Epic 24 — a manager recipient (employee OR viewer) is not the owner: the
 * review events and the team-pending taps land on **Your team · Leave**,
 * the only surface that shows their subtree's queue. An admin keeps the
 * owner's Leave screen.
 */
export function tapTargetForLeave(
  tap: 'owner-pending' | 'owner-all' | 'attendance-guarded' | 'team-pending',
  role: UserRole | null,
  attendanceReachable: () => boolean,
): NotificationTapTarget | null {
  if (tap === 'team-pending') {
    // An admin has no team surface (the gate is non-admin + headcount);
    // the owner's pending queue is where their decisions live.
    return isAdminRole(role)
      ? { route: 'OwnerLeave', params: { tab: 'requests', filter: 'pending' } }
      : { route: 'YourTeam', params: { segment: 'leave' } };
  }
  if (tap === 'attendance-guarded') {
    if (!attendanceReachable()) return null;
    return { route: 'TechnicianTabsAttendance' };
  }
  if (!isAdminRole(role)) {
    // A viewer or employee manager receiving an owner-style event decides it
    // from their team queue, never from the owner console.
    return { route: 'YourTeam', params: { segment: 'leave' } };
  }
  return {
    route: 'OwnerLeave',
    params: { tab: 'requests', filter: tap === 'owner-pending' ? 'pending' : 'all' },
  };
}

/** True only for the two report-engine terminal events. */
function isReportEventType(eventType: string): boolean {
  return eventType === REPORT_READY_EVENT || eventType === REPORT_FAILED_EVENT;
}

/** EXACTLY the 19-4 reminder literals (the registry's enumeration). */
function isAttendanceReminderEvent(eventType: string): boolean {
  return (
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKIN ||
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_CHECKOUT ||
    eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN
  );
}

/**
 * Leave, attendance, reminder and report events carry an entity id, not a
 * job id. They are never job cards, so the job fallback must skip them.
 */
function isNonJobEventType(eventType: string): boolean {
  return (
    eventType.startsWith('leave.') ||
    eventType.startsWith('attendance.') ||
    isReportEventType(eventType) ||
    isAttendanceReminderEvent(eventType)
  );
}

/**
 * The push side of the shared mapping: one notification event
 * (`{ type, id }` — the hybrid message's data, id = job_id ?? entity_id)
 * classified the way `notificationEventAction` classifies a row, then routed
 * exactly as the bell's cards are. `null` = no navigation (app opens only):
 * an unknown event type (a newer backend's family this build has never
 * seen) or a known type with no id to land on.
 *
 * The reachability guard is read live through the access seam — the same
 * source the inbox taps consult, so a revoked enrolment blocks both.
 */
export function pushTapTargetForEvent(
  eventType: string | null,
  id: string | null,
  role: UserRole | null,
): NotificationTapTarget | null {
  if (eventType === null) return null;

  // Reports — company-wide roles (owner surface; a viewer cannot read them
  // beyond requesting, an employee's rows are generic, both no-ops).
  if (isReportEventType(eventType)) {
    return isCompanyWideRole(role) ? { route: 'Reports' } : null;
  }
  // The 19-4 reminder literals — role-agnostic (the owner's office summary
  // lands on the dashboard; the employee's personal nudges ride the tab).
  if (isAttendanceReminderEvent(eventType)) {
    return tapTargetForAttendance(
      eventType === ATTENDANCE_NOTIFICATION_EVENT.REMINDER_NOT_CHECKED_IN
        ? 'dashboard'
        : 'attendance-guarded',
      isAttendanceReachable,
    );
  }
  // attendance.* rows — a technician surface (15-10): the guarded tab.
  if (isEmployeeRole(role) && isAttendanceEventType(eventType)) {
    return tapTargetForAttendance('attendance-guarded', isAttendanceReachable);
  }
  // Leave — Epic 24 widens the recipients to any manager (admin, employee or
  // viewer). The two review events land on the owner's queue for an admin
  // and on Your team for a manager; the approver-set cards always land on
  // Your team; the employee decision events ride the guarded tab (a
  // disabled-tracking cancellation must no-op like the bell's card).
  if ((LEAVE_APPROVER_EVENTS as readonly string[]).includes(eventType)) {
    // The owner can be the resolved approver; they keep the owner's queue
    // (Your team deliberately never renders for an admin).
    return isAdminRole(role)
      ? tapTargetForLeave('owner-pending', role, isAttendanceReachable)
      : { route: 'YourTeam', params: { segment: 'leave' } };
  }
  if (eventType === 'leave.applied' || eventType === 'leave.pending_reminder') {
    return isAdminRole(role)
      ? tapTargetForLeave('owner-pending', role, isAttendanceReachable)
      : { route: 'YourTeam', params: { segment: 'leave' } };
  }
  if (isAdminRole(role) && (LEAVE_OWNER_EVENTS as readonly string[]).includes(eventType)) {
    return tapTargetForLeave('owner-all', role, isAttendanceReachable);
  }
  if (isEmployeeRole(role) && (LEAVE_EMPLOYEE_EVENTS as readonly string[]).includes(eventType)) {
    return tapTargetForAttendance('attendance-guarded', isAttendanceReachable);
  }
  // Job events — the registry's fallback: a row with a job id is a job
  // card (any workflow step key), routed to the role's viewer. A null id
  // (job-less unknown type) opens the app without navigation. A null role
  // (session not known yet) also opens without navigation: the job route
  // is role-keyed, and guessing it would land an employee on JobDetail
  // (an owner-stack screen their tree does not have).
  // Leave, attendance, reminder and report events carry an entity id, not a
  // job id, so they must never fall through to the job card.
  if (isNonJobEventType(eventType)) {
    return null;
  }
  // The inbox card for this event is deliberately inert (a re-parent may
  // have moved the job out of the reader's branch); the push must match,
  // or the shade tap opens the job and 404s.
  if (eventType === 'job.approver_removed') {
    return null;
  }
  if (id !== null && role !== null) {
    return tapTargetForJobCard(role, id);
  }
  return null;
}

/**
 * The registry card-kind for one tap target — the analytics `type` value of
 * `notification_tap`, so push and inbox taps report from the SAME closed
 * vocabulary (a grouped job card and a job push both report "job").
 */
function kindOfTarget(target: NotificationTapTarget): NotificationTapKind {
  switch (target.route) {
    case 'Reports':
      return 'report';
    case 'AttendanceDashboard':
    case 'TechnicianTabsAttendance':
      return 'attendance';
    case 'OwnerLeave':
      return 'leave';
    case 'YourTeam':
      return 'leave';
    default:
      return 'job';
  }
}

/**
 * Executes one tap target: logs `notification_tap` (the catalog event,
 * CAP-5) and navigates. A `null` target (unknown type, guard-blocked) is a
 * no-op — nothing logged, nothing navigated. The delegate form for the
 * Attendance tab lives HERE, so no second call site can re-introduce the
 * device-found plain-navigate bug.
 */
export function openTapTarget(
  navigate: TapNavigate,
  target: NotificationTapTarget | null,
  source: 'inbox' | 'push',
): void {
  if (target === null) return;
  logEvent('notification_tap', { source, type: kindOfTarget(target) });
  switch (target.route) {
    case 'JobDetail':
      navigate('JobDetail', { jobId: target.params.jobId });
      return;
    case 'TechJobDetail':
      navigate('TechJobDetail', { jobId: target.params.jobId });
      return;
    case 'Reports':
      navigate('Reports');
      return;
    case 'AttendanceDashboard':
      navigate('AttendanceDashboard');
      return;
    case 'TechnicianTabsAttendance':
      navigate('TechnicianTabs', { screen: 'Attendance' });
      return;
    case 'OwnerLeave':
      navigate('OwnerLeave', { tab: target.params.tab, filter: target.params.filter });
      return;
    case 'YourTeam':
      navigate('YourTeam', { segment: target.params.segment });
      return;
  }
}
