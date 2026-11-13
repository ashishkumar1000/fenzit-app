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
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { InlineError, Sheet, Switch } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { membersService } from '../../../services';
import type { CompanyMember, ApiError } from '../../../services';

type Props = {
  visible: boolean;
  /** The tapped roster row — `id` is the member's user id. */
  technician: { id: string; name: string } | null;
  onClose: () => void;
};

export function JobSettingsSheet({ visible, technician, onClose }: Props) {
  const [member, setMember] = useState<CompanyMember | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // One in-flight save at a time; a failed toggle reverts to `member`.
  const [savingKey, setSavingKey] = useState<'canCreateJobs' | 'jobApprovalRequired' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fresh member read every open — the flags may have changed since the
  // last visit (another device), and the sheet must show the stored truth.
  useEffect(() => {
    if (!visible || !technician) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setSaveError(null);
    setMember(null);
    membersService
      .listMembers()
      .then(members => {
        if (cancelled) return;
        setMember(members.find(m => m.userId === technician.id) ?? null);
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
  }, [visible, technician]);

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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={technician?.name ?? 'Job settings'}
      subtitle="What this employee can do with jobs">
      <View style={styles.body}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : loadError ? (
          <InlineError message={loadError} />
        ) : !member ? (
          <InlineError message="This person isn't in your company list." />
        ) : member.status === 'invited' ? (
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
      </View>
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
