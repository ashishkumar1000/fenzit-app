/**
 * TodayEmptySchedule — the mockup's empty-day schedule card, in TWO
 * variants (owner call 2026-11-10):
 *
 *  • compact (attendance ENABLED) — the reference mockup: the title row
 *    with its blue dot, a divider, then ONE row — the hand-drawn
 *    clipboard medallion, "No jobs assigned yet / No visits scheduled
 *    today", and the Refresh pill. Content-sized: the punch zone owns
 *    this technician's attention, the empty day shouldn't shout.
 *  • big (attendance DISABLED) — the original tall card: the dashed
 *    well with the medallion, copy and the refresh pill (the pill rides
 *    the screen's own refresh path). The schedule is this employee's
 *    whole day, so the empty state keeps its presence.
 *
 * On populated days the title renders standalone above the job sections
 * — the card is the empty day's render.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus, RefreshCw } from 'lucide-react-native';
import { EmptyState } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { TodayClipboardArt } from './TodayClipboardArt';
import { TodayScheduleArt } from './TodayScheduleArt';

type Props = {
  onRefresh: () => void;
  /** Attendance-enabled posture: the compact one-row card. */
  compact?: boolean;
};

export function TodayEmptySchedule({ onRefresh, compact = false }: Props) {
  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactHeader}>
          <View style={styles.headerDot} />
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {"Today's Schedule & Tasks"}
          </Text>
        </View>
        <View style={styles.compactDivider} />
        <View style={styles.compactRow}>
          <View style={styles.medallion}>
            <TodayClipboardArt size={26} />
          </View>
          <View style={styles.compactCopy}>
            <Text style={styles.compactTitle} maxFontSizeMultiplier={1.4}>
              No jobs assigned yet
            </Text>
            <Text style={styles.compactSubtitle} maxFontSizeMultiplier={1.6}>
              No visits scheduled today
            </Text>
          </View>
          {/* The mockup's refresh chip: a quiet grey rounded rect — the DS
              Button can't draw it (its "pill" is the 5pt badges token, and
              secondary is white with a shadow), so it is a local pressable
              with the full button accessibility set. */}
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh schedule"
            style={({ pressed }) => [styles.refreshPill, pressed && styles.refreshPillPressed]}>
            <RefreshCw size={16} color={colors.textStrong} strokeWidth={2.2} />
            <Text style={styles.refreshLabel} maxFontSizeMultiplier={1.4}>
              Refresh
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={[styles.title, styles.bigTitleGap]}>{"Today's Schedule & Tasks"}</Text>
      <View style={styles.well}>
        <EmptyState
          icon={<TodayScheduleArt size={40} />}
          title="No jobs assigned yet"
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
  },
  // The big variant's gap between the title and the dashed well (the
  // compact header separates its title with the divider instead).
  bigTitleGap: {
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
  // ---- Compact variant (attendance enabled) ----
  compactCard: {
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s4,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    padding: spacing.s4,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  headerDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.primary,
  },
  compactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.s3,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  // 48, not the mockup's larger chip: with the 44pt Refresh pill beside
  // it, the copy column needs the width to keep the subtitle on one line.
  medallion: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCopy: {
    flex: 1,
    gap: 2,
  },
  compactTitle: {
    ...typography.title,
    fontSize: 16,
    color: colors.textStrong,
  },
  compactSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    height: 44,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfacePage,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  refreshPillPressed: {
    opacity: 0.7,
  },
  refreshLabel: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
});
