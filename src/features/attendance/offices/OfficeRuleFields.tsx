/**
 * OfficeRuleFields — the timing/hours inputs of the office form
 * (Story 15-4). In edit mode the section carries the "changes take effect
 * from tomorrow" note as an info chip (server-enforced effective-dating;
 * profile fields apply immediately). Unit suffixes ("mins", "hrs") render
 * via the Input's trailing adornment.
 *
 * Start/End time are the DS `TimeField` (§10 D-TP3): the OS clock picker,
 * no keyboard — labels/placeholders/model untouched, the 18-5 default
 * seeds (09:30/18:30) open the picker pre-set; the model's format errors
 * remain as the unreachable safety net. The three minute/hour-count
 * fields stay typed.
 */
import {
  StyleSheet,
  Text,
  View,
  type TextInputFocusEvent,
} from 'react-native';
import { Info } from 'lucide-react-native';
import { Card, Input, TimeField } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import {
  END_TIME_PRESETS,
  START_TIME_PRESETS,
  type OfficeFormErrors,
  type OfficeFormState,
} from './officeFormModel';

type Props = {
  state: OfficeFormState;
  errors: OfficeFormErrors;
  onChange: (patch: Partial<OfficeFormState>) => void;
  /** Focus handler for the typed fields — lets the form scroll them clear of the keyboard. */
  onFieldFocus?: (e: TextInputFocusEvent) => void;
  /** Edit mode: show the effective-from-tomorrow note. */
  isEdit: boolean;
};

export default function OfficeRuleFields({
  state,
  errors,
  onChange,
  onFieldFocus,
  isEdit,
}: Props) {
  return (
    <Card>
      <View style={styles.stack}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Timing &amp; hours</Text>
      </View>
      {isEdit ? (
        <View style={styles.noteChip}>
          <Info size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.noteText}>Changes take effect from tomorrow</Text>
        </View>
      ) : null}
      <View style={styles.timeRow}>
        <TimeField
          label="Start time"
          value={state.startTime}
          onChangeValue={(hhmm) => onChange({ startTime: hhmm })}
          placeholder="09:00"
          pickerSubtitle="Select official clock-in schedule"
          presets={START_TIME_PRESETS}
          error={errors.startTime}
          style={styles.timeInput}
        />
        <TimeField
          label="End time"
          value={state.endTime}
          onChangeValue={(hhmm) => onChange({ endTime: hhmm })}
          placeholder="18:00"
          pickerSubtitle="Select official clock-out schedule"
          presets={END_TIME_PRESETS}
          error={errors.endTime}
          style={styles.timeInput}
        />
      </View>
      <Input
        label="Late after (minutes)"
        value={state.lateCutoffMinutes}
        onChangeText={(text) => onChange({ lateCutoffMinutes: text.replace(/\D/g, '') })}
        placeholder="15"
        error={errors.lateCutoffMinutes}
        helper="Check-ins this many minutes after the start time are still on time. After that, they are marked late."
        keyboardType="number-pad"
        onFocus={onFieldFocus}
        maxLength={3}
        trailingAdornment={<Text style={styles.suffix}>mins</Text>}
      />
      <View style={styles.timeRow}>
        <Input
          label="Full-day hours"
          value={state.fullDayHours}
          onChangeText={(text) => onChange({ fullDayHours: text })}
          placeholder="8"
          error={errors.fullDayHours}
          keyboardType="decimal-pad"
          onFocus={onFieldFocus}
          maxLength={4}
          trailingAdornment={<Text style={styles.suffix}>hrs</Text>}
          style={styles.timeInput}
        />
        <Input
          label="Half-day hours"
          value={state.halfDayHours}
          onChangeText={(text) => onChange({ halfDayHours: text })}
          placeholder="4"
          error={errors.halfDayHours}
          keyboardType="decimal-pad"
          onFocus={onFieldFocus}
          maxLength={4}
          trailingAdornment={<Text style={styles.suffix}>hrs</Text>}
          style={styles.timeInput}
        />
      </View>
      <Text style={styles.hint}>
        Hours an employee must work to be counted as a full day or a half day. For example, 8 and 4.
      </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  noteText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  timeInput: {
    flex: 1,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  suffix: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
