/**
 * PickerMapArea — the map picker's map layer (Story 15-4; redesigned per
 * ux-map-pin-picker-2026-10-18): the MapView (light Google style) or the
 * "Map unavailable" fallback (with a Retry that re-mounts the map and
 * restarts its load deadline), the centre pin + state chip overlay
 * (PickerCentrePin), the top search bar (opens the address sheet — it
 * replaces the old floating "Search address" pill), and the floating
 * locate-me pill (bottom-right, above the sheet; healthy state only).
 * Search stays functional when the map fails — the fallback panel renders
 * behind it.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, type LatLng, type Region } from 'react-native-maps';
import { Crosshair, MapPin, Search } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import PickerCentrePin from './PickerCentrePin';
import {
  colors,
  radius,
  shadow,
  spacing,
  touch,
  typography,
  LIGHT_MAP_STYLE,
} from '../../../theme';

type Props = {
  mapRef: React.RefObject<MapView | null>;
  pin: LatLng;
  /** Geofence radius in metres. Omit for non-geofenced pickers (customer
   *  mode) — no Circle renders. */
  radiusM?: number;
  isPanning: boolean;
  mapFailed: boolean;
  locating: boolean;
  /** Device location services are off — the centre pin becomes the
   *  crosshair "drag-to-set" puck and the locate pill hides. The same flag
   *  the bottom card receives. */
  servicesOff: boolean;
  onRegionChange: (region: Region) => void;
  onRegionChangeComplete: (region: Region) => void;
  onMapLoaded: () => void;
  /** Re-mounts the map after the "Map unavailable" fallback — a slow map
   *  gets a second load deadline instead of a terminal fallback. */
  onRetry: () => void;
  onOpenSearch: () => void;
  onLocate: () => void;
};

export default function PickerMapArea({
  mapRef,
  pin,
  radiusM,
  isPanning,
  mapFailed,
  locating,
  servicesOff,
  onRegionChange,
  onRegionChangeComplete,
  onMapLoaded,
  onRetry,
  onOpenSearch,
  onLocate,
}: Props) {
  return (
    <View style={styles.mapWrap}>
      {mapFailed ? (
        <View style={styles.mapFallback}>
          <MapPin size={24} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.mapFallbackText}>Map unavailable</Text>
          <Text style={styles.mapFallbackHint}>
            You can still use current location or address search, then confirm.
          </Text>
          <Button
            variant="secondary"
            leadingIcon={<MapPin size={16} color={colors.primary} strokeWidth={2} />}
            onPress={onRetry}>
            Retry map
          </Button>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider="google"
          customMapStyle={LIGHT_MAP_STYLE}
          initialRegion={{ ...pin, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
          onMapLoaded={onMapLoaded}>
          {radiusM != null ? (
            <Circle
              center={pin}
              radius={radiusM}
              strokeWidth={2}
              strokeColor={colors.primary}
              // ~16% opacity fill derived from the primary token.
              fillColor={`${colors.primary}29`}
            />
          ) : null}
        </MapView>
      )}

      <PickerCentrePin servicesOff={servicesOff} isPanning={isPanning} mapFailed={mapFailed} />

      {/* Floating controls: search bar on top, locate-me pill bottom-right. */}
      <View style={styles.searchWrap}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search address, street, landmark"
          onPress={onOpenSearch}
          style={styles.searchBar}>
          <Search size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            Search address, street, landmark…
          </Text>
          <View style={styles.searchChip}>
            <Text style={styles.searchChipText}>Search</Text>
          </View>
        </Pressable>
      </View>
      {/* Locate-me pill: healthy state only. With services off it cannot
          produce a fix, so it must not invite a dead tap (user decision
          2026-10-18) — the red card owns that state's actions. */}
      {!servicesOff ? (
        <View style={styles.locateWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            accessibilityState={{ busy: locating }}
            onPress={locating ? undefined : onLocate}
            style={styles.locatePill}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Crosshair size={16} color={colors.primary} strokeWidth={2} />
            )}
            <Text style={styles.locateText}>Use my current location</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    padding: spacing.s6,
    backgroundColor: colors.surfaceCard,
  },
  mapFallbackText: {
    ...typography.heading,
    color: colors.textStrong,
  },
  mapFallbackHint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  searchWrap: {
    position: 'absolute',
    top: spacing.s3,
    left: spacing.s4,
    right: spacing.s4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  searchPlaceholder: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
  },
  searchChip: {
    height: 32,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchChipText: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  locateWrap: {
    position: 'absolute',
    bottom: spacing.s4,
    right: spacing.s4,
  },
  locatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    paddingHorizontal: spacing.s4,
    borderRadius: touch.min / 2,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  locateText: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
});
