/**
 * EmployeeJobsStrip — the owner Home's summary of employee-created jobs
 * (Epic 22 step 7): the four headline counts for the last 30 IST days plus
 * the pending-approval size, from `GET /job-reports/owner`. Hidden entirely
 * while no employee has created a job in the window (and nothing waits) — a
 * row of zeros is noise on a tenant that hasn't started.
 *
 * Design (user's mock, 2026-11-13): "Jobs By Employees" header with a
 * "Last 30 days" window pill, a hairline divider, then four tinted tiles —
 * dot + label, the count, and a caption naming what the count is. The
 * "waiting" row below is the actionable part: it deep-links the Jobs tab's
 * Pending segment, where the approve/reject decision lives.
 */
import { StyleSheet, Text, Pressable, View } from 'react-native';
import { Card, Skeleton } from '../../../components/ui';
import { ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { OwnerReportSummary } from '../../../services';
import {
  ApprovedPattern,
  AutoPattern,
  CreatedPattern,
  OwnerPattern,
} from './TilePatterns';
import type { ReactNode } from 'react';

type TileSpec = {
  value: number;
  label: string;
  caption: string;
  /** Tile background + border from one status family; fg drives dot/caption. */
  bg: string;
  border: string;
  fg: string;
  /** Hand-drawn watermark (TilePatterns), anchored top-right. */
  pattern: ReactNode;
  /** Watermark drop from the tile's top edge — per-motif: a tall motif
   *  (the seal) sinks beside the value's whitespace so it never collides
   *  with the label band (Sally placement review 2026-11-13). */
  patternTop?: number;
};

function Tile({ value, label, caption, bg, border, fg, pattern, patternTop }: TileSpec) {
  return (
    <View
      style={[styles.tile, { backgroundColor: bg, borderColor: border }]}
      accessible
      accessibilityLabel={`${label}: ${value}, ${caption}`}>

      {/* The watermark lives behind the content; the content's own stacking
          order (later siblings) keeps the number on top. */}
      <View style={[styles.patternWrap, patternTop ? { top: patternTop } : null]} pointerEvents="none">
        {pattern}
      </View>
      <View style={styles.tileLabelRow}>
        <View style={[styles.dot, { backgroundColor: fg }]} />
        <Text style={[styles.tileLabel, { color: fg }]}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, value === 0 && styles.tileValueZero]}>
        {value}
      </Text>
      <Text style={[styles.tileCaption, { color: fg }]}>{caption}</Text>
    </View>
  );
}

type Props = {
  summary: OwnerReportSummary | null;
  /** True while the 30-day summary's first load is in flight — a skeleton
   *  row stands in (Home must never render "no strip" for "loading"). */
  isLoading?: boolean;
  /** The load's failure message: a compact retry row replaces a silently
   *  absent feature (review 2026-11-13 — an unreachable summary must be
   *  distinguishable from a tenant with no employee jobs). */
  error?: string | null;
  /** Reloads the summary (the retry row's only action). */
  onRetry?: () => void;
  /** Opens the Jobs tab's Pending segment (the approval queue). */
  onPressPending: () => void;
};

export function EmployeeJobsStrip({
  summary,
  isLoading,
  error,
  onRetry,
  onPressPending,
}: Props) {
  if (!summary) {
    // First load or a failed one: never a blank where a feature belongs.
    if (isLoading) {
      return (
        <Card padding="md" style={styles.card}>
          <Skeleton rows={2} height={40} />
        </Card>
      );
    }
    if (error && onRetry) {
      return (
        <Card padding="md" style={styles.card}>
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>Couldn't load the jobs summary.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading the jobs summary"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pendingPressed]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        </Card>
      );
    }
    return null;
  }

  const { headline, pending } = summary;
  const silent = headline.employeeCreated === 0 && pending === 0;
  if (silent) return null;

  const done = colors.status.done;
  const neutral = colors.status.neutral;
  const tiles: TileSpec[] = [
    {
      value: headline.employeeCreated,
      label: 'Created',
      caption: 'Total',
      bg: colors.primarySoft,
      border: colors.primarySoft,
      fg: colors.primary,
      pattern: <CreatedPattern color={colors.primary} />,
    },
    {
      value: headline.employeeApproved,
      label: 'Approved',
      caption: 'Active',
      bg: done.bg,
      border: done.border,
      fg: done.fg,
      pattern: <ApprovedPattern color={done.fg} />,
      // The seal sinks beside the value row: at top:0 its ring sat behind
      // the word "Approved" — the longest label of the four (Sally).
      patternTop: 14,
    },
    {
      value: headline.employeeAutoApproved,
      label: 'Auto',
      caption: 'Verified',
      bg: done.bg,
      border: done.border,
      fg: done.fg,
      pattern: <AutoPattern color={done.fg} />,
    },
    {
      value: headline.ownerCreated,
      label: 'By you',
      caption: 'Managed',
      bg: neutral.bg,
      border: neutral.border,
      fg: neutral.fg,
      pattern: <OwnerPattern color={neutral.fg} />,
      // Air under the top border for the handle arc (Sally).
      patternTop: 6,
    },
  ];

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>Jobs By Employees</Text>
        <View style={styles.rangePill}>
          <Text style={styles.rangeText}>Last 30 days</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.statRow}>
        {tiles.map(t => (
          <Tile key={t.label} {...t} />
        ))}
      </View>
      {pending > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pending} ${pending === 1 ? 'job' : 'jobs'} waiting for your approval`}
          onPress={onPressPending}
          style={({ pressed }) => [styles.pendingRow, pressed && styles.pendingPressed]}>
          <View style={styles.pendingChip}>
            <Text style={styles.pendingChipText}>{pending} waiting</Text>
          </View>
          <Text style={styles.pendingLabel}>Review now</Text>
          <ChevronRight size={16} color={colors.status.pendingApproval.fg} strokeWidth={2} />
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s3,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  rangePill: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  rangeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s1,
    paddingVertical: spacing.s3,
    overflow: 'hidden', // the watermark clips at the tile's rounded edge
  },
  patternWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  tileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  tileLabel: {
    ...typography.caption,
  },
  tileValue: {
    ...typography.title,
    color: colors.textStrong,
    fontVariant: ['tabular-nums'],
  },
  tileValueZero: {
    color: colors.textMuted,
  },
  tileCaption: {
    ...typography.caption,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.status.pendingApproval.bg,
    borderWidth: 1,
    borderColor: colors.status.pendingApproval.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  pendingPressed: {
    opacity: 0.85,
  },
  pendingChip: {
    // White pill on the amber row: amber-on-white carries the family pair's
    // contrast (amber700 fg); 11px white-on-solid-amber was ~3:1, below AA
    // for text this small.
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.pill,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  pendingChipText: {
    ...typography.captionStrong,
    color: colors.status.pendingApproval.fg,
    fontVariant: ['tabular-nums'],
  },
  pendingLabel: {
    ...typography.bodyStrong,
    color: colors.status.pendingApproval.fg,
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  retryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.s3,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});
