/**
 * TeamPeoplePane — the manager's People segment: the actionable subtree
 * directory from `team.members` (Epic 24, story 24-5). Read-only rows; the
 * one action is "Apply for leave" (employees only — a viewer lacks
 * `leave.create_on_behalf`, so for them the action simply does not exist, no
 * disabled control).
 *
 * Invited and deactivated people still appear (the server lists them) and
 * say why they cannot be picked, rather than vanishing silently.
 */
import { Fragment, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Avatar, Badge, Button, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { TeamMember, TeamSummary } from '../../../services';

function statusChip(status: string): { label: string; badge: 'done' | 'pendingApproval' | 'neutral' } {
  if (status === 'active') return { label: 'Active', badge: 'done' };
  if (status === 'invited') return { label: 'Invited', badge: 'pendingApproval' };
  if (status === 'deactivated' || status === 'removed') {
    return { label: 'Deactivated', badge: 'neutral' };
  }
  // A status this build does not know yet is described honestly, never
  // mislabelled "Deactivated".
  return { label: 'Not active', badge: 'neutral' };
}

function statusNote(status: string): string | null {
  if (status === 'invited') return 'Not joined yet';
  if (status === 'deactivated' || status === 'removed') return 'No longer active';
  return null;
}

export function TeamPeoplePane(input: {
  team: TeamSummary | undefined;
  /** An employee manager may apply on behalf; a viewer manager may not. */
  canApply: boolean;
  onApplyFor: (member: TeamMember | null) => void;
}) {
  const { team, canApply, onApplyFor } = input;
  const members = useMemo(
    () => [...(team?.members ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [team],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}>
      {canApply ? (
        <View style={styles.applyBlock}>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => onApplyFor(null)}>
            Apply for leave
          </Button>
          <Text style={styles.helper}>Choose a person to apply for.</Text>
        </View>
      ) : null}

      <Card padding="none">
        {members.length === 0 ? (
          <Text style={styles.emptyText} accessibilityLiveRegion="polite">
            No one in your team can be listed right now.
          </Text>
        ) : (
          members.map((item, index) => {
            const chip = statusChip(item.status);
            const note = statusNote(item.status);
            const selectable = canApply && item.status === 'active';
            const row = (
              <View style={styles.row}>
                <Avatar name={item.name ?? undefined} uri={item.avatarUrl ?? null} size="md" />
                <View style={styles.rowTexts}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name?.trim() || 'Team member'}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[item.employeeCode, note].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Badge status={chip.badge} tone="soft" size="sm" dot>
                  {chip.label}
                </Badge>
                {selectable ? (
                  <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
                ) : null}
              </View>
            );
            return (
              <Fragment key={item.userId}>
                {index > 0 ? <View style={styles.divider} /> : null}
                {selectable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Apply for leave for ${item.name ?? 'this person'}`}
                    onPress={() => onApplyFor(item)}
                    style={({ pressed }) => [pressed ? styles.pressed : null]}>
                    {row}
                  </Pressable>
                ) : (
                  row
                )}
              </Fragment>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s6,
  },
  applyBlock: {
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    minHeight: 56,
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  sub: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 68,
  },
  pressed: {
    opacity: 0.6,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s6,
    paddingHorizontal: spacing.s4,
  },
});
