/**
 * RealtimeBridge — Story 14-3's dual-role mount, automated: probe-rendered
 * with a mocked session per role. The bridge renders whatever banner the
 * hook raises: the owner job-status toast, and (UX spec 2026-11-07) the
 * technician's `job.assigned` assignment toast — so a technician session
 * with a raised banner now renders it through. A technician session still
 * ENABLES the hook (their socket must open — the token endpoint opened to
 * technicians in Story 14-2); a bootstrap-null session suspends the hook
 * entirely. StatusBanner's own rendering is covered by
 * `src/components/StatusBanner.test.tsx`.
 *
 * REQUIREMENT CHANGE NOTE (UX spec 2026-11-07, adopted): the old contract
 * ("technician never renders StatusBanner") is superseded — the hook now
 * raises the `job.assigned` banner on the technician branch, so the old
 * pinning test became wrong about the requirement, not about behaviour.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

let mockSession: { role: string | null; tenantId: string | null; platformAdmin?: boolean } | null = { role: 'company_admin', tenantId: 't1' };
jest.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseRealtimeNotifications = jest.fn();
jest.mock('./useRealtimeNotifications', () => ({
  useRealtimeNotifications: (opts: unknown) => mockUseRealtimeNotifications(opts),
}));

jest.mock('../../components/StatusBanner', () => ({
  StatusBanner: ({ banner }: { banner: OwnerNotificationBanner | null }) =>
    banner ? `banner:${banner.text}` : null,
}));

import { RealtimeBridge } from './RealtimeBridge';
import type { OwnerNotificationBanner } from './useRealtimeNotifications';

const BANNER: OwnerNotificationBanner = {
  text: 'Priya · JOB-1042 · On my way',
  technicianName: 'Priya',
  jobNumber: 'JOB-1042',
  customerName: null,
  stepLabel: 'On my way',
  stepStatus: 'progress',
};

/** The UX spec's technician assignment toast — what the hook raises for a
 *  `job.assigned` event on the technician branch. */
const ASSIGNED_BANNER: OwnerNotificationBanner = {
  text: 'New job assigned · JOB-1042 · Sharma Electronics',
  technicianName: null,
  jobNumber: 'JOB-1042',
  customerName: 'Sharma Electronics',
  stepLabel: 'New job assigned',
  stepStatus: 'neutral',
};

function mount(): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(React.createElement(RealtimeBridge));
  });
  return renderer;
}

beforeEach(() => {
  mockSession = { role: 'company_admin', tenantId: 't1' };
});

afterEach(() => jest.clearAllMocks());

describe('RealtimeBridge', () => {
  it('technician session: enables the hook and renders the raised assignment banner through', () => {
    // The hook (not the bridge) decides what a role sees — a technician
    // banner only ever exists for `job.assigned` (UX spec 2026-11-07).
    mockSession = { role: 'employee', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: ASSIGNED_BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).not.toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('technician session with no live banner: renders nothing', () => {
    mockSession = { role: 'employee', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('bootstrap (no session yet): suspends the hook entirely', () => {
    mockSession = null;
    mockUseRealtimeNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: false });
  });

  it('owner session with no live banner: renders nothing', () => {
    mockSession = { role: 'company_admin', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: null });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it('owner session with a live banner: renders StatusBanner', () => {
    mockSession = { role: 'company_admin', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).not.toBeNull();
  });

  it('viewer session: enabled, and sees the same banner as the admin (read-only company view)', () => {
    mockSession = { role: 'viewer', tenantId: 't1' };
    mockUseRealtimeNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).not.toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: true });
  });

  it.each([
    ['a removed person (no role, no company)', { role: null, tenantId: null }],
    ['a role but no company', { role: 'company_admin', tenantId: null }],
    ['Fenzit staff', { role: null, tenantId: null, platformAdmin: true }],
    ['Fenzit staff with a stale company and role', { role: 'company_admin', tenantId: 't1', platformAdmin: true }],
    ['an unknown role', { role: 'owner', tenantId: 't1' }],
  ])('%s: no socket, no token exchange, no banner', (_name, session) => {
    mockSession = session;
    mockUseRealtimeNotifications.mockReturnValue({ banner: BANNER });

    const renderer = mount();

    expect(renderer.toJSON()).toBeNull();
    expect(mockUseRealtimeNotifications).toHaveBeenCalledWith({ enabled: false });
  });
});
