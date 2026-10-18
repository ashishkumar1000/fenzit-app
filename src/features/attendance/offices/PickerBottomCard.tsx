/**
 * PickerBottomCard — the map picker's bottom panel (Story 15-4): the
 * "Pinned near:" reverse-geocode row (with coordinate fallback), the
 * locate-me error + settings deep-link, the accessible radius stepper
 * (office mode only — non-geofenced pickers omit it), and the Confirm
 * action that returns the FINAL pin to the calling form.
 *
 * Services-off (2026-10-17) gets its own recovery block instead of the
 * generic error row: the named-cause warning notice, the [Turn on
 * location] remediation button, and the "Search address instead" fallback
 * that opens the address sheet already living in the same screen — a
 * device-toggle state is never rendered as a bare "couldn't get location".
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, InlineNotice } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import RadiusStepper from './RadiusStepper';

type Props = {
  addressRow: string;
  addressLoading: boolean;
  locateError: string | null;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
  /** Device location services are off — the error row becomes the
   *  services-off recovery block (named cause + [Turn on location]). */
  servicesOff?: boolean;
  onEnableServices?: () => void;
  /** Opens the address-search sheet — the manual fallback the services-off
   *  hint points at. */
  onOpenSearch: () => void;
  /** Geofence radius in metres. Omit for non-geofenced pickers (customer
   *  mode) — the stepper does not render. */
  radiusM?: number;
  onRadiusChange?: (next: number) => void;
  onConfirm: () => void;
};

export default function PickerBottomCard({
  addressRow,
  addressLoading,
  locateError,
  canOpenSettings,
  onOpenSettings,
  servicesOff = false,
  onEnableServices,
  onOpenSearch,
  radiusM,
  onRadiusChange,
  onConfirm,
}: Props) {
  return (
    <View style={styles.sheet}>
      <View style={styles.addressRow}>
        {addressLoading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
        <Text style={styles.addressText} numberOfLines={2}>
          {addressRow}
        </Text>
      </View>
      {locateError && servicesOff ? (
        <View style={styles.locateErrorRow}>
          <InlineNotice message={locateError} tone="warning" icon={null} />
          {onEnableServices ? (
            <Button variant="secondary" onPress={onEnableServices}>
              Turn on location
            </Button>
          ) : null}
          <Button variant="ghost" onPress={onOpenSearch}>
            Search address instead
          </Button>
        </View>
      ) : locateError ? (
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
      <Button fullWidth onPress={onConfirm}>
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
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s3,
    minHeight: 20,
  },
  addressText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  locateErrorRow: {
    marginBottom: spacing.s3,
    gap: spacing.s1,
  },
  locateErrorText: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
