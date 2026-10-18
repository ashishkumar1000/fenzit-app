/**
 * HolidayHeroCard — the "Next upcoming holiday" card at the top of the
 * Holidays list: a gradient surface with the holiday's name, its full date
 * and how far away it is, and a translucent month/day badge. Shows only
 * what a holiday really has (name and date) — no type or office scope.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { GradientSurface } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { Holiday } from '../../../services';
import { MONTH_ABBR, daysUntilLabel, formatLongDate, parseYmd } from './holidayDates';

type Props = {
  holiday: Holiday;
  /** Today as YYYY-MM-DD. */
  today: string;
};

export default function HolidayHeroCard({ holiday, today }: Props) {
  const parts = parseYmd(holiday.date);
  const away = daysUntilLabel(today, holiday.date);
  return (
    <GradientSurface style={styles.card} pattern="festive">
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`Next upcoming holiday: ${holiday.name}, ${formatLongDate(holiday.date)}${away ? `, ${away.toLowerCase()}` : ''}`}>
        <View style={styles.texts}>
          <View style={styles.pill}>
            <Star size={12} color={colors.warning} fill={colors.warning} strokeWidth={2} />
            <Text style={styles.pillText}>Next upcoming holiday</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {holiday.name}
          </Text>
          <Text style={styles.date}>
            {formatLongDate(holiday.date)}
            {away ? <Text style={styles.away}>{`  •  ${away}`}</Text> : null}
          </Text>
        </View>
        {parts ? (
          <View style={styles.badge}>
            <Text style={styles.badgeMonth}>{MONTH_ABBR[parts.month - 1]}</Text>
            <Text style={styles.badgeDay}>{parts.day}</Text>
          </View>
        ) : null}
      </View>
    </GradientSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.s4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  texts: {
    flex: 1,
    gap: spacing.s2,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimarySoft,
  },
  pillText: {
    ...typography.caption,
    color: colors.onPrimary,
  },
  name: {
    ...typography.title,
    color: colors.onPrimary,
  },
  date: {
    ...typography.bodySm,
    color: colors.onPrimaryFaint,
  },
  away: {
    ...typography.labelStrong,
    color: colors.onPrimary,
  },
  badge: {
    width: 64,
    paddingVertical: spacing.s2,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.onPrimarySoft,
    backgroundColor: colors.onPrimarySoft,
  },
  badgeMonth: {
    ...typography.eyebrow,
    color: colors.onPrimaryFaint,
  },
  badgeDay: {
    ...typography.title,
    color: colors.onPrimary,
  },
});
