/**
 * Input — labeled text field with optional leading icon, helper & error text.
 * Ported from the Fenzit Design System (web) to React Native.
 *
 * Mobile-first: 48px tall, 16px text (prevents iOS zoom on web; keeps a
 * comfortable touch target on native). Focus shows a soft-blue border;
 * errors turn the border red and swap helper text for the message.
 */
import { forwardRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {colors, fontSize, radius, typography, touch, spacing} from '../../theme';
import { X } from 'lucide-react-native';
import { FloatingLabel } from './FloatingLabel';

export type InputProps = {
  label?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  leadingIcon?: ReactNode;
  /** Trailing adornment inside the field row — a unit suffix ("mins", "hrs"). */
  trailingAdornment?: ReactNode;
  helper?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  /**
   * false renders normally (value, placeholder, focus/blur styling) but
   * blocks the keyboard and text editing — for a field that's really a tap
   * target for something else (e.g. a picker), not real text entry. Unlike
   * `disabled`, it doesn't gray out the field.
   */
  editable?: boolean;
  /**
   * Label sits inside the border while the field is empty and unfocused, and
   * moves up onto the border line once the field is focused or has a value
   * (the Material "outlined floating label" pattern). Off by default.
   */
  floatingLabel?: boolean;
  /** Shows a round ✕ at the end while the field has text; tapping it empties the field. */
  clearable?: boolean;
  style?: StyleProp<ViewStyle>;
} & Pick<
  TextInputProps,
  'keyboardType' | 'autoCapitalize' | 'autoCorrect' | 'secureTextEntry' | 'maxLength' | 'onBlur' | 'onFocus' | 'multiline' | 'numberOfLines' | 'autoFocus' | 'accessibilityLabel'
>;

/** Ref forwards to the underlying `TextInput` (e.g. to focus it
 *  programmatically when a native sheet finishes presenting). RN 0.87 types
 *  the instance as `TextInputInstance` (a ReactNativeElement — focus() lives
 *  there), no longer the component's props type. */
export const Input = forwardRef<TextInputInstance, InputProps>(function Input({
  label,
  value,
  onChangeText,
  placeholder,
  leadingIcon = null,
  trailingAdornment = null,
  helper = '',
  error = '',
  disabled = false,
  required = false,
  editable = true,
  floatingLabel = false,
  clearable = false,
  style,
  onFocus,
  onBlur,
  ...rest
}, ref) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);
  const fieldBg = disabled ? colors.surfaceSunken : colors.surfaceCard;

  const borderColor = invalid
    ? colors.danger
    : focused
    ? colors.borderFocus
    : colors.borderDefault;

  return (
    <View style={[styles.wrap, style]}>
      {label && !floatingLabel ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            borderColor,
            backgroundColor: disabled ? colors.surfaceSunken : colors.surfaceCard,
          },
          floatingLabel ? styles.fieldLarge : null,
          rest.multiline ? styles.fieldMultiline : null,
          focused && !invalid ? styles.fieldFocused : null,
        ]}>
        {leadingIcon ? <View style={styles.leading}>{leadingIcon}</View> : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          editable={!disabled && editable}
          // A non-editable field is often wrapped in its own `Pressable` (a
          // tap-to-open-picker field, not real text entry) — without this,
          // the `TextInput` can still capture the touch on some platform
          // versions instead of bubbling it up to that wrapper.
          pointerEvents={!disabled && editable ? 'auto' : 'none'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          // The visible label is a separate Text, so a screen reader would
          // read only the value ("15") with no field name. Name the field by
          // its label and read the error/helper as its hint; a caller's own
          // accessibilityLabel (in `rest`) still wins.
          accessibilityLabel={label || undefined}
          accessibilityHint={error || helper || undefined}
          style={[
            styles.input,
            floatingLabel ? styles.inputLarge : null,
            rest.multiline ? styles.inputMultiline : null,
          ]}
          {...rest}
        />
        {trailingAdornment ? <View style={styles.trailing}>{trailingAdornment}</View> : null}
        {clearable && value && editable && !disabled ? (
          <Pressable
            onPress={() => onChangeText?.('')}
            accessibilityRole="button"
            accessibilityLabel={label ? `Clear ${label.toLowerCase()}` : 'Clear'}
            hitSlop={8}
            style={styles.clearHit}>
            <View style={styles.clearCircle}>
              <X size={14} color={colors.surfaceCard} strokeWidth={3} />
            </View>
          </Pressable>
        ) : null}
        {floatingLabel && label ? (
          <FloatingLabel
            label={label}
            required={required}
            focused={focused}
            maskColor={fieldBg}
          />
        ) : null}
      </View>

      {helper || error ? (
        <Text style={[styles.helper, invalid ? styles.helperError : null]}>
          {error || helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    width: '100%',
  },
  label: {
    ...typography.label,
    color: colors.textStrong,
  },
  required: {
    color: colors.danger,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: touch.comfort,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  // Floating-label fields are taller with larger text, so the typed value
  // reads as clearly as the notched label above it.
  fieldLarge: {
    height: 56,
  },
  inputLarge: {
    fontSize: fontSize.lg,
  },
  fieldFocused: {
    // Soft-blue focus emphasis (RN can't render the web's 3px ring shadow
    // cleanly inside a row, so the border carries the focus state).
    borderColor: colors.borderFocus,
  },
  // Multiline ("textarea") variant: the fixed 48px control height and the
  // vertically-centred row don't apply — the box grows and text starts at the
  // top-left. Set via the standard `multiline` TextInput prop, so callers get
  // this by passing `multiline` and nothing else.
  fieldMultiline: {
    height: undefined,
    minHeight: 96,
    alignItems: 'flex-start',
    paddingVertical: spacing.s3,
  },
  leading: {
    justifyContent: 'center',
  },
  trailing: {
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    ...typography.body,
    color: colors.textStrong,
    // Centre the text box in the row so it lines up with the leading icon and
    // the placeholder. (A marginBottom nudge here pushed the text above the
    // icon's centre line.) Android also needs this to vertically centre text.
    textAlignVertical: 'center',
  },
  inputMultiline: {
    alignSelf: 'stretch',
    textAlignVertical: 'top',
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
  },
  clearHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  clearCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textMuted,
  },
  helperError: {
    color: colors.danger,
  },
});

