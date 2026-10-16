/**
 * AddressPickerField — the "Address" field of the add-customer form as one
 * self-contained control: the tap target that opens the `MapPinPicker`
 * screen (mode `customer` — exact pin on a map, with address search and the
 * manual-entry fallback available inside it, per SPEC-customer-map-pin-picker)
 * and the primary-tint border pulse that plays when a pick lands.
 *
 * Since the map picker replaced the plain search sheet as this field's
 * picker, the field is purely presentational: the screen owns navigation
 * (`onPress`) and form state, and bumps `pickSignal` whenever it applies a
 * returned pick — that transition is what fires the pulse here.
 *
 * The whole field opens the picker — the `Input` is `editable={false}` (no
 * keyboard, no direct typing) so a tap anywhere on it, not just the leading
 * icon, opens the map instead of focusing.
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Input } from '../../../components/ui';
import { colors, radius } from '../../../theme';

/** Each leg of the populate border-pulse (0→1→0, ~200ms total). */
const PULSE_LEG_MS = 100;

type Props = {
  /** The displayed address line (owned by the caller's form state). */
  value: string;
  /** Disabled while the surrounding form is submitting. */
  disabled?: boolean;
  /** Opens the map pin picker (the caller navigates). */
  onPress: () => void;
  /** Bumped by the caller each time a picked address is applied — the
   *  0→non-zero transition triggers the populate pulse. */
  pickSignal: number;
};

export function AddressPickerField({
  value,
  disabled = false,
  onPress,
  pickSignal,
}: Props) {
  // Soft primary-tint border pulse on the address field when a picked
  // address lands — 0 = no highlight (transparent ring), 1 = full tint.
  const addressPulse = useRef(new Animated.Value(0)).current;

  // A JS-driven pulse keeps rescheduling animation frames while it runs —
  // stop it on unmount so nothing is left ticking after this component is
  // gone (in Jest this surfaces as a post-teardown crash of the test worker).
  useEffect(
    () => () => {
      addressPulse.stopAnimation();
    },
    [addressPulse],
  );

  const prevSignal = useRef(pickSignal);
  useEffect(() => {
    if (pickSignal !== prevSignal.current) {
      prevSignal.current = pickSignal;
      addressPulse.setValue(0);
      Animated.sequence([
        Animated.timing(addressPulse, {
          toValue: 1,
          duration: PULSE_LEG_MS,
          useNativeDriver: false, // interpolating borderColor, not transform/opacity
        }),
        Animated.timing(addressPulse, {
          toValue: 0,
          duration: PULSE_LEG_MS,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [pickSignal, addressPulse]);

  const addressBorderColor = addressPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', colors.ringFocus],
  });

  return (
    // The whole field opens `MapPinPicker` — it's `editable={false}` (no
    // keyboard, no direct typing) so a tap anywhere on it opens the map
    // instead of focusing. The border pulse only appears after a pick.
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Set the customer's location"
      accessibilityHint="Opens the map to pin the exact location, with address search.">
      <Animated.View
        style={[styles.addressHighlight, { borderColor: addressBorderColor }]}>
        <Input
          label="Address"
          value={value}
          editable={false}
          // Multiline (the design system's textarea variant): a pinned
          // address is often longer than one line — it must show IN FULL,
          // not scroll to the tail inside a 48px field.
          multiline
          placeholder="Tap to pin the location on a map"
          helper="Shown to the technician on the job"
          leadingIcon={<MapPin size={18} color={colors.textMuted} strokeWidth={2} />}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Halo ring around the address `Input` — `borderColor` animates between
  // transparent (rest) and `colors.ringFocus` (populate pulse); see
  // `addressPulse` above.
  addressHighlight: {
    borderWidth: 2,
    borderRadius: radius.md + 4,
    padding: 2,
  },
});
