/**
 * LiveTeamPulse — the Today pane's per-employee day list (2026-10 owner
 * request): who is on leave, who checked in (and when), who is late — the
 * tiles' counts, broken out per person. Rows come from the dashboard
 * envelope's `employees` feed (anomalies-first order set by the BE) and
 * each row opens that employee's month view. EVERY member shows — the
 * owner asked for the full list ("Showing all N").
 *
 * Status chips ride the app's own families: leave blue, success green,
 * danger red, warning amber, neutral grey — one vocabulary.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../../../components/ui';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import type { DashboardEmployeeStat } from '../../../services';

/** The chip's tint family per status — [bg, fg, dot]. */
const CHIP_TINTS: Record<
  DashboardEmployeeStat['status'],
  [string, string, string]
> = {
  on_leave: [palette.blue50, palette.blue700, palette.blue500],
  checked_in: [palette.green50, palette.green700, palette.green500],
  late: [palette.red50, palette.red700, palette.red600],
  short_day: [palette.amber50, palette.amber700, palette.amber500],
  not_checked_in: [palette.gray100, palette.gray600, palette.gray400],
};

const CHIP_LABELS: Record<DashboardEmployeeStat['status'], string> = {
  on_leave: 'On leave',
  checked_in: 'Checked in',
  late: 'Late',
  short_day: 'Short day',
  not_checked_in: 'Not checked in',
};

/** The chip's label — a late row folds its minutes in ("Late · 20m"),
 *  so the anomaly and its size read in one tag (owner ruling 2026-10-24). */
function chipLabel(row: DashboardEmployeeStat): string {
  if (row.status === 'late' && row.lateMinutes != null) {
    return `Late · ${row.lateMinutes}m`;
  }
  return CHIP_LABELS[row.status];
}

/** The ISO instant as the owner reads it on their phone. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** 170 -> "2h 50m"; 65 -> "1h 5m". */
function humanDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The row's detail line — the fact each status can back with the data
 *  the BE now carries (how late, how long worked, when they left, which
 *  half of the day the leave covers). */
function detailFor(row: DashboardEmployeeStat): string | null {
  const out = row.checkoutAt !== null ? `out ${formatTime(row.checkoutAt)}` : null;
  switch (row.status) {
    case 'late':
      return out;
    case 'checked_in':
      if (row.checkoutAt === null) {
        return row.checkInAt !== null ? `Since ${formatTime(row.checkInAt)}` : null;
      }
      return [
        row.workedMinutes != null ? humanDuration(row.workedMinutes) : null,
        out,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'short_day':
      return row.workedMinutes != null
        ? `Worked ${humanDuration(row.workedMinutes)}`
        : null;
    case 'on_leave':
      return row.leavePart === 'first_half'
        ? 'First half'
        : row.leavePart === 'second_half'
          ? 'Second half'
          : 'Full day';
    default:
      return null;
  }
}

type Props = {
  employees: DashboardEmployeeStat[];
  onOpenEmployee: (row: DashboardEmployeeStat) => void;
};

export function LiveTeamPulse({ employees, onOpenEmployee }: Props) {
  // Every member shows — the owner asked for the full list, anomalies
  // first (the BE's order).
  return (
    <Card padding="md">
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.title}>Live Team Pulse</Text>
        </View>
        <Text style={styles.showing}>{`Showing all ${employees.length}`}</Text>
      </View>

      {employees.map((row) => {
        const [bg, fg, dot] = CHIP_TINTS[row.status];
        const detail =
          row.checkInAt !== null ? formatTime(row.checkInAt) : null;
        // The phone is the row's identity when names collide (owner ask) —
        // screen readers get it too.
        const a11yName = row.phone
          ? `${row.employeeName} (${row.phone})`
          : row.employeeName;
        return (
          <Card
            key={row.employeeId}
            padding="md"
            elevated={false}
            interactive
            onPress={() => onOpenEmployee(row)}
            accessibilityRole="button"
            accessibilityLabel={`${a11yName}, ${CHIP_LABELS[row.status]}${detail ? `, ${detail}` : ''}. Tap for the month view.`}
            style={styles.rowCard}>
            <View style={styles.row}>
              <Avatar name={row.employeeName} size="lg" />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {row.employeeName}
                </Text>
                <View style={styles.officeLine}>
                  {row.officeName ? (
                    <Text style={styles.rowOffice} numberOfLines={1}>
                      {row.officeName}
                    </Text>
                  ) : null}
                  {row.phone ? (
                    <View style={styles.phoneTag}>
                      <Text style={styles.phoneTagText} numberOfLines={1}>
                        {row.phone}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.rowStatus}>
                <View style={[styles.chip, { backgroundColor: bg }]}>
                  <View style={[styles.chipDot, { backgroundColor: dot }]} />
                  <Text style={[styles.chipText, { color: fg }]}>
                    {chipLabel(row)}
                  </Text>
                </View>
                {detailFor(row) ? (
                  <View
                    style={[
                      styles.detailTag,
                      row.status === 'late' && styles.detailTagWarn,
                    ]}>
                    <Text
                      style={[
                        styles.detailTagText,
                        row.status === 'late' && styles.detailTagTextWarn,
                      ]}>
                      {detailFor(row)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}

    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  showing: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rowCard: {
    marginBottom: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  officeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  rowOffice: {
    ...typography.bodySm,
    color: colors.textMuted,
    flexShrink: 1,
  },
  phoneTag: {
    backgroundColor: palette.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 1,
  },
  phoneTagText: {
    ...typography.caption,
    color: palette.gray600,
  },
  detailTag: {
    alignSelf: 'flex-end',
    backgroundColor: palette.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  detailTagWarn: {
    backgroundColor: colors.status.warning.bg,
  },
  detailTagText: {
    ...typography.caption,
    color: palette.gray600,
  },
  detailTagTextWarn: {
    color: palette.amber700,
  },
  rowStatus: {
    alignItems: 'flex-end',
    gap: spacing.s1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  chipText: {
    ...typography.labelStrong,
    fontSize: 11,
  },
  detail: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
