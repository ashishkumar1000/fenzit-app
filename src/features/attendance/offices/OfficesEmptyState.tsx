/**
 * OfficesEmptyState — the first-run Offices screen: the GeofenceHero
 * illustration, title, description and an inviting CTA, with a two-step
 * "Quick setup guide" card below. Guide copy mirrors what the form offers:
 * a map pin placed by address search or by moving the map, and a radius
 * between RADIUS_MIN_M and RADIUS_MAX_M.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import GeofenceHero from './GeofenceHero';
import { RADIUS_MAX_M, RADIUS_MIN_M } from './RadiusStepper';

type Props = {
  onAddOffice: () => void;
};

const STEPS = [
  {
    title: 'Pinpoint your workplace',
    body: 'Search by address or move the map to your exact building entrance.',
  },
  {
    title: 'Set the check-in radius',
    body: `Choose ${RADIUS_MIN_M} m to ${RADIUS_MAX_M} m so staff can only check in when they are on site.`,
  },
];

export default function OfficesEmptyState({ onAddOffice }: Props) {
  return (
    // ScrollView so the guide stays reachable on short screens or large text.
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <GeofenceHero />
        <Text style={styles.title}>No offices yet</Text>
        <Text style={styles.description}>
          Add your first office to set where staff can check in and their shift timings.
        </Text>
        <Button
          size="lg"
          onPress={onAddOffice}
          leadingIcon={<Plus size={16} color={colors.onPrimary} strokeWidth={2} />}
          style={styles.cta}>
          Add office
        </Button>
      </View>

      <View style={styles.guide}>
        <Text style={styles.guideEyebrow}>QUICK SETUP GUIDE</Text>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepTexts}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.s4,
    gap: spacing.s6,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
    textAlign: 'center',
    marginTop: spacing.s2,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s2,
    maxWidth: 320,
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: spacing.s6,
  },
  guide: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: spacing.s4,
    gap: spacing.s3,
    ...shadow.xs,
  },
  guideEyebrow: {
    ...typography.eyebrow,
    color: colors.textMuted,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...typography.captionStrong,
    color: colors.primary,
  },
  stepTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepTitle: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  stepBody: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
