/**
 * roles.ts — the single source of "what may this role do". Written from the
 * permission table in the roles spec (not from the implementation): only the
 * company admin writes; the viewer sees company-wide screens read-only; the
 * employee works on their own jobs only; anything unknown or missing gets no
 * rights at all.
 */
import {
  ROLE_LABELS,
  USER_ROLES,
  VIEW_ONLY_REASON,
  canWrite,
  isAdminRole,
  isCompanyWideRole,
  isEmployeeRole,
  isUserRole,
  isViewerRole,
} from './roles';
import { hasCompanyAccess } from './useRole';

const UNKNOWN_VALUES = [null, undefined, '', 'owner', 'technician', 'platform_admin', 'ADMIN', 'company_admin ', 0, {}];

describe('permissions per role', () => {
  it.each([
    ['company_admin', { write: true, admin: true, employee: false, viewer: false, wide: true }],
    ['employee', { write: false, admin: false, employee: true, viewer: false, wide: false }],
    ['viewer', { write: false, admin: false, employee: false, viewer: true, wide: true }],
  ] as const)('%s', (role, expected) => {
    expect(canWrite(role)).toBe(expected.write);
    expect(isAdminRole(role)).toBe(expected.admin);
    expect(isEmployeeRole(role)).toBe(expected.employee);
    expect(isViewerRole(role)).toBe(expected.viewer);
    expect(isCompanyWideRole(role)).toBe(expected.wide);
  });

  it.each(UNKNOWN_VALUES)('gives %p no rights at all (deny by default)', value => {
    const role = value as never;
    expect(canWrite(role)).toBe(false);
    expect(isAdminRole(role)).toBe(false);
    expect(isEmployeeRole(role)).toBe(false);
    expect(isViewerRole(role)).toBe(false);
    expect(isCompanyWideRole(role)).toBe(false);
  });

  it('only one role can write (a new role must be added on purpose)', () => {
    expect(USER_ROLES.filter(r => canWrite(r))).toEqual(['company_admin']);
  });
});

describe('isUserRole', () => {
  it.each(USER_ROLES)('accepts %s', role => {
    expect(isUserRole(role)).toBe(true);
  });

  it.each(UNKNOWN_VALUES)('rejects %p', value => {
    expect(isUserRole(value)).toBe(false);
  });
});

describe('plain display names', () => {
  it('company_admin reads Admin, employee Employee, viewer Viewer', () => {
    expect(ROLE_LABELS).toEqual({
      company_admin: 'Admin',
      employee: 'Employee',
      viewer: 'Viewer',
    });
  });

  it('never shows a raw wire value or old jargon', () => {
    for (const label of Object.values(ROLE_LABELS)) {
      expect(label).not.toMatch(/_|owner|technician/i);
    }
  });

  it('the view-only reason is the agreed wording', () => {
    expect(VIEW_ONLY_REASON).toBe('View-only access');
  });
});

describe('hasCompanyAccess', () => {
  const base = { role: 'company_admin', tenantId: 't1', platformAdmin: false } as const;

  it.each(['company_admin', 'employee', 'viewer'] as const)('%s with a company is in', role => {
    expect(hasCompanyAccess({ ...base, role })).toBe(true);
  });

  it.each([
    ['no session', null],
    ['no role', { ...base, role: null }],
    ['no company', { ...base, tenantId: null }],
    ['Fenzit staff', { ...base, platformAdmin: true }],
    ['an unknown role', { ...base, role: 'owner' as never }],
  ])('%s is out', (_name, session) => {
    expect(hasCompanyAccess(session)).toBe(false);
  });
});
