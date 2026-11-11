/**
 * FloatingLabel — the label set into the top border of an outlined field
 * (a "notched" label). It always sits on the border line, with a background
 * the same colour as the field, so the border looks broken around it. The
 * placeholder stays inside the field. The label turns brand blue while the
 * field is focused.
 *
 * Used by Input when `floatingLabel` is set. The parent positions it inside a
 * relatively positioned field.
 */
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../../theme';

export type FloatingLabelProps = {
  label: string;
  required?: boolean;
  focused: boolean;
  /** Background behind the label. Match the field's background so the border is hidden. */
  maskColor: string;
};

export function FloatingLabel({ label, required = false, focused, maskColor }: FloatingLabelProps) {
  return (
    <Text
      pointerEvents="none"
      style={[
        styles.label,
        { backgroundColor: maskColor, color: focused ? colors.primary : colors.textStrong },
      ]}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    position: 'absolute',
    top: -9,
    left: 10,
    paddingHorizontal: 4,
  },
  required: {
    color: colors.danger,
  },
});
