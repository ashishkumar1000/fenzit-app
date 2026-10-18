/**
 * LocationMapPreview — the Location card's picture of the office pin: the
 * drawn map (MapIllustration) with the check-in rings and pin, a
 * "Radius: N m" chip and the coordinates. It is an illustration, not a live
 * map — the rings are not to scale, so the chip carries the real radius.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import MapIllustration from './MapIllustration';

type Props = {
  latitude: number;
  longitude: number;
  radiusM: number;
  /** Street address; without it the coordinates are shown instead. */
  address?: string | null;
};

const HEIGHT = 168;

/** 12.9768° N, 77.7384° E — hemisphere letters instead of minus signs. */
export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

export default function LocationMapPreview({ latitude, longitude, radiusM, address }: Props) {
  return (
    <View style={styles.frame}>
      <MapIllustration marker />

      <View style={[styles.chip, styles.radiusChip]}>
        <View style={styles.chipDot} />
        <Text style={styles.chipText}>Radius: {radiusM} m</Text>
      </View>
      <View style={[styles.chip, styles.coordsChip]}>
        <Text style={styles.chipText} numberOfLines={2}>
          {address || formatCoordinates(latitude, longitude)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfaceCardGlass,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  radiusChip: { top: spacing.s3, left: spacing.s3 },
  // A full address can wrap to a few lines, so this chip is a rounded box, not a pill.
  coordsChip: {
    bottom: spacing.s3,
    left: spacing.s3,
    right: spacing.s3,
    alignSelf: 'flex-start',
    borderRadius: radius.md,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
});
