/**
 * LeaveTypePickerSheet — the leave type chooser as a bottom sheet (23-14
 * device-pass polish). The inline radio list made the apply form tall —
 * five full rows sat between the balances card and Day part — so the
 * selection collapsed to a trigger row (LeaveApplyFields) that opens this
 * sheet, the same pattern as the on-behalf screen's EmployeePickerSheet
 * (17-6): a controlled DS `Sheet` over plain pressable rows, one tap =
 * pick + close, a Check on the current pick, and radio semantics on each
 * row (single-choice). Rows are the enabled catalog types ONLY — there is
 * no "No type" row (the owner's call: it read as unclear; the first type
 * is the default and the untyped wire fallback survives only when the
 * catalog itself is empty). Captions come from the model's viewer-aware
 * rule (Comp-Off reads "Owner approves each request" for the employee,
 * "You approve each request" for the owner).
 *
 * Presentational only: options/selection/handlers arrive from the host
 * hook; the sheet never fetches.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

/** One picker row's data — the hook's picker option shape. */
export interface LeaveTypeOption {
  id: string;
  name: string;
  caption: string;
  /** Zero-balance accrual type — rendered muted + unpressable. */
  disabled?: boolean;
}

function TypeRow({
  name,
  caption,
  selected,
  disabled = false,
  onPress,
}: {
  name: string;
  caption: string;
  selected: boolean;
  /** A zero-balance accrual type (the owner's ruling): muted, unpressable,
   *  announced disabled — selecting it could only produce a submit error. */
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${name}, ${caption}${disabled ? ', not available' : ''}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : null,
        disabled ? styles.rowDisabled : null,
        pressed && !disabled ? styles.rowPressed : null,
      ]}>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowName,
            selected ? styles.rowNameSelected : null,
            disabled ? styles.rowDisabledText : null,
          ]}
          numberOfLines={1}>
          {name}
        </Text>
        <Text
          style={[styles.rowCaption, disabled ? styles.rowDisabledText : null]}
          numberOfLines={1}>
          {caption}
        </Text>
      </View>
      {selected ? (
        <Check size={16} color={colors.primary} strokeWidth={2.5} />
      ) : null}
    </Pressable>
  );
}

export function LeaveTypePickerSheet(input: {
  visible: boolean;
  onClose: () => void;
  /** Enabled catalog options in display order (may be empty — the trigger
   *  row is replaced by the neutral notice in that case, so this sheet
   *  rarely shows). */
  options: LeaveTypeOption[];
  /** The effective selection id. */
  selectedId: string | null;
  /** A pick — the host closes the sheet with it. */
  onSelect: (id: string | null) => void;
}) {
  const { visible, onClose, options, selectedId, onSelect } = input;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose leave type"
      subtitle="Applies to this request"
      detents={['auto']}>
      {options.map(option => (
        <TypeRow
          key={option.id}
          name={option.name}
          caption={option.caption}
          selected={selectedId === option.id}
          disabled={option.disabled}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 56,
    marginBottom: spacing.s1,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowDisabledText: {
    color: colors.textMuted,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    ...typography.bodyStrong,
    color: colors.textBody,
  },
  rowNameSelected: {
    color: colors.primary,
  },
  rowCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
