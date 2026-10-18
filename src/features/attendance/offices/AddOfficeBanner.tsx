/**
 * AddOfficeBanner — the full-width "Add office" CTA at the top of the
 * Offices list: a blue gradient surface with the `map` pattern (a dashed
 * route to a ringed marker, like a check-in radius), the plus tile, a title
 * and a one-line hint. The whole banner is the button.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { GradientSurface } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = { onPress: () => void };

export default function AddOfficeBanner({ onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add office"
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
      <GradientSurface pattern="map" style={styles.surface}>
        <View style={styles.icon}>
          <Plus size={20} color={colors.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title}>Add office</Text>
          <Text style={styles.subtitle}>Set the check-in area &amp; shift hours</Text>
        </View>
      </GradientSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    marginTop: spacing.s2,
    borderRadius: radius.xl,
  },
  pressed: {
    opacity: 0.9,
  },
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    ...typography.heading,
    color: colors.onPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.onPrimary,
    opacity: 0.8,
  },
});
