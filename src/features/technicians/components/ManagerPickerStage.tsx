/**
 * ManagerPickerStage — the "Reports to" picker, rendered as a STAGE inside
 * the hosting sheet (the shipped LeaveDetailSheet → RevokeSheet morph
 * precedent). Deliberately not a second native sheet: the DS `Sheet` is a
 * TrueSheet and nesting one inside another is unverified across platforms.
 *
 * Candidates are the company's ACTIVE members minus the member themselves
 * and everyone below them (the server would refuse the cycle). A viewer
 * candidate carries the neutral D13 note before saving; a refusal from the
 * server keeps the stage open with the message verbatim.
 */
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { Button, InlineError, InlineNotice, Input } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { CompanyMember } from '../../../services';
import { managerCandidates, roleWord, viewerManagerNote } from '../../team/teamModel';

export function ManagerPickerStage(input: {
  members: CompanyMember[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  /** The member being edited; null for the invite flow (no exclusions). */
  memberId: string | null;
  selected: CompanyMember | null;
  onSelect: (member: CompanyMember | null) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const {
    members,
    loading,
    loadError,
    onRetry,
    memberId,
    selected,
    onSelect,
    saving,
    saveError,
    onSave,
    onCancel,
  } = input;
  const [query, setQuery] = useState('');
  // Device finding (24-5c): with a 200-person directory a flat list ran past
  // the sheet's bottom edge — nothing scrolled, and Save sat ~200 rows below
  // the fold, so a pick could never be saved. The candidates scroll inside a
  // bounded box instead, leaving the buttons below it reachable at any team
  // size. The bound follows the window height, which `adjustResize` shrinks
  // while the search keyboard is up.
  const { height: windowHeight } = useWindowDimensions();
  const listMaxHeight = Math.max(180, Math.round(windowHeight * 0.45));

  const candidates = useMemo(() => {
    const pool =
      memberId == null
        ? members.filter(member => member.status === 'active')
        : managerCandidates(members, memberId);
    const needle = query.trim().toLowerCase();
    return pool
      .filter(
        member =>
          needle === '' ||
          (member.name ?? '').toLowerCase().includes(needle) ||
          member.employeeCode.toLowerCase().includes(needle) ||
          member.phoneNumber.includes(needle),
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [members, memberId, query]);

  return (
    <View style={styles.root}>
      <Input
        label="Search your team"
        floatingLabel
        value={query}
        onChangeText={setQuery}
        placeholder="Name, code or phone"
        clearable
      />

      {loadError != null ? (
        <>
          <InlineError message={loadError} />
          <Button variant="secondary" size="md" fullWidth onPress={onRetry}>
            Retry
          </Button>
        </>
      ) : loading ? (
        <Text style={styles.muted}>Loading your team…</Text>
      ) : (
        <ScrollView
          style={[styles.list, { maxHeight: listMaxHeight }]}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selected == null }}
            onPress={() => onSelect(null)}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
            <Text style={styles.rowName}>No reporting manager</Text>
            {selected == null ? <Check size={18} color={colors.primary} strokeWidth={2} /> : null}
          </Pressable>
          {candidates.map(member => {
            const active = selected?.userId === member.userId;
            return (
              <Pressable
                key={member.userId}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(member)}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? styles.pressed : null,
                ]}>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {member.name?.trim() || 'Team member'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {member.employeeCode ? `${member.employeeCode} · ` : ''}
                    {roleWord(member.role)}
                  </Text>
                </View>
                {active ? <Check size={18} color={colors.primary} strokeWidth={2} /> : null}
              </Pressable>
            );
          })}
          {candidates.length === 0 ? (
            <Text style={styles.muted}>
              {query.trim() === '' ? 'No one can be picked right now.' : 'No one matches that search.'}
            </Text>
          ) : null}
        </ScrollView>
      )}

      {selected != null && viewerManagerNote(selected.role) != null ? (
        <InlineNotice message={viewerManagerNote(selected.role) ?? ''} tone="neutral" />
      ) : null}

      {saveError != null ? <InlineError message={saveError} /> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={saving || loading || loadError != null}
        loading={saving}
        onPress={onSave}>
        Save
      </Button>
      <Button variant="ghost" size="lg" fullWidth disabled={saving} onPress={onCancel}>
        Back
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s6,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s2,
    borderRadius: 10,
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowName: {
    ...typography.body,
    color: colors.textStrong,
    flexShrink: 1,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pressed: {
    backgroundColor: colors.surfaceSunken,
  },
  muted: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s3,
  },
});
