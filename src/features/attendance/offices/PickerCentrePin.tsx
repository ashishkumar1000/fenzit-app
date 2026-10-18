/**
 * PickerCentrePin — the map picker's centre overlay (static React view,
 * never a native Marker): services healthy = the teardrop pin with the
 * "Exact location" chip; services off = the crosshair drag-to-set puck
 * (beacon ripple) with the "Move the map to set the pin" chip. A 150 ms
 * opacity swap driven by the SAME `servicesOff` flag the bottom card
 * receives (lifted to the screen) so map and sheet can never disagree. The
 * chip hides while dragging and returns on settle, and while the map
 * itself is unavailable.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MapPin, TriangleAlert } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

// The pin-swap cross-fade duration (DESIGN.md map-surface spec).
const PIN_SWAP_MS = 150;

type Props = {
  servicesOff: boolean;
  isPanning: boolean;
  mapFailed: boolean;
};

export default function PickerCentrePin({ servicesOff, isPanning, mapFailed }: Props) {
  // 1 = teardrop (services healthy), 0 = crosshair puck — cross-faded on
  // every servicesOff swap so the pin never hard-cuts between states.
  const pinFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(pinFade, {
      toValue: servicesOff ? 0 : 1,
      duration: PIN_SWAP_MS,
      useNativeDriver: true,
    }).start();
  }, [servicesOff, pinFade]);
  const puckFade = pinFade.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  // Beacon/ripple on the current-location dot (services off only): two
  // staggered rings expanding + fading behind the puck dot — the "this spot
  // is live" radar read. The loop stops on unmount/state flip so nothing
  // leaks into tests or the healthy state.
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!servicesOff) {
      ripple.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [servicesOff, ripple]);
  const rippleScale = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const rippleOpacity = ripple.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0.45, 0.18, 0],
  });

  return (
    <View style={styles.pinLayer} pointerEvents="none">
      <Animated.View
        style={[
          styles.centreLayer,
          styles.pinNudge,
          { opacity: pinFade },
          isPanning && styles.pinLifted,
        ]}>
        <MapPin size={38} color={colors.primary} fill={colors.primary} strokeWidth={2} />
      </Animated.View>
      <Animated.View style={[styles.centreLayer, { opacity: puckFade }]}>
        {/* Crosshair "you-are-here" puck: beacon ripple rings + translucent
            ring + solid dot + ground shadow — drag-to-set semantics for
            services off. */}
        <View style={styles.puck}>
          <Animated.View
            style={[
              styles.rippleRing,
              { transform: [{ scale: rippleScale }], opacity: rippleOpacity },
            ]}
          />
          <View style={styles.puckRing}>
            <View style={styles.puckDot} />
          </View>
          <View style={styles.puckGround} />
        </View>
      </Animated.View>
      {!isPanning && !mapFailed ? (
        <View style={styles.centreLayer}>
          <View style={styles.mapChip}>
            {servicesOff ? (
              <>
                <TriangleAlert size={12} color={colors.status.cancelled.solid} strokeWidth={2} />
                <Text style={styles.mapChipText}>Move the map to set the pin</Text>
              </>
            ) : (
              <>
                <View style={styles.mapChipDot} />
                <Text style={styles.mapChipText}>Exact location</Text>
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pinLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // One absolute-fill centred layer per overlay (teardrop / puck / chip) so
  // they stack on the same centre point instead of flowing as a column.
  centreLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Half-height nudge puts the glyph's tip on the map centre (spike value).
  pinNudge: {
    transform: [{ translateY: -22 }],
  },
  pinLifted: {
    transform: [{ translateY: -34 }],
  },
  puck: {
    alignItems: 'center',
  },
  puckRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    // ~20% primary fill derived from the token (the geofence-circle idiom).
    backgroundColor: `${colors.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puckDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surfaceCard,
  },
  // The beacon ring: expands from the dot's footprint (36) outward and
  // fades — absolutely centred on the ring so it never nudges the column.
  rippleRing: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  puckGround: {
    width: 16,
    height: 5,
    borderRadius: radius.pill,
    marginTop: spacing.s1,
    // ~15% inverse-surface ink derived from the token — a soft ground shadow.
    backgroundColor: `${colors.surfaceInverse}26`,
  },
  // Floats the chip just above the pin glyph (glyph top ≈ centre − 41).
  mapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.pill,
    // Inverse-surface ink @ ~85% (alpha suffix on the token — the same
    // derive-translucency-from-a-token idiom as the geofence fill).
    backgroundColor: `${colors.surfaceInverse}D9`,
    transform: [{ translateY: -64 }],
  },
  mapChipText: {
    ...typography.caption,
    color: colors.textOnColor,
  },
  mapChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.status.done.solid,
  },
});
