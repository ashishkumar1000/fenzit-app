/**
 * WeeklyOffReplaceConfirm — the pre-save guard for the tenant-default
 * weekly off (found on device 2026-10-26): the save RPC owns everything
 * from its effective date onward, so a schedule saved mid-chain silently
 * drops every queued edit after it. This dialog names them before it
 * happens — the same rows the Upcoming panel shows, as an explicit
 * choice instead of a surprise.
 *
 * `useWeeklyOffReplaceConfirm` owns the raise-or-pass-through decision:
 * a Save press with nothing queued after the effective date writes
 * straight through; otherwise the dialog is raised and the write waits
 * for the explicit confirm. The screen keeps only the two call sites.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { ConfirmDialog } from '../../../components/ui';
import { colors, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
import type { WeeklyOffView } from '../../../services';
import { describeDaysOff } from './weeklyOffModel';

type UseReplaceConfirmOptions = {
  supersededHops: WeeklyOffView[];
  /** The save's effective date — the form's own `effectiveFrom || today`. */
  effectiveDate: string;
  submitting: boolean;
  onSave: () => Promise<void>;
};

export function useWeeklyOffReplaceConfirm({
  supersededHops,
  effectiveDate,
  submitting,
  onSave,
}: UseReplaceConfirmOptions) {
  const [visible, setVisible] = useState(false);
  const requestSave = useCallback(() => {
    if (supersededHops.length > 0) {
      setVisible(true);
      return;
    }
    void onSave();
  }, [supersededHops, onSave]);
  const onConfirm = useCallback(async () => {
    try {
      await onSave();
      // Close only on success: a failed save keeps the dialog up for a
      // retry (the saveError banner names the failure behind it).
      setVisible(false);
    } catch {
      // saveError is surfaced by the screen's banner area.
    }
  }, [onSave]);
  const onCancel = useCallback(() => setVisible(false), []);
  return {
    requestSave,
    confirmProps: {
      visible,
      date: effectiveDate,
      hops: supersededHops,
      submitting,
      onConfirm,
      onCancel,
    },
  };
}

type Props = {
  visible: boolean;
  /** The save's effective date (the working date, or today). */
  date: string;
  /** Queued edits strictly after `date` — all of them will be replaced. */
  hops: WeeklyOffView[];
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function WeeklyOffReplaceConfirm({
  visible,
  date,
  hops,
  submitting,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <ConfirmDialog
      visible={visible}
      icon={<CalendarDays size={20} color={colors.primary} strokeWidth={2} />}
      title="Remove upcoming changes?"
      message={
        <>
          Your new plan starts from{' '}
          <Text style={styles.strong}>{formatLongDate(date)}</Text>. These
          upcoming changes will be removed:
        </>
      }
      rows={hops.map((hop) => ({
        label: formatLongDate(hop.validFrom),
        value: (
          <View style={styles.value}>
            <CalendarDays size={14} color={colors.primary} strokeWidth={2} />
            <Text style={styles.valueText}>{describeDaysOff(hop.days)}</Text>
          </View>
        ),
      }))}
      confirmLabel="Save anyway"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

const styles = StyleSheet.create({
  strong: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueText: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
});
