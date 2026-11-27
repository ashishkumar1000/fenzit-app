/**
 * JobSettingsSheet — the owner's per-employee job switches (Epic 22 step 5),
 * opened by tapping a team row on the Technicians screen. Two switches, each
 * saved the moment it flips (PATCH /members/:userId/job-settings — the
 * endpoint takes both flags every call, so each save sends the current
 * pair): a failed save reverts the switch and says so inline, the next
 * tap retries. An invited (not-yet-joined) member shows a note instead of
 * switches — the switches apply once they've joined.
 *
 * Plain English per the product rule: no "override"/jargon on this surface.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { InlineError, SectionHead, Sheet, Switch } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { membersService } from '../../../services';
import type { CompanyMember, ApiError } from '../../../services';
import { chainLine, reportHeadcountLine } from '../../team/teamModel';
import { ManagerPickerStage } from './ManagerPickerStage';

type Props = {
  visible: boolean;
  /** The tapped roster row — `id` is the member's user id. */
  technician: { id: string; name: string } | null;
  onClose: () => void;
};

export function JobSettingsSheet({ visible, technician, onClose }: Props) {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [member, setMember] = useState<CompanyMember | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // One in-flight save at a time; a failed toggle reverts to `member`.
  const [savingKey, setSavingKey] = useState<'canCreateJobs' | 'jobApprovalRequired' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Epic 24 — the Reporting manager stage (a morph inside THIS sheet, the
  // shipped LeaveDetailSheet precedent; never a nested native sheet).
  const [stage, setStage] = useState<'settings' | 'manager'>('settings');
  const [pickedManager, setPickedManager] = useState<CompanyMember | null>(null);
  const [savingManager, setSavingManager] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);

  // Fresh member read every open — the flags may have changed since the
  // last visit (another device), and the sheet must show the stored truth.
  // The directory is also the picker's candidate pool (roles, chains).
  const [fetchTick, setFetchTick] = useState(0);
  useEffect(() => {
    if (!visible || !technician) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setSaveError(null);
    setStage('settings');
    setManagerError(null);
    membersService
      .listMembers()
      .then(rows => {
        if (cancelled) return;
        setMembers(rows);
        setMember(rows.find(m => m.userId === technician.id) ?? null);
        setIsLoading(false);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setLoadError(err?.message || "Couldn't load this employee's settings.");
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, technician, fetchTick]);

  const retryLoad = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setFetchTick(tick => tick + 1);
  }, []);

  const handleToggle = useCallback(
    (key: 'canCreateJobs' | 'jobApprovalRequired', next: boolean) => {
      if (!member || savingKey) return;
      // Optimistic: the switch flips now; a failure reverts it. The target
      // is captured so a LATE failure cannot touch a different member: the
      // sheet may have been closed and reopened for someone else while
      // this save was in flight, and that person's fresh switches must
      // never be reverted by someone else's stale error (review 2026-11-13).
      const targetId = member.userId;
      const fallback = { ...member };
      setMember({ ...member, [key]: next });
      setSavingKey(key);
      setSaveError(null);
      membersService
        .setJobSettings(targetId, {
          canCreateJobs: key === 'canCreateJobs' ? next : member.canCreateJobs,
          jobApprovalRequired:
            key === 'jobApprovalRequired' ? next : member.jobApprovalRequired,
        })
        .then(saved => {
          setMember(prev =>
            prev && prev.userId === saved.userId
              ? { ...prev, canCreateJobs: saved.canCreateJobs, jobApprovalRequired: saved.jobApprovalRequired }
              : prev,
          );
        })
        .catch((err: ApiError) => {
          // Revert to the stored value and surface the reason — the switch
          // must not lie about what the server holds. Only the member this
          // save was for, though: a late failure lands while the sheet may
          // already show someone else.
          setMember(prev =>
            prev && prev.userId === targetId ? { ...prev, [key]: fallback[key] } : prev,
          );
          setSaveError(err?.message || "Couldn't save. Try again.");
        })
        .finally(() => setSavingKey(null));
    },
    [member, savingKey],
  );

  const isEmployee = member?.role === 'employee';

  const openManagerPicker = useCallback(() => {
    if (!member) return;
    setPickedManager(
      members.find(candidate => candidate.userId === member.managerId) ?? null,
    );
    setManagerError(null);
    setStage('manager');
  }, [member, members]);

  const saveManager = useCallback(() => {
    if (!member || savingManager) return;
    setSavingManager(true);
    setManagerError(null);
    membersService
      .setManager(member.userId, pickedManager?.userId ?? null)
      .then(saved => {
        setMember(prev => (prev && prev.userId === saved.userId ? saved : prev));
        setMembers(prev =>
          prev.map(row => (row.userId === saved.userId ? saved : row)),
        );
        setStage('settings');
        // Re-read the hierarchy: a re-parent changes the chains the picker's
        // candidate exclusion reads, and a stale pool offers cycles the
        // server then 409s.
        setFetchTick(tick => tick + 1);
      })
      .catch((err: ApiError) => {
        // The refusal stays in the stage with the server's plain-English
        // message (MEMBER_IS_ADMIN / HIERARCHY_CYCLE / HIERARCHY_DEPTH /
        // MANAGER_NOT_ACTIVE) — the previous value is untouched.
        setManagerError(err?.message || "Couldn't save. Try again.");
      })
      .finally(() => setSavingManager(false));
  }, [member, pickedManager, savingManager]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      dismissible={!savingManager}
      title={
        stage === 'manager' ? 'Reports to' : technician?.name ?? 'Job settings'
      }
      subtitle={
        stage === 'manager'
          ? 'Who this person reports to'
          : 'What this employee can do with jobs'
      }>
      {stage === 'manager' ? (
        <ManagerPickerStage
          members={members}
          loading={isLoading}
          loadError={loadError}
          onRetry={retryLoad}
          memberId={member?.userId ?? null}
          selected={pickedManager}
          onSelect={setPickedManager}
          saving={savingManager}
          saveError={managerError}
          onSave={saveManager}
          onCancel={() => setStage('settings')}
        />
      ) : (
      <View style={styles.body}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : loadError ? (
          <InlineError message={loadError} />
        ) : !member ? (
          <InlineError message="This person isn't in your company list." />
        ) : (
          <>
            {/* Epic 24 — "Reporting manager" sits above every role arm (only
                admins sit at the top and cannot be assigned). A viewer can
                hold a manager too, so this section must not hide inside the
                employee-only job-switch arm. */}
            {member.status !== 'removed' ? (
              <View style={styles.managerSection}>
                <SectionHead title="Reporting manager" />
                {member.role === 'company_admin' ? (
                  <Text style={styles.note}>Admins sit at the top of the team.</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reports to ${member.managerName ?? 'the company owner'}`}
                    onPress={openManagerPicker}
                    style={({ pressed }) => [
                      styles.managerRow,
                      pressed ? styles.managerRowPressed : null,
                    ]}>
                    <View style={styles.managerTexts}>
                      <Text style={styles.managerLabel}>Reports to</Text>
                      <Text style={styles.managerValue} numberOfLines={1}>
                        {member.managerName ?? 'The company owner'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                  </Pressable>
                )}
                {member.role !== 'company_admin' ? (
                  <Text style={styles.chainLine} numberOfLines={2}>
                    {chainLine(member.chain, members) ??
                      'No one above them in the team yet.'}
                  </Text>
                ) : null}
                {reportHeadcountLine(member.headcount) != null ? (
                  <Text style={styles.chainLine}>
                    {reportHeadcountLine(member.headcount)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {member.status === 'invited' ? (
              <Text style={styles.note}>
                {member.name?.trim() || 'This person'} hasn't joined yet. The job
                settings open up once they've signed in with their invite.
              </Text>
            ) : member.status === 'removed' ? (
              // The type anticipates this state; rendering switches for a
              // removed member would PATCH into a guaranteed 404 (review
              // 2026-11-13).
              <Text style={styles.note}>
                {member.name?.trim() || 'This person'} is no longer on your team,
                so their job settings can't be changed.
              </Text>
            ) : member.status === 'deactivated' ? (
              <Text style={styles.note}>
                {member.name?.trim() || 'This person'}'s account is paused, so
                their job settings can't be changed right now.
              </Text>
            ) : !isEmployee ? (
              <Text style={styles.note}>
                Job settings apply to employees only. {member.name?.trim() || 'This person'} is{' '}
                {formatRoleWithArticle(member.role)}.
              </Text>
            ) : (
              <>
                <Switch
                  label="Can create jobs"
                  value={member.canCreateJobs}
                  disabled={savingKey !== null}
                  onValueChange={v => handleToggle('canCreateJobs', v)}
                />
                <Text style={styles.switchHint}>
                  They can add new jobs from their app.
                </Text>
                <Switch
                  label="Needs your approval"
                  value={member.jobApprovalRequired}
                  disabled={savingKey !== null}
                  onValueChange={v => handleToggle('jobApprovalRequired', v)}
                />
                <Text style={styles.switchHint}>
                  Their new jobs wait for your approval before being assigned.
                </Text>
                {savingKey ? (
                  <View style={styles.savingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.savingText}>Saving…</Text>
                  </View>
                ) : null}
                {saveError ? <InlineError message={saveError} /> : null}
              </>
            )}
          </>
        )}
      </View>
      )}
    </Sheet>
  );
}

/**
 * Membership role → plain words with the article folded in — the note's
 * sentence reads "{name} is {role}." and the old "an {role}" produced
 * "an viewer" (Sally review 2026-11-13). An unknown future role must never
 * print a DB slug ("This person is technician.") — the plain-English copy
 * rule — so it degrades to a neutral noun (review 2026-11-13).
 */
function formatRoleWithArticle(role: CompanyMember['role']): string {
  if (role === 'company_admin') return 'the owner';
  if (role === 'viewer') return 'a viewer';
  if (role === 'employee') return 'an employee';
  return 'a team member';
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s6,
  },
  loader: {
    alignSelf: 'center',
    paddingVertical: spacing.s4,
  },
  note: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.s2,
  },
  managerSection: {
    gap: spacing.s1,
    marginBottom: spacing.s3,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
    paddingHorizontal: spacing.s2,
    borderRadius: 10,
  },
  managerRowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  managerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  managerLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  managerValue: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  chainLine: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.s2,
  },
  switchHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.s1,
    marginBottom: spacing.s3,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  savingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
