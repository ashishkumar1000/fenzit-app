/**
 * PickContactButton — the round contact-card button shown at the end of a
 * phone field. Tapping it opens the phone's own contacts picker. The caller
 * owns the picking logic; this only draws the button and its states.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { ContactCardIcon } from './ContactCardIcon';

export type PickContactButtonProps = {
  onPress: () => void;
  disabled?: boolean;
};

export function PickContactButton({ onPress, disabled = false }: PickContactButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel="Pick from contacts"
      accessibilityHint="Opens your phone's contacts"
      hitSlop={8}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}>
      <View style={styles.tile}>
        <ContactCardIcon size={26} color={disabled ? colors.textMuted : colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  pressed: {
    opacity: 0.6,
  },
  tile: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
});
