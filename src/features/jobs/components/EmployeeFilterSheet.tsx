/**
 * EmployeeFilterSheet — the Pending queue's employee filter, as a sheet
 * (Epic 22, CAP-10). A roster of employee-name chips doesn't scale ("someone
 * has 100 employees"), so the filter is one chip on the queue that opens a
 * searchable picker — the shared `TechnicianPicker` (rows variant, the same
 * search the Edit-job sheet runs, via the shared `filterTechnicians`), plus
 * an explicit "All employees" row for clearing the filter.
 *
 * The picker's contract already fits: single-select, tapping the selected
 * row again deselects — here "no selection" means "All employees", so both
 * paths land on the same `onSelect(null)`.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from '../icons';
import { Sheet } from '../../../components/ui';
import { TechnicianPicker } from '../../../components/TechnicianPicker';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import type { ProfileTechnician } from '../../../services';

type Props = {
  visible: boolean;
  /** The full roster (server-issued ids); the picker filters it by search. */
  technicians: ProfileTechnician[];
  /** Active employee filter (user id), or null = all employees. */
  selectedId: string | null;
  /** Applies the selection (null = all employees); the caller closes. */
  onSelect: (id: string | null) => void;
  onClose: () => void;
};

export function EmployeeFilterSheet({
  visible,
  technicians,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter by employee"
      subtitle="Show jobs one employee created."
      detents={[0.6]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId === null }}
        accessibilityLabel="All employees"
        onPress={() => onSelect(null)}
        style={[styles.allRow, selectedId === null && styles.allRowSelected]}>
        <Text style={selectedId === null ? styles.allLabelSelected : styles.allLabel}>
          All employees
        </Text>
        <View
          style={[
            styles.checkCircle,
            selectedId === null && styles.checkCircleSelected,
          ]}>
          {selectedId === null ? (
            <CheckIcon size={14} color={colors.onPrimary} strokeWidth={3} />
          ) : null}
        </View>
      </Pressable>
      <TechnicianPicker
        technicians={technicians}
        selectedId={selectedId}
        onSelect={onSelect}
        variant="rows"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.min,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    marginBottom: spacing.s3,
  },
  allRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  allLabel: {
    ...typography.body,
    flex: 1,
    color: colors.textBody,
  },
  allLabelSelected: {
    ...typography.bodyStrong,
    flex: 1,
    color: colors.primary,
  },
  checkCircle: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
