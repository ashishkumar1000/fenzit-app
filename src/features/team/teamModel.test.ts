/**
 * Model tests for `teamModel` (Epic 24, story 24-5/CAP-5): the "Your team"
 * gate (server headcount, never an admin), the caller's own rows filtered out
 * of the subtree queue, the read-only decision copy (all three reasons, a
 * nameless requester), the "Also off" line at 0/1/3/5 names, the picker's
 * candidate exclusion (self + subtree + inactive), the chain text with the
 * owner suffix, and the exact copy from the EXPERIENCE.md table.
 */
import type { CompanyMember, TeamMember, TeamSummary } from '../../services';
import {
  activeTeamMembers,
  chainLine,
  decisionNote,
  firstName,
  hasTeam,
  jobDecisionNote,
  managerCandidates,
  reportHeadcountLine,
  roleWord,
  teamHeadcountLine,
  teamHeaderLine,
  teammatesOffLine,
  viewerManagerNote,
  withoutOwnRows,
} from './teamModel';

function member(overrides: Partial<CompanyMember> & { userId: string }): CompanyMember {
  return {
    name: 'Member',
    countryCode: '+91',
    phoneNumber: '7700000000',
    employeeCode: 'EMP-000',
    role: 'employee',
    status: 'active',
    createdAt: '2026-11-20T00:00:00Z',
    avatarUrl: null,
    canCreateJobs: false,
    jobApprovalRequired: false,
    managerId: null,
    managerName: null,
    chain: [],
    headcount: 0,
    directReports: 0,
    ...overrides,
  } as CompanyMember;
}

function teamMember(overrides: Partial<TeamMember> & { userId: string }): TeamMember {
  return {
    name: 'Person',
    status: 'active',
    avatarUrl: null,
    ...overrides,
  };
}

function team(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    managerId: null,
    managerName: null,
    chain: [],
    headcount: 1,
    directReports: 1,
    members: [],
    ...overrides,
  };
}

describe('hasTeam — the gate', () => {
  it('opens only for a non-admin with server-endorsed reports', () => {
    expect(hasTeam({ team: team({ headcount: 1 }), role: 'employee' })).toBe(true);
    expect(hasTeam({ team: team({ headcount: 3 }), role: 'viewer' })).toBe(true);
  });

  it('stays shut at zero reports, for a missing profile and for admins', () => {
    expect(hasTeam({ team: team({ headcount: 0 }), role: 'employee' })).toBe(false);
    // The role is always on the wire; the gate reads it as "not an admin".
    expect(hasTeam({ team: team({ headcount: 4 }) })).toBe(true);
    expect(hasTeam({ team: team({ headcount: 0 }) })).toBe(false);
    expect(hasTeam(null)).toBe(false);
    expect(hasTeam(undefined)).toBe(false);
    expect(hasTeam({ team: team({ headcount: 7 }), role: 'company_admin' })).toBe(false);
    expect(hasTeam({ team: team({ headcount: 7 }), role: 'platform_admin' })).toBe(false);
  });
});

describe('withoutOwnRows', () => {
  const rows = [{ id: 'a', employeeId: 'me' }, { id: 'b', employeeId: 'other' }];

  it("drops the caller's own request from the subtree page", () => {
    expect(withoutOwnRows(rows, 'me').map(row => row.id)).toEqual(['b']);
  });

  it('keeps every row when the caller id is unknown (nothing to match)', () => {
    expect(withoutOwnRows(rows, null)).toEqual(rows);
  });
});

describe('decisionNote / jobDecisionNote', () => {
  it('is silent for an actionable row and for a backend without the decision', () => {
    expect(decisionNote({ canDecide: true, reason: null }, 'Rekha Pillai')).toBeNull();
    expect(decisionNote(undefined, 'Rekha Pillai')).toBeNull();
  });

  it('names the requester in the higher-manager note (first name only)', () => {
    expect(decisionNote({ canDecide: false, reason: 'higher_manager' }, 'Rekha Pillai')).toBe(
      'Someone closer to Rekha decides this.',
    );
  });

  it('degrades a missing name to "this person" and covers the unresolved + not-pending reasons', () => {
    expect(decisionNote({ canDecide: false, reason: 'higher_manager' }, null)).toBe(
      'Someone closer to this person decides this.',
    );
    expect(decisionNote({ canDecide: false, reason: 'higher_manager' }, '   ')).toBe(
      'Someone closer to this person decides this.',
    );
    expect(decisionNote({ canDecide: false, reason: 'unresolved' }, 'Rekha')).toBe(
      'No approver is set up for this request. Ask your admin.',
    );
    expect(decisionNote({ canDecide: false, reason: 'not_pending' }, 'Rekha')).toBeNull();
  });

  it('says "job" for a job row and keeps the same higher-manager sentence', () => {
    expect(jobDecisionNote({ canDecide: false, reason: 'unresolved' }, null)).toBe(
      'No approver is set up for this job. Ask your admin.',
    );
    expect(jobDecisionNote({ canDecide: false, reason: 'higher_manager' }, 'Vijay Singh')).toBe(
      'Someone closer to Vijay decides this.',
    );
    expect(jobDecisionNote({ canDecide: true, reason: null }, 'Vijay Singh')).toBeNull();
  });
});

