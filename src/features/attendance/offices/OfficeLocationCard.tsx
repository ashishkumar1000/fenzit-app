/**
 * OfficeLocationCard — the form's Location section (Story 15-4, reshaped to
 * the user's two-state design). No pin yet: a dashed "No location selected"
 * panel, a "Not set" chip and "Set location on map". Pin placed: the map
 * preview with radius and coordinates, a status chip ("GPS Verified" when
 * the pin is the device's own fix) and "Adjust pin location on map". The
 * office stores coordinates only (no address), so coordinates are what the
 * preview shows. The field error shows inline when saving without a pin.
 */
import { StyleSheet, Text, View } from 'react-native';
import { MapPin, Pencil, Plus } from 'lucide-react-native';
import { Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import LocationMapPreview from './LocationMapPreview';
import MapIllustration from './MapIllustration';
import type { OfficeFormErrors, OfficeFormState } from './officeFormModel';

type Props = {
  form: OfficeFormState;
  errors: OfficeFormErrors;
  /** True while the pin is the device's own fix — shows "GPS Verified". */
  gpsVerified: boolean;
  /** Street address of the picked pin, when known — else coordinates show. */
  address?: string | null;
  /** Opens MapPinPicker (mode `office`) with the current pin + radius. */
  onOpenPicker: () => void;
};

export default function OfficeLocationCard({ form, errors, gpsVerified, address, onOpenPicker }: Props) {
  const { latitude, longitude } = form;
  const hasPin = latitude !== null && longitude !== null;
  const verified = hasPin && gpsVerified;
  const statusLabel = verified ? 'GPS Verified' : hasPin ? 'Pin set' : 'Not set';

  return (
    // No pin yet: the whole card is one big "set location" target, not just
    // the button. With a pin, only "Adjust" opens the picker (the preview
    // is not a control).
    <Card
      interactive={!hasPin}
      onPress={onOpenPicker}
      accessibilityRole={hasPin ? undefined : 'button'}
      accessibilityLabel={hasPin ? undefined : 'Set location on map'}>
      <View style={styles.stack}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Location</Text>
            <Text style={styles.subtitle}>(Geofenced)</Text>
          </View>
          {/* A status chip, not a job state — green only for a verified fix. */}
          <View style={[styles.status, verified && styles.statusVerified]}>
            <View style={[styles.statusDot, verified && styles.statusDotVerified]} />
            <Text style={[styles.statusText, verified && styles.statusTextVerified]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {hasPin ? (
          <LocationMapPreview latitude={latitude} longitude={longitude} radiusM={form.radiusM}
            address={address}
          />
        ) : (
          <View style={[styles.empty, errors.location ? styles.emptyError : null]}>
            <View style={styles.emptyBackdrop}>
              <MapIllustration faint />
            </View>
            <View style={styles.emptyIcon}>
              <MapPin size={22} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>No location selected</Text>
            <Text style={styles.emptyBody}>
              Search for an address or drop a pin to set where staff can check in.
            </Text>
          </View>
        )}

        {errors.location ? <Text style={styles.fieldError}>{errors.location}</Text> : null}

        <Button
          variant="secondary"
          fullWidth
          leadingIcon={
            hasPin ? (
              <Pencil size={16} color={colors.primary} strokeWidth={2} />
            ) : (
              <Plus size={16} color={colors.primary} strokeWidth={2} />
            )
          }
          onPress={onOpenPicker}>
          {hasPin ? 'Adjust pin location on map' : 'Set location on map'}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  titleGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s2,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  statusVerified: {
    borderColor: colors.status.done.bg,
    backgroundColor: colors.status.done.bg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  statusDotVerified: {
    backgroundColor: colors.success,
  },
  statusText: {
    ...typography.labelStrong,
    color: colors.textMuted,
  },
  statusTextVerified: {
    color: colors.status.done.fg,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.s1,
    paddingVertical: spacing.s6,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  emptyBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  emptyError: {
    borderColor: colors.danger,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.s2,
  },
  emptyTitle: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  emptyBody: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fieldError: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
