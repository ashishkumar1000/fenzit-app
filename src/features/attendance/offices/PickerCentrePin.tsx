/**
 * PickerCentrePin — the map picker's centre overlay (static React view,
 * never a native Marker): ONE pin in every state — the pulsing dot (beacon
 * ripple + ring + solid dot + ground shadow) — with a state chip above it:
 * "Drag map to set pin" in both states (the dot is green with
 * services on, amber with services off). Driven by the SAME `servicesOff` flag the bottom card
 * receives (lifted to the screen) so map and sheet can never disagree. The
 * chip hides while dragging and returns on settle, and while the map
 * itself is unavailable.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  servicesOff: boolean;
  /** A pin is already set (saved office, device fix or a moved map) — the chip says "move", not "set". */
  hasPin?: boolean;
  isPanning: boolean;
  mapFailed: boolean;
};

/**
 * The state chip. A single soft settle-bounce plays each time it appears
 * (mount, return after a drag, or a services flip) to draw the eye once —
 * not a loop (the puck ripple already runs one), and skipped entirely when
 * the OS reduce-motion setting is on.
 */
function StateChip({ servicesOff, hasPin }: { servicesOff: boolean; hasPin: boolean }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .catch(() => false)
      .then(reduce => {
      if (cancelled || reduce) {
        bounce.setValue(1);
        return;
      }
      bounce.setValue(0);
      Animated.spring(bounce, {
        toValue: 1,
        friction: 6,
        tension: 55,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [bounce]);

  return (
    <Animated.View
      style={{
        opacity: bounce.interpolate({
          inputRange: [0, 0.4],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
        transform: [
          { translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}>
      <View style={styles.mapChip}>
        <View style={servicesOff ? styles.mapChipDotOff : styles.mapChipDot} />
        <Text style={styles.mapChipText}>{hasPin ? 'Drag map to move pin' : 'Drag map to set pin'}</Text>
      </View>
    </Animated.View>
  );
}

export default function PickerCentrePin({ servicesOff, hasPin = false, isPanning, mapFailed }: Props) {
  // Beacon/ripple on the pin dot: a ring expanding + fading behind the dot
  // — the "this spot is live" radar read. Looping for the lifetime of the
  // overlay (stops on unmount); with the OS reduce-motion setting on, the
  // ring stays still and invisible.
  const ripple = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .catch(() => false)
      .then(reduce => {
      if (cancelled) return;
      if (reduce) {
        ripple.setValue(1);
        return;
      }
      loop = Animated.loop(
        Animated.timing(ripple, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [ripple]);
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
      <View style={styles.centreLayer}>
        {/* The pin: beacon ripple ring + translucent ring + solid dot +
            ground shadow. */}
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
      </View>
      {!isPanning && !mapFailed ? (
        <View style={styles.centreLayer}>
          {/* Keyed so the settle-bounce replays when the state flips. */}
          <StateChip key={servicesOff ? 'off' : 'on'} servicesOff={servicesOff} hasPin={hasPin} />
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
  // One absolute-fill centred layer per overlay (pin / chip) so
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
  mapChipDotOff: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.status.scheduled.solid,
  },
});
