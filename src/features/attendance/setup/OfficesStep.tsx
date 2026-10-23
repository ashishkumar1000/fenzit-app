/**
 * OfficesStep — wizard step 1 (Story 15-8). A server-truth SUMMARY of the
 * tenant's live offices; all editing is delegated to the shipped routes
 * (a card tap opens the shipped `OfficeForm` to edit — archive lives
 * there — and "Add office" opens it blank; the wizard owns progress only). The tri-state follows the `useOffices` contract: first-load
 * shimmer, first-load InlineError + Retry, stale banner over live rows.
 */
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight, MapPin, Plus } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  InlineError,
  Skeleton,
} from '../../../components/ui';
import { OfficesEmptyArt } from './OfficesEmptyArt';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services';
import type { Office } from '../../../types/office';
import { describeOfficeLocation, describeOfficeRule } from './wizardModel';

type Props = {
  /** Live offices only (the model's `liveOffices` filter). */
  offices: Office[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  /** A card tap — opens the office form in edit mode. */
  onEditOffice: (officeId: string) => void;
  /** Opens the office form empty. */
  onAddOffice: () => void;
};

export function OfficesStep({
  offices,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onEditOffice,
  onAddOffice,
}: Props) {
  if (isLoading && !hasLoaded) {
    // First load: a card-shaped shimmer, labelled (the 19-5 idiom).
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading attendance">
        <Skeleton rows={4} height={64} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load offices. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  if (offices.length === 0) {
    return (
      <View style={styles.stack}>
        <EmptyState
          illustration={<OfficesEmptyArt />}
          icon={<MapPin size={24} color={colors.primary} strokeWidth={1.5} />}
          title="No offices yet"
          description="Add your first office to set where staff can check in and their shift timings."
          ctaLabel="Add office"
          ctaIcon={<Plus size={16} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={onAddOffice}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {offices.map((office) => {
        const location = describeOfficeLocation(office);
        return (
          <Card
            key={office.id}
            padding="md"
            interactive
            onPress={() => onEditOffice(office.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${office.name}`}>
            <View style={styles.cardRow}>
              <View style={styles.cardText}>
                <Text style={styles.officeName} numberOfLines={1}>
                  {office.name}
                </Text>
                <Text style={styles.officeRule} numberOfLines={1}>
                  {office.rule
                    ? describeOfficeRule(office.rule)
                    : 'Timings not set'}
                </Text>
                <View style={styles.locationRow}>
                  <MapPin
                    size={14}
                    color={location.set ? colors.success : colors.warning}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.officeLocation,
                      !location.set && styles.officeLocationWarn,
                    ]}
                    numberOfLines={1}>
                    {location.label}
                  </Text>
                </View>
              </View>
              <ChevronRight
                size={18}
                color={colors.textMuted}
                strokeWidth={2}
              />
            </View>
          </Card>
        );
      })}
      <Button
        variant="secondary"
        leadingIcon={<Plus size={16} color={colors.primary} strokeWidth={2} />}
        onPress={onAddOffice}
        style={styles.addOffice}>
        Add office
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  // Shrink-wrapped and centered under the office cards (owner ruling
  // 2026-10-23).
  addOffice: {
    alignSelf: 'center',
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  cardText: {
    flex: 1,
  },
  officeName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  officeRule: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    marginTop: spacing.s2,
  },
  officeLocation: {
    ...typography.bodySm,
    color: colors.textBody,
    flexShrink: 1,
  },
  officeLocationWarn: {
    color: colors.warning,
  },
});
