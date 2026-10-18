/**
 * PickerBottomCard — the map picker's bottom sheet (Story 15-4; redesigned
 * per ux-map-pin-picker-2026-10-18). TWO layouts driven by ONE `servicesOff`
 * flag (lifted to the screen and shared with the map surface, so the sheet
 * can never disagree with the pin style / state chip):
 *
 *  - Services OFF → the red card (icon chip + plain-English title + body —
 *    never the word "permission"), the Nearby area row (reverse geocode of
 *    the current pin — manual drag placement is first-class, so the geocode
 *    runs on settle even with services off; on failure it falls back to the
 *    raw coordinates, never an error) and the [Turn on location]
 *    remediation (the existing enableServices ladder). Manual search lives
 *    in the map's top search bar, not here. No generic error row in this
 *    state, and Confirm stays available — a device toggle never locks the
 *    owner out of manual placement.
 *  - Pinned / healthy → the green "✓ LOCATION SET" status chip + muted
 *    "Move map to adjust" hint, the address card (bold place name = first
 *    comma segment of the reverse geocode, remaining lines muted, a Change
 *    link that opens the address sheet), and Confirm.
 *
 * Shared across both layouts: the generic locate error row (plain error
 * text + ghost [Open settings] after a second denial — visually distinct
 * from the red card, which owns the device-toggle case), the accessible
 * radius stepper (office mode only — non-geofenced pickers omit it, between
 * the address area and Confirm per the frozen decision), and the Confirm
 * action that returns the FINAL pin to the calling form.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, Check, Crosshair, MapPin } from 'lucide-react-native';
import { Badge, Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, touch, typography } from '../../../theme';
import RadiusStepper from './RadiusStepper';
import ServicesOffCard from './ServicesOffCard';

type Props = {
  /** Reverse-geocode label for the settled pin — a formatted address or the
   *  coordinate fallback (the screen guarantees one of the two). */
  addressText: string;
  addressLoading: boolean;
  locateError: string | null;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
  /** Device location services are off — the sheet switches to the
   *  services-off layout (red card + Nearby area + remediation button).
   *  State-driven, not error-driven: the mount probe surfaces the card
   *  before any locate attempt. */
  servicesOff?: boolean;
  onEnableServices?: () => void;
  /** Opens the address-search sheet — the pinned card's Change link. */
  onOpenSearch: () => void;
  /** Nearby-area Change hint: re-centres the map on the pin so the user
   *  sees what to drag (a hint action — dismisses nothing). */
  onFocusMap: () => void;
  /** Geofence radius in metres. Omit for non-geofenced pickers (customer
   *  mode) — the stepper does not render. */
  radiusM?: number;
  onRadiusChange?: (next: number) => void;
  onConfirm: () => void;
};

export default function PickerBottomCard({
  addressText,
  addressLoading,
  locateError,
  canOpenSettings,
  onOpenSettings,
  servicesOff = false,
  onEnableServices,
  onOpenSearch,
  onFocusMap,
  radiusM,
  onRadiusChange,
  onConfirm,
}: Props) {
  // The address card's bold first line is the place name — the first comma
  // segment of the reverse geocode; the rest renders muted beneath it.
  // A raw "lat, lng" fallback label is one value, not name + rest — never
  // split it at its comma.
  const isCoordinateLabel = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(addressText.trim());
  const commaIdx = isCoordinateLabel ? -1 : addressText.indexOf(',');
  const placeName = commaIdx > 0 ? addressText.slice(0, commaIdx).trim() : addressText;
  const placeRest = commaIdx > 0 ? addressText.slice(commaIdx + 1).trim() : null;
  const approxLabel = `Nearby area: ${addressText}`;

  return (
    <View style={styles.sheet}>
      {/* Decorative drag handle — the sheet look, not a control. */}
      <View style={styles.handle} />

      {servicesOff ? (
        <>
          <ServicesOffCard />

          <View style={styles.approxRow}>
            {addressLoading ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <MapPin size={16} color={colors.textMuted} strokeWidth={1.5} />
            )}
            <Text style={styles.approxText} numberOfLines={2}>
              {approxLabel}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change area"
              onPress={onFocusMap}
              style={styles.changeTarget}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View style={styles.statusRow}>
            <Badge
              status="done"
              size="sm"
              icon={<Check size={12} color={colors.status.done.fg} strokeWidth={3} />}>
              LOCATION SET
            </Badge>
            <Text style={styles.refineHint}>Move map to adjust</Text>
          </View>

          <View style={styles.addressCard} testID="picker-address-card">
            <View style={styles.addressIconChip}>
              <Building2 size={16} color={colors.textMuted} strokeWidth={1.5} />
            </View>
            <View style={styles.addressCopy}>
              {addressLoading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <>
                  <Text style={styles.addressName} numberOfLines={1}>
                    {placeName}
                  </Text>
                  {placeRest ? (
                    <Text style={styles.addressRest} numberOfLines={2}>
                      {placeRest}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change address"
              onPress={onOpenSearch}
              style={styles.changeTarget}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Generic transient failure (timeout / denied / failed with services
       *  healthy) — plain error row, never in the services-off state (the
       *  red card owns that cause). */}
      {locateError && !servicesOff ? (
        <View style={styles.locateErrorRow}>
          <Text style={styles.locateErrorText}>{locateError}</Text>
          {canOpenSettings ? (
            <Button variant="ghost" onPress={onOpenSettings}>
              Open settings
            </Button>
          ) : null}
        </View>
      ) : null}

      {radiusM != null && onRadiusChange ? (
        <RadiusStepper radiusM={radiusM} onChange={onRadiusChange} />
      ) : null}

      {servicesOff && onEnableServices ? (
        <>
          <Button
            fullWidth
            leadingIcon={<Crosshair size={16} color={colors.onPrimary} strokeWidth={2} />}
            onPress={onEnableServices}>
            Turn on location
          </Button>
          {/* No separate "search manually" button: the top search bar owns
              that action (user decision 2026-10-18). */}
        </>
      ) : null}

      {/* State-based hierarchy: while services are off the remediation is
          the hero action, so Confirm de-emphasises to outline (still fully
          tappable — manual placement is never locked out); healthy, Confirm
          is the screen's primary. One solid primary per state. */}
      <Button fullWidth variant={servicesOff ? 'secondary' : 'primary'} onPress={onConfirm}>
        Confirm location
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: spacing.s4,
    backgroundColor: colors.surfaceCard,
    // Sheets/modals token — this card is the picker's bottom sheet panel.
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.sheet,
    gap: spacing.s3,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
  },
  approxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
  },
  approxText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  // --- Pinned layout ---
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refineHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
  },
  addressIconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  addressCopy: {
    flex: 1,
    gap: 2,
  },
  addressName: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  addressRest: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  // Blue text link; the 44px floor comes from minHeight (the label is
  // centred inside the target), so the compact link stays tappable.
  changeTarget: {
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.s1,
  },
  changeText: {
    ...typography.labelStrong,
    color: colors.textLink,
  },
  // --- Shared ---
  locateErrorRow: {
    gap: spacing.s1,
  },
  locateErrorText: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
