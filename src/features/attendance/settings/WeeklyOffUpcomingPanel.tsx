/**
 * WeeklyOffUpcomingPanel — the "Upcoming changes" panel of the tenant-default
 * block (Story 15-6): the future-effective rows from the BE's `history`
 * (sorted ascending by the BE). One row per scheduled edit, so the owner can
 * see what is queued. Each row shows the date, an EVERYONE tag (this rule is
 * for everyone, unlike an employee-wise one) and the new days off, followed
 * by the days off that apply until then — plain words, no jargon.
 *
 * Presentational only. Split out of `WeeklyOffDefaultSection.tsx` to keep
 * that file under the ~300-line limit.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Eyebrow } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { IsoWeekday, WeeklyOffView } from '../../../services';
import { describeDaysOff, formatLongDate } from './weeklyOffModel';

export type WeeklyOffUpcomingPanelProps = {
  rows: WeeklyOffView[];
  /** The schedule in force today — the "till then" side of the FIRST row; later rows follow the row before them. */
  currentDays: IsoWeekday[];
};

export function WeeklyOffUpcomingPanel({
  rows,
  currentDays,
}: WeeklyOffUpcomingPanelProps) {
  // Nothing queued: no panel (never a "0 changes coming up" header).
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Eyebrow>Upcoming changes</Eyebrow>
        <View style={styles.pendingPill}>
          <Text style={styles.pendingText}>
            {rows.length === 1
              ? '1 change coming up'
              : `${rows.length} changes coming up`}
          </Text>
        </View>
      </View>
      {rows.map((row, index) => (
        // `validFrom` alone is not a guaranteed-unique key (15-6 review
        // P16): the AD-8 exclusion constraint stops ranges OVERLAPPING, but
        // a malformed/duplicated payload would still render, and React
        // would drop the duplicate row silently. The index disambiguates
        // for this static, BE-ordered list.
        <View
          key={`${row.validFrom}-${(row.days ?? []).join(',')}-${index}`}
          style={styles.row}>
          <View style={styles.texts}>
            <View style={styles.titleLine}>
              <Text style={styles.date}>{formatLongDate(row.validFrom)}</Text>
              <View style={styles.globalTag}>
                <Text style={styles.globalTagText}>EVERYONE</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {`${describeDaysOff(row.days)} from this date. Till then: ${describeDaysOff(
                index === 0 ? currentDays : rows[index - 1].days,
              )}.`}
            </Text>
          </View>
          <View style={styles.clockTile}>
            <Clock size={18} color={colors.primary} strokeWidth={2} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.s2,
    marginTop: spacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Large system fonts: the badge drops to its own line, not off-screen.
    flexWrap: 'wrap',
    gap: spacing.s1,
  },
  pendingPill: {
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  pendingText: {
    ...typography.label,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    // A coming change, not a person: the blue strip on the left edge keeps
    // these cards from blending with the employee cards below.
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  date: {
    ...typography.label,
    color: colors.textStrong,
  },
  globalTag: {
    paddingVertical: 2,
    paddingHorizontal: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.borderSubtle,
  },
  globalTagText: {
    ...typography.labelStrong,
    color: colors.textMuted,
  },
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  clockTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
