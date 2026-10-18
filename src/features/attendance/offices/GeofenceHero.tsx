/**
 * GeofenceHero — the decorative first-run illustration: a two-tone app-icon
 * tile with a white pin, floating over concentric "radius" rings and a faint
 * crosshair, with a small GEOFENCE chip at the top right. Flat colours only
 * (design system: no gradients) — the tile's depth is two stacked tones.
 */
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors, palette, radius, shadow, spacing, typography } from '../../../theme';

const OUTER = 240;
const INNER = 150;
const TILE = 96;
const PIN = 44;
// The pin's inner circle sits a little above the icon's centre (cy 10 of 24).
const DOT = 9;
const DOT_TOP = (TILE - DOT) / 2 - ((12 - 10) / 24) * PIN;

export default function GeofenceHero() {
  return (
    // Purely decorative — screen readers skip it.
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.outerRing} />
      <View style={styles.innerRing} />
      <View style={styles.lineH} />
      <View style={styles.lineV} />

      <View style={styles.tile}>
        <View style={styles.tileTop} />
        <View style={styles.tileBottom} />
        <MapPin
          size={PIN}
          color={colors.onPrimary}
          fill={colors.onPrimary}
          strokeWidth={1.5}
        />
        <View style={styles.pinDot} />
      </View>

      <View style={styles.chip}>
        <View style={styles.chipDot} />
        <Text style={styles.chipText}>GEOFENCE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: OUTER,
    height: OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: OUTER,
    height: OUTER,
    borderRadius: OUTER / 2,
    backgroundColor: colors.primarySoft,
    opacity: 0.6,
    borderWidth: 1,
    borderColor: palette.blue100,
  },
  innerRing: {
    position: 'absolute',
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    backgroundColor: colors.surfaceCard,
    opacity: 0.7,
    borderWidth: 1,
    borderColor: palette.blue100,
  },
  lineH: {
    position: 'absolute',
    width: OUTER,
    height: 1,
    backgroundColor: palette.blue100,
    opacity: 0.7,
  },
  lineV: {
    position: 'absolute',
    height: OUTER,
    width: 1,
    backgroundColor: palette.blue100,
    opacity: 0.7,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue700,
    ...shadow.lg,
  },
  tileTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '50%',
    backgroundColor: palette.blue500,
  },
  tileBottom: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.blue700,
  },
  pinDot: {
    position: 'absolute',
    top: DOT_TOP,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: palette.blue700,
  },
  chip: {
    position: 'absolute',
    top: spacing.s4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    ...shadow.xs,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  chipText: {
    ...typography.eyebrow,
    color: colors.textMuted,
  },
});
