/**
 * ApplyOnBehalfScreen — apply on behalf (Story 17-6, FR-16, spec D4):
 * ScreenHeader, the "Team member" section with a read-only selected
 * employee Card (Avatar + name + office + ghost "Change"), the shared
 * `LeaveApplyFields` body, and a pinned footer holding the inline-error
 * slot above the primary lg submit.
 *
 * Epic 24 (24-5): the same screen now serves two callers. An ADMIN's filing
 * is born approved — the label stays "Approve" and its helper says so. An
 * employee MANAGER's filing is PENDING (the server routes it to the nearest
 * eligible manager above the subject), so the label is "Apply leave" and the
 * helper does not claim an approval. The picker and the leave-type catalog
 * also branch by caller (see useApplyOnBehalf).
 *
 * Since 23-14 the form renders the REAL live preview: the owner route
 * `GET /attendance/leave/on-behalf/preview` (the technician-scoped `me`
 * preview still 403s an owner JWT) returns the working-days count and — when
 * the request would be refused (an insufficient balance on the target, a
 * locked payroll month, an overlap) — the server's message verbatim in the
 * count slot, with the submit button gated while it stands. The
 * EmployeePickerSheet opens automatically on a cold entry and re-opens from
 * "Change".
 */
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar, Button, InlineError, SectionHead } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { RootStackParamList, TechnicianRootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../offices/ScreenHeader';
import { EmployeePickerSheet } from './EmployeePickerSheet';
import { LeaveApplyFields } from './LeaveApplyFields';
import { LeaveBalancesCard } from './LeaveBalancesCard';
import { LeaveTypePickerSheet } from './LeaveTypePickerSheet';
import { useApplyOnBehalf } from './useApplyOnBehalf';

type Props = NativeStackScreenProps<
  RootStackParamList & TechnicianRootStackParamList,
  'ApplyOnBehalf'
>;

export default function ApplyOnBehalfScreen({ navigation, route }: Props) {
  const form = useApplyOnBehalf({ navigation, route });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Apply on behalf"
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.block}>
            <SectionHead title="Team member" />
            {form.employee ? (
              <View style={styles.employeeCard}>
                <Avatar name={form.employee.employeeName} uri={form.employee.avatarUrl ?? null} size="md" />
                <View style={styles.employeeTexts}>
                  <Text style={styles.employeeName}>
                    {form.employee.employeeName}
                  </Text>
                  <Text style={styles.employeeOffice}>
                    {form.employee.officeName ?? 'No office'}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={form.reopenPicker}
                  style={styles.changeBtn}>
                  Change
                </Button>
              </View>
            ) : (
              <Text style={styles.pickHint}>
                Choose who this leave is for.
              </Text>
            )}
          </View>

          <LeaveApplyFields
            typeOptions={form.typeOptions}
            part={form.part}
            onChangePart={form.changePart}
            resetNote={form.resetNote}
            from={form.from}
            to={form.to}
            onOpenFromPicker={form.openFromPicker}
            onOpenToPicker={form.openToPicker}
            onClearTo={form.clearTo}
            preview={form.preview}
            showEmptyHint={form.employee != null}
            reason={form.reason}
            onChangeReason={form.setReason}
            balancesSlot={
              form.employee ? (
                <LeaveBalancesCard
                  balances={form.balances}
                  loading={form.balancesLoading}
                  error={form.balancesError}
                  highlightTypeId={form.selectedTypeId}
                  compact
                />
              ) : null
            }
            leaveTypeOptions={form.leaveTypePickerOptions}
            typesLoading={form.typesLoading}
            leaveTypeUnavailable={form.leaveTypeUnavailable}
            selectedLeaveTypeId={form.selectedTypeId}
            onChangeLeaveType={form.pickLeaveType}
            onOpenTypePicker={form.openTypePicker}
          />
        </ScrollView>

        <View style={styles.footer}>
          {form.footerError ? <InlineError message={form.footerError} /> : null}
          <Button
            onPress={form.submit}
            disabled={!form.canSubmit}
            loading={form.submitting}
            size="lg"
            fullWidth>
            {form.isAdmin ? 'Approve' : 'Apply leave'}
          </Button>
          <Text style={styles.footerHelper}>
            {form.isAdmin
              ? 'This leave is recorded as approved.'
              : "It goes to their manager's approval."}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <EmployeePickerSheet
        visible={form.pickerVisible}
        employees={form.roster}
        loading={form.rosterLoading}
        error={form.rosterError}
        onRetry={form.reloadRoster}
        onClose={() => {
          // Closing with nobody picked strands the form — go back instead.
          if (form.employee == null) navigation.goBack();
          else form.closePicker();
        }}
        onPick={form.onPickEmployee}
      />

      <LeaveTypePickerSheet
        visible={form.typePickerVisible}
        onClose={form.closeTypePicker}
        options={form.leaveTypePickerOptions}
        selectedId={form.selectedTypeId}
        onSelect={id => {
          form.pickLeaveType(id);
          form.closeTypePicker();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  block: {
    gap: spacing.s2,
  },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: spacing.s3,
    padding: spacing.s3,
  },
  employeeTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  employeeName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  employeeOffice: {
    ...typography.caption,
    color: colors.textMuted,
  },
  changeBtn: {
    alignSelf: 'center',
  },
  pickHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  footerHelper: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
