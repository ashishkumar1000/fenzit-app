/**
 * WeeklyOffOverrideRow — one employee who has their own weekly off, shown as
 * its own flat card in `WeeklyOffOverridesSection` (Story 15-6, FR-19).
 *
 * Avatar initial, name, the days off in plain words as a chip ("Sat off")
 * with the working-day count beside it, and an Edit button. A scheduled
 * future edit (`next`) shows as one extra line in the same plain words —
 * otherwise a rescheduled row would look like it is lying about the days
 * (15-6 review P12).
 *
 * Presentational only. Split out to keep the section file under the ~300
 * line limit.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { WeeklyOffOverrideResponse } from '../../../services';
import { describeDaysOff, formatLongDate, viewDays } from './weeklyOffModel';

export type WeeklyOffOverrideRowProps = {
  override: WeeklyOffOverrideResponse;
  onPress: () => void;
};

export function WeeklyOffOverrideRow({
  override,
  onPress,
}: WeeklyOffOverrideRowProps) {
  const offDays = viewDays(override.current);
  const workingDays = 7 - offDays.length;
  const next = override.next;
  return (
    <Card padding="none" elevated={false}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {(override.employeeName || '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={2}>{override.employeeName}</Text>
          <View style={styles.metaLine}>
            <View style={styles.dayTag}>
              <Text style={styles.dayTagText}>{describeDaysOff(offDays)}</Text>
            </View>
            <Text style={styles.meta}>{`${workingDays} working ${workingDays === 1 ? 'day' : 'days'}`}</Text>
          </View>
          {next ? (
            <Text style={styles.next}>
              {`From ${formatLongDate(next.validFrom)}: ${describeDaysOff(next.days)}`}
            </Text>
          ) : null}
        </View>
        <Button variant="secondary" size="sm" onPress={onPress}>
          Edit
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...typography.heading,
    color: colors.primary,
  },
  texts: {
    flex: 1,
    gap: spacing.s1,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  dayTag: {
    paddingVertical: 2,
    paddingHorizontal: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.borderSubtle,
  },
  dayTagText: {
    ...typography.label,
    color: colors.textStrong,
  },
  meta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  next: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});
