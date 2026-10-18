/**
 * HolidayRow — one holiday in the HolidaysScreen list (Story 15-6).
 *
 * Date-badge visual: a tinted tile, month abbreviation above the large day
 * number; the date line is the full "Monday, 19 October 2026". Past rows render at reduced opacity with a
 * "(past)" subtitle but stay tappable for edit (FR-20 — past dates can be
 * edited/removed).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { Card, IconButton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { Holiday } from '../../../services';
import { MONTH_ABBR, formatLongDate, parseYmd } from './holidayDates';

export type HolidayRowProps = {
  holiday: Holiday;
  /** Today as YYYY-MM-DD, used for past/upcoming styling. */
  today: string;
  onPress: () => void;
};

export default function HolidayRow({
  holiday,
  today,
  onPress,
}: HolidayRowProps) {
  const parts = parseYmd(holiday.date);
  const valid = parts !== null;
  const day = parts?.day ?? 0;
  const monthIdx = (parts?.month ?? 1) - 1;
  // A malformed date (contract break — the BE guarantees YYYY-MM-DD) must
  // not render a "NaN" badge or a nonsense month label. The row still
  // renders: the meta line below shows the raw string the server sent, so
  // the bad data is visible rather than blanked (15-6 review P18).
  const isPast = valid && holiday.date < today;
  const monthLabel = valid ? MONTH_ABBR[monthIdx] ?? '' : '';
  return (
    <Card padding="none" style={isPast ? styles.cardPast : undefined}>
      <View style={styles.wrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Holiday ${holiday.name}, ${formatLongDate(holiday.date)}${
            isPast ? ', past' : ''
          }`}
          onPress={onPress}
          style={({ pressed }) => [
            styles.row,
            styles.rowMain,
            pressed && styles.rowPressed,
          ]}>
          <View style={[styles.badge, isPast && styles.badgePast]}>
            <Text style={[styles.badgeMonth, isPast && styles.badgeMonthPast]}>
              {monthLabel}
            </Text>
            <Text style={[styles.badgeDay, isPast && styles.badgeDayPast]}>
              {valid ? day : '–'}
            </Text>
          </View>
          <View style={styles.texts}>
            <Text
              style={[styles.name, isPast && styles.namePast]}
              numberOfLines={1}>
              {holiday.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {isPast
                ? `${formatLongDate(holiday.date)} (past)`
                : formatLongDate(holiday.date)}
            </Text>
          </View>
        </Pressable>
        {/* The design's ⋮ — a holiday has no other actions than edit/delete,
          so it opens the same edit sheet (Delete lives there). */}
        <IconButton
          variant="ghost"
          size="sm"
          label={`Options for ${holiday.name}`}
          onPress={onPress}
          style={styles.more}>
          <MoreVertical size={18} color={colors.textMuted} strokeWidth={2} />
        </IconButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
  },
  more: {
    marginRight: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.md,
  },
  rowPressed: {
    opacity: 0.85,
  },
  badge: {
    width: 56,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePast: {
    borderColor: colors.surfaceSunken,
    backgroundColor: colors.surfaceSunken,
  },
  badgeDay: {
    ...typography.title,
    color: colors.primary,
  },
  badgeDayPast: {
    color: colors.textMuted,
  },
  badgeMonth: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.4,
  },
  badgeMonthPast: {
    color: colors.textMuted,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.heading,
    color: colors.textStrong,
  },
  namePast: {
    color: colors.textMuted,
  },
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  cardPast: {
    opacity: 0.6,
  },
});