describe('teammatesOffLine', () => {
  it('states the empty fact, lists up to three names, then counts the rest', () => {
    expect(teammatesOffLine([])).toBe('Nobody else in your team is off on these days.');
    expect(teammatesOffLine(['  '])).toBe('Nobody else in your team is off on these days.');
    expect(teammatesOffLine(['Priya Reddy'])).toBe('Also off on these days: Priya Reddy');
    expect(teammatesOffLine(['Priya', 'Vijay', 'Rekha'])).toBe(
      'Also off on these days: Priya, Vijay, Rekha',
    );
    expect(teammatesOffLine(['Priya', 'Vijay', 'Rekha', 'Nisha', 'Swati'])).toBe(
      'Also off on these days: Priya, Vijay, Rekha and 2 more',
    );
  });
});

describe('headcount + header copy', () => {
  it('pluralises the team line and the report line, and hides zero reports', () => {
    expect(teamHeadcountLine(1)).toBe('1 person in your team');
    expect(teamHeadcountLine(3)).toBe('3 people in your team');
    expect(reportHeadcountLine(1)).toBe('1 person reports to them');
    expect(reportHeadcountLine(4)).toBe('4 people report to them');
    expect(reportHeadcountLine(0)).toBeNull();
  });

  it('appends the caller own manager only when they have one', () => {
    expect(teamHeaderLine(team({ headcount: 3 }))).toBe('3 people in your team');
    expect(
      teamHeaderLine(team({ headcount: 3, managerName: 'PQA Owner Ashok Rao' })),
    ).toBe('3 people in your team · You report to PQA Owner Ashok Rao');
    expect(teamHeaderLine(undefined)).toBe('');
  });
});

describe('chainLine', () => {
  it('joins nearest-first and marks the owner', () => {
    const members = [member({ userId: 'top', name: 'Ashok', role: 'company_admin' })];
    expect(
      chainLine(
        [
          { userId: 'm1', name: 'Sanjay Menon' },
          { userId: 'top', name: 'Ashok Rao' },
        ],
        members,
      ),
    ).toBe('Sanjay Menon → Ashok Rao (Owner)');
  });

  it('is null without a chain, and marks no one when the roster is absent', () => {
    expect(chainLine([])).toBeNull();
    expect(chainLine([{ userId: 'm1', name: 'Sanjay Menon' }])).toBe('Sanjay Menon');
  });
});

describe('managerCandidates', () => {
  it('excludes the member, everyone below them and inactive people', () => {
    const rows = [
      member({ userId: 'me' }),
      member({ userId: 'report', chain: [{ userId: 'me', name: 'Me' }] }),
      member({ userId: 'peer' }),
      member({ userId: 'gone', status: 'removed' }),
      member({ userId: 'invited', status: 'invited' }),
    ];
    expect(managerCandidates(rows, 'me').map(row => row.userId)).toEqual(['peer']);
  });

  it('keeps the full active pool when the member is unknown (invite flow passes null elsewhere)', () => {
    const rows = [member({ userId: 'a' }), member({ userId: 'b', status: 'deactivated' })];
    expect(managerCandidates(rows, 'nobody').map(row => row.userId)).toEqual(['a']);
  });
});

describe('activeTeamMembers + role words', () => {
  it('keeps active members only', () => {
    expect(
      activeTeamMembers([
        teamMember({ userId: 'a' }),
        teamMember({ userId: 'b', status: 'removed' }),
      ]).map(row => row.userId),
    ).toEqual(['a']);
  });

  it('never prints a DB slug (Owner / Viewer / Employee)', () => {
    expect(roleWord('company_admin')).toBe('Owner');
    expect(roleWord('viewer')).toBe('Viewer');
    expect(roleWord('employee')).toBe('Employee');
  });

  it('carries the D13 viewer note and nothing for the other roles', () => {
    expect(viewerManagerNote('viewer')).toBe(
      "Viewers can't normally see leave or job requests. As a reporting manager, they will see their team's and can decide them.",
    );
    expect(viewerManagerNote('employee')).toBeNull();
    expect(viewerManagerNote('company_admin')).toBeNull();
  });

  it('first-name fallback is the neutral noun', () => {
    expect(firstName('Sanjay Menon')).toBe('Sanjay');
    expect(firstName(null)).toBe('this person');
  });
});
