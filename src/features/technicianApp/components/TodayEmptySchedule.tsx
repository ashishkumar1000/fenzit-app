/**
 * TodayEmptySchedule — the mockup's empty-day schedule card: ONE card
 * carrying the "Today's Schedule & Tasks" title and, inside it, the
 * dashed well with the medallion, copy and the refresh pill (the pill
 * rides the screen's own refresh path). On populated days the title
 * renders standalone above the job sections — the card is the empty
 * day's render.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Plus, RefreshCw } from 'lucide-react-native';
import { EmptyState } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { TodayScheduleArt } from './TodayScheduleArt';

type Props = {
  onRefresh: () => void;
};

export function TodayEmptySchedule({ onRefresh }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{"Today's Schedule & Tasks"}</Text>
      <View style={styles.well}>
        <EmptyState
          icon={<TodayScheduleArt size={40} />}
          title="No job assigned yet"
          description="Your manager hasn't assigned any field visits or special tasks for today. Check back soon or refresh."
          // The 20-3 mockup's empty state: rounded-square medallion with
          // the + badge, and the sync pill on the screen's own refresh
          // path. Additive props only — every other screen's render is
          // untouched.
          medallionShape="square"
          badge={
            <View style={styles.badge}>
              <Plus size={14} color={colors.onPrimary} strokeWidth={2.6} />
            </View>
          }
          ctaShape="pill"
          ctaLabel="Tap to refresh"
          // The mockup's pill: full well width, dark brand ink icon — the
          // ghost variant's label ink, not blue.
          ctaStyle={{ alignSelf: 'stretch', marginHorizontal: spacing.s3 }}
          ctaIcon={<RefreshCw size={16} color={colors.textStrong} strokeWidth={2.2} />}
          onPressCta={onRefresh}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: spacing.s3,
  },
  title: {
    ...typography.title,
    fontSize: 17,
    color: colors.textStrong,
    marginBottom: spacing.s3,
  },
  well: {
    flex: 1,
    // Breathing room inside the dashed border — content must never touch it.
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
  },
  // The medallion's corner badge (20-3 mockup): blue disc with a
  // page-coloured ring so it reads as overlaid on the tinted chip.
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
