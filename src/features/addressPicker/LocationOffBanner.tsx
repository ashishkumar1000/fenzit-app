/**
 * LocationOffBanner — the amber strip at the top of the address search sheet
 * while the phone's location is off: short plain-English message + a
 * [Turn on] pill that runs the host's enable-location ladder. Search itself
 * keeps working; this only offers the one-tap way back to accurate pins.
 * Presentational — the host owns the state and the action.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { colors, radius, spacing, touch, typography } from '../../theme';

export const LOCATION_OFF_BANNER_MESSAGE =
  'Phone location is off. Turn it on for accurate results.';

type Props = {
  onTurnOn: () => void;
};

export function LocationOffBanner({ onTurnOn }: Props) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.iconChip}>
        <TriangleAlert size={16} color={colors.status.scheduled.fg} strokeWidth={2} />
      </View>
      <Text style={styles.message}>
        {LOCATION_OFF_BANNER_MESSAGE}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Turn on location"
        onPress={onTurnOn}
        style={styles.pill}>
        <Text style={styles.pillText}>Turn on</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    marginTop: spacing.s2,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.status.scheduled.bg,
    borderColor: colors.status.scheduled.border,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.scheduled.border,
  },
  message: {
    ...typography.bodySm,
    color: colors.status.scheduled.fg,
    flex: 1,
  },
  pill: {
    minHeight: touch.min,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.status.scheduled.solid,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
});
