/**
 * Pure display mappings in `src/features/jobs/format.ts`.
 */
import {
  formatTimeLabel,
  statusToBadge,
} from '../src/features/jobs/format';
import type { JobStatusApi } from '../src/services';

describe('statusToBadge', () => {
  it.each([
    ['scheduled', 'scheduled'],
    ['in_progress', 'progress'],
    ['completed', 'done'],
    ['cancelled', 'cancelled'],
    // Epic 22's two new statuses — dropping either map entry would hit the
    // scheduled fallback and label a rejected job "Scheduled" (review catch:
    // these two rows had no pin).
    ['pending_approval', 'pendingApproval'],
    ['rejected', 'rejected'],
  ] as const)('maps %s to the %s badge key', (apiStatus, badge) => {
    expect(statusToBadge(apiStatus)).toBe(badge);
  });

  it('falls back to scheduled for an unknown status (enum drift)', () => {
    expect(statusToBadge('mystery_status' as JobStatusApi)).toBe('scheduled');
  });
});

describe('formatTimeLabel', () => {
  // Built from local-time components (not ISO strings) so the assertions
  // hold in any timezone — the label renders in the device's zone.
  const start = new Date(2026, 7, 12, 14, 0);
  const end = new Date(2026, 7, 12, 16, 30);

  it('formats a start–end range with an en dash', () => {
    expect(formatTimeLabel(start.toISOString(), end.toISOString())).toMatch(/^2:00\s*\S*\s*[–-]\s*4:30/);
  });

  it('UPPERCASES the meridiem — the app-wide convention (case-sensitive pin)', () => {
    // The casing split Sally flagged (2026-11-13): a job row read "3:30 pm"
    // under a punch tile saying "4:06 AM". The old pin used /[AP]M/i, which
    // matched lowercase too — a regression back to "3:30 pm" passed the
    // suite. No `i` flag here.
    expect(formatTimeLabel(start.toISOString(), end.toISOString())).toMatch(/2:00\s+PM\s*[–-]\s*4:30\s+PM/);
    expect(formatTimeLabel(start.toISOString(), null)).toMatch(/2:00\s+PM/);
    expect(formatTimeLabel(start.toISOString(), end.toISOString())).not.toMatch(/PMs|pm/);
  });

  it('formats a single time when there is no end', () => {
    const label = formatTimeLabel(start.toISOString(), null);
    expect(label).toMatch(/^2:00/);
    expect(label).not.toMatch(/[–-]/);
  });
});