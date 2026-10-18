/**
 * TimeField — the DS kit's one clock-time entry control (Story 18-4 §10,
 * D-TP1). The `Input`'s visual anatomy (label on top, value box, trailing
 * Clock adornment, helper/error below) rendered as a Pressable — NO
 * keyboard, ever. A typed time was the exact failure class the 18-4 device
 * walkthrough caught live ("0800" without the colon); a picker makes
 * wrong-format input impossible.
 *
 * Press → TimePickerSheet (same card on both platforms): scroll wheels for
 * hour, minute and am/pm plus one-tap `presets` chips, replacing the OS clock dial. Nothing
 * commits until Done. The sheet
 * opens at the current value (or the placeholder, or 09:00). The zero-padded
 * 24-hour "HH:mm" string is the only thing that crosses into app state —
 * a wall-clock UI value, not a carried instant.
 *
 * `clearable` adds a small "Clear" action for OPTIONAL times whose empty
 * value MEANS something on the wire (18-2: omitting check-out in the write
 * clears the stored one — a filled picker field could otherwise never
 * express that).
 */
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Clock } from 'lucide-react-native';
import { TimePickerSheet } from './TimePickerSheet';
import { colors, radius, typography, touch } from '../../theme';

export type TimeFieldProps = {
  label: string;
  /** Zero-padded 24-hour "HH:mm" — the only shape this field exchanges. */
  value: string;
  onChangeValue: (hhmm: string) => void;
  placeholder?: string;
  /** Inline error — flips the border red and replaces the helper copy. */
  error?: string;
  /** Helper copy shown only when there's no error. */
  helper?: string;
  /** Renders the "Clear" action while filled (optional times only). */
  clearable?: boolean;
  /** One line under the picker's title. */
  pickerSubtitle?: string;
  /** Usual times as one-tap chips in the picker (valid 24-hour "HH:mm"). */
  presets?: readonly string[];
  style?: StyleProp<ViewStyle>;
};

/** Zero-padded 24-hour "HH:mm" — the same shape the form gates validate. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The sheet's opening time: the current value when it's a valid "HH:mm",
 *  else the placeholder when valid, else 09:00. */
function startingValue(value: string, placeholder?: string): string {
  if (HHMM.test(value)) return value;
  if (placeholder != null && HHMM.test(placeholder)) return placeholder;
  return '09:00';
}

export function TimeField({
  label,
  value,
  onChangeValue,
  placeholder,
  error = '',
  helper = '',
  clearable = false,
  pickerSubtitle,
  presets,
  style,
}: TimeFieldProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const invalid = Boolean(error);
  const borderColor = invalid ? colors.danger : colors.borderDefault;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {clearable && value !== '' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={() => onChangeValue('')}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || placeholder || ''}`}
        accessibilityHint="Opens the time picker."
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { borderColor, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Text
          style={[styles.value, value === '' ? styles.valuePlaceholder : null]}
          numberOfLines={1}>
          {value || placeholder || ''}
        </Text>
        <View style={styles.icon}>
          <Clock size={20} color={colors.textMuted} strokeWidth={2} />
        </View>
      </Pressable>

      {helper || error ? (
        <Text style={[styles.helper, invalid ? styles.helperError : null]}>
          {error || helper}
        </Text>
      ) : null}

      <TimePickerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={label}
        subtitle={pickerSubtitle}
        presets={presets}
        initial={startingValue(value, placeholder)}
        onDone={(hhmm) => {
          onChangeValue(hhmm);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  clearText: {
    ...typography.label,
    color: colors.primary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
  },
  value: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
    minWidth: 0,
  },
  valuePlaceholder: {
    color: colors.textMuted,
  },
  icon: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helperError: {
    color: colors.danger,
  },
});
