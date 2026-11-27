/**
 * teamModel.ts — the pure decisions behind the manager's "Your team" surface
 * (Epic 24, story 24-5/CAP-5). No React, no network: every rule here is a
 * function of the shipped wire shapes (`team.headcount`, `team.members`, a
 * row's `decision`), so the copy and the gates can be tested without a
 * renderer.
 *
 * The gate is `headcount > 0` AND a non-admin role. The server computes an
 * admin's hierarchy too (an admin with reports has a non-zero headcount), but
 * the owner console already is the whole-company surface — the app must not
 * show a second, narrower "Your team" beside it. A person with no reports
 * sees no team UI anywhere (CAP-5).
 */
import type { TeamMember, TeamSummary } from '../../services/resources/users';
import type { MemberRole, CompanyMember } from '../../services/resources/members';
import type { DecisionView } from '../../services/resources/decision';

/** The gate: only a server-endorsed "you have reports" opens the surface,
 *  and never for a company admin (their console is the company surface). */
export function hasTeam(
  profile: { team?: TeamSummary; role?: string | null } | null | undefined,
): boolean {
  if (profile?.role === 'company_admin' || profile?.role === 'platform_admin') return false;
  return (profile?.team?.headcount ?? 0) > 0;
}

/**
 * The team leave queue is the subtree's pending list, which also contains the
 * caller's own request(s) (the server scope is self + subtree). The caller's
 * own rows route UP to their manager and belong in their personal history,
 * never in their team queue. The filter runs client-side; each own row costs
 * a slot on the page, so a page may render fewer than the 20 fetched (a
 * person can hold several non-overlapping pending requests).
 */
export function withoutOwnRows<T extends { employeeId: string }>(
  rows: T[],
  myId: string | null,
): T[] {
  if (myId == null) return rows;
  return rows.filter(row => row.employeeId !== myId);
}

/** The first word of a display name, for the read-only reason lines. */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed === '' ? 'this person' : trimmed.split(/\s+/)[0];
}

/**
 * The read-only explanation for a row the caller may not decide, or `null`
 * when the row has no note (actionable, or the backend predates `decision`).
 * Copy is the EXPERIENCE.md table verbatim.
 */
export function decisionNote(
  decision: DecisionView | undefined,
  personName: string | null | undefined,
): string | null {
  if (decision == null || decision.canDecide) return null;
  if (decision.reason === 'higher_manager') {
    return `Someone closer to ${firstName(personName)} decides this.`;
  }
  if (decision.reason === 'unresolved') {
    return 'No approver is set up for this request. Ask your admin.';
  }
  return null;
}

/**
 * The read-only note for a job row. The queue card says "decides this."
 * (EXPERIENCE's Jobs list); the job detail's footer says "decides this job."
 * (Surface 4) — two copy-table rows, one shared reason rule.
 */
function blockedJobNote(
  decision: DecisionView | undefined,
  personName: string | null | undefined,
  object: 'this' | 'this job',
): string | null {
  if (decision == null || decision.canDecide) return null;
  if (decision.reason === 'higher_manager') {
    return `Someone closer to ${firstName(personName)} decides ${object}.`;
  }
  if (decision.reason === 'unresolved') {
    return 'No approver is set up for this job. Ask your admin.';
  }
  return null;
}

export function jobDecisionNote(
  decision: DecisionView | undefined,
  personName: string | null | undefined,
): string | null {
  return blockedJobNote(decision, personName, 'this');
}

/** The job DETAIL's variant ("… decides this job."). */
export function jobDetailDecisionNote(
  decision: DecisionView | undefined,
  personName: string | null | undefined,
): string | null {
  return blockedJobNote(decision, personName, 'this job');
}

/** The "also off" line: 0 names, 1–3 names, or the first three plus a count. */
export function teammatesOffLine(names: string[]): string {
  const clean = names.map(name => name.trim()).filter(name => name !== '');
  if (clean.length === 0) return 'Nobody else in your team is off on these days.';
  if (clean.length <= 3) return `Also off on these days: ${clean.join(', ')}`;
  const shown = clean.slice(0, 3).join(', ');
  const rest = clean.length - 3;
  return `Also off on these days: ${shown} and ${rest} more`;
}

/** The apply-on-behalf / directory list: active people only. */
export function activeTeamMembers(members: TeamMember[]): TeamMember[] {
  return members.filter(member => member.status === 'active');
}

/** "1 person in your team" / "3 people in your team". */
export function teamHeadcountLine(headcount: number): string {
  return headcount === 1 ? '1 person in your team' : `${headcount} people in your team`;
}

/**
 * The one-line header under "Your team": the headcount, plus the caller's own
 * manager when they have one. Never "Reports to —": the clause is omitted.
 */
export function teamHeaderLine(team: TeamSummary | undefined): string {
  if (team == null) return '';
  const base = teamHeadcountLine(team.headcount);
  return team.managerName ? `${base} · You report to ${team.managerName}` : base;
}

/** "3 people report to them" / "1 person reports to them" / null at 0. */
export function reportHeadcountLine(headcount: number): string | null {
  if (headcount <= 0) return null;
  return headcount === 1
    ? '1 person reports to them'
    : `${headcount} people report to them`;
}

/**
 * The chain line under "Reports to" — nearest first. Admins are marked
 * "(Owner)" (the company's top of the tree, per the copy table). Null when
 * there is no chain to show.
 */
export function chainLine(
  chain: { userId: string; name: string }[],
  members: CompanyMember[] = [],
): string | null {
  if (chain.length === 0) return null;
  const roles = new Map(members.map(member => [member.userId, member.role]));
  return chain
    .map(link => (roles.get(link.userId) === 'company_admin' ? `${link.name} (Owner)` : link.name))
    .join(' → ');
}

/**
 * The manager picker's candidates: everyone the server would accept —
 * active people, minus the member themselves and everyone below them (their
 * subtree). Offering a cycle would only earn a 409.
 */
export function managerCandidates(
  members: CompanyMember[],
  memberId: string,
): CompanyMember[] {
  return members.filter(
    member =>
      member.status === 'active' &&
      member.userId !== memberId &&
      !member.chain.some(link => link.userId === memberId),
  );
}

/**
 * The D13 note for a viewer chosen as a reporting manager: a neutral fact,
 * not an error. Null for every other role.
 */
export function viewerManagerNote(role: MemberRole): string | null {
  return role === 'viewer'
    ? "Viewers can't normally see leave or job requests. As a reporting manager, they will see their team's and can decide them."
    : null;
}

/** The three role words the picker shows (never "Technician"). */
export function roleWord(role: MemberRole): string {
  return role === 'company_admin' ? 'Owner' : role === 'viewer' ? 'Viewer' : 'Employee';
}
