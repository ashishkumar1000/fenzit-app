/**
 * The bell's leave-card tap split (Epic 24, 24-5): a review or approver-set
 * card lands on the owner's queue for an admin and on Your team · Leave for
 * a manager (employee or viewer). This is the mapping `NotificationsScreen`
 * calls, so a regression here silently sends a manager to a route their
 * stack does not have — or to the owner console. Also covers
 * `openTapTarget`'s YourTeam navigate + analytics.
 */
import { openTapTarget, tapTargetForLeave } from './notificationTapModel';
import { logEvent } from '../../services/telemetry';

let mockReachable = true;

jest.mock('../../services/attendanceAccessEvents', () => ({
  isAttendanceEventType: (t: string) =>
    typeof t === 'string' && t.startsWith('attendance.'),
  isAttendanceReachable: () => mockReachable,
}));

jest.mock('../../services/telemetry', () => ({
  logEvent: jest.fn(),
}));

const reachable = () => mockReachable;
const logEventMock = logEvent as jest.Mock;

beforeEach(() => {
  mockReachable = true;
  logEventMock.mockClear();
});

describe('tapTargetForLeave — role split', () => {
  it('an admin keeps the owner queue, filtered by the card kind', () => {
    expect(tapTargetForLeave('owner-pending', 'company_admin', reachable)).toEqual({
      route: 'OwnerLeave',
      params: { tab: 'requests', filter: 'pending' },
    });
    expect(tapTargetForLeave('owner-all', 'company_admin', reachable)).toEqual({
      route: 'OwnerLeave',
      params: { tab: 'requests', filter: 'all' },
    });
  });

  it('a manager (employee or viewer) lands an owner-style card on Your team · Leave', () => {
    for (const role of ['employee', 'viewer'] as const) {
      expect(tapTargetForLeave('owner-pending', role, reachable)).toEqual({
        route: 'YourTeam',
        params: { segment: 'leave' },
      });
      expect(tapTargetForLeave('owner-all', role, reachable)).toEqual({
        route: 'YourTeam',
        params: { segment: 'leave' },
      });
    }
  });

  it('the approver-set card lands on Your team for a manager and the owner queue for an admin', () => {
    expect(tapTargetForLeave('team-pending', 'employee', reachable)).toEqual({
      route: 'YourTeam',
      params: { segment: 'leave' },
    });
    expect(tapTargetForLeave('team-pending', 'viewer', reachable)).toEqual({
      route: 'YourTeam',
      params: { segment: 'leave' },
    });
    expect(tapTargetForLeave('team-pending', 'company_admin', reachable)).toEqual({
      route: 'OwnerLeave',
      params: { tab: 'requests', filter: 'pending' },
    });
  });

  it('the employee tap honours the attendance guard', () => {
    expect(tapTargetForLeave('attendance-guarded', 'employee', reachable)).toEqual({
      route: 'TechnicianTabsAttendance',
    });
    mockReachable = false;
    expect(tapTargetForLeave('attendance-guarded', 'employee', reachable)).toBeNull();
  });
});

describe('openTapTarget — YourTeam', () => {
  it('navigates to YourTeam with the segment and logs one leave tap', () => {
    const navigate = jest.fn();
    openTapTarget(
      navigate,
      { route: 'YourTeam', params: { segment: 'leave' } },
      'inbox',
    );
    expect(navigate).toHaveBeenCalledWith('YourTeam', { segment: 'leave' });
    expect(logEventMock).toHaveBeenCalledWith('notification_tap', {
      source: 'inbox',
      type: 'leave',
    });
  });

  it('a null target is a no-op: nothing navigated, nothing logged', () => {
    const navigate = jest.fn();
    openTapTarget(navigate, null, 'push');
    expect(navigate).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
