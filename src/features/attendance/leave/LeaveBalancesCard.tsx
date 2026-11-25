/**
 * LeaveBalancesCard — the per-type leave balances card (story 23-14).
 * One row per accrual-bearing type: name, the remaining figure ("2.5
 * days left"; "Overdrawn by 0.5 days" — the derived balance is NOT
 * clamped, an allow-over type can answer negative), the
 * accrued·used(·carried-forward) caption, and a muted "Not available"
 * treatment for DISABLED types (their consumed days still count, so the
 * BE includes them — the remaining is history, not usable).
 *
 * Comp-Off never appears here (the BE excludes mode-none types; the
 * picker renders its "owner approves" shape instead).
 *
 * Presentational only — every fetch lives in the host (the apply hooks,
 * the owner sheet's host). Loading renders skeleton rows, failure a
 * non-blocking notice (the form stays usable — balances are context,
 * not a gate), and an empty list omits the card entirely (the caller
 * decides via `balances.length === 0 && !loading && !error`).
 */
import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Badge, InlineNotice, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeaveBalanceView } from '../../../services';
import { balanceCaption, balanceRemainingCopy } from '../../payslips/payslipModel';

type Props = {
  balances: LeaveBalanceView[];
  loading: boolean;
  error: string | null;
  /** Dim-and-highlight the picked type's row (the apply form wires this
   *  to the Leave type picker's selection). */
  highlightTypeId?: string | null;
  /** The detail-sheet's compact mode: name + remaining only. */
  compact?: boolean;
  /** Title override — the owner's detail sheet names the employee the
   *  balances belong to (the admin is reading someone else's numbers;
   *  "Your" misattributed them, the review P2). Defaults to "Your". */
  title?: string;
};

export function LeaveBalancesCard({
  balances,
  loading,
  error,
  highlightTypeId = null,
  compact = false,
  title = 'Your leave balances',
}: Props) {
  if (loading) {
    return (
      <CardShell title={title}>
        <Skeleton rows={2} height={44} />
      </CardShell>
    );
  }
  if (error) {
    return (
      <CardShell title={title}>
        <InlineNotice message={error} tone="neutral" />
      </CardShell>
    );
  }
  if (balances.length === 0) {
    return null; // nothing accrual-bearing configured — omit, don't tease
  }
  return (
    <CardShell title={title}>
      {balances.map(balance => {
        const muted = !balance.enabled;
        const highlighted = highlightTypeId === balance.typeId && !muted;
        return (
          <View
            key={balance.typeId}
            style={[
              styles.row,
              highlighted ? styles.rowHighlighted : null,
              compact ? styles.rowCompact : null,
            ]}>
            <View style={[styles.nameWrap, compact ? styles.nameWrapCompact : null]}>
              <Text
                style={[styles.name, muted ? styles.nameMuted : null]}
                numberOfLines={1}>
                {balance.name}
              </Text>
              {muted ? (
                <Badge status="neutral" size="sm">
                  Not available
                </Badge>
              ) : null}
            </View>
            {/* A disabled type's remaining is history, not usable balance —
                printing "Not available" beside "9 days left" cancelled
                itself out (the review P3). The badge alone carries it. */}
            {!muted ? (
              <Text
                style={[
                  styles.remaining,
                  balance.remaining < 0 ? styles.remainingOverdrawn : null,
                ]}>
                {balanceRemainingCopy(balance.remaining)}
              </Text>
            ) : null}
            {!compact && !muted ? (
              <Text style={styles.caption}>
                {balanceCaption(balance.accrued, balance.consumed, balance.carryForward)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </CardShell>
  );
}

/** The card's outer shell — a soft card with the section title. */
function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.s3,
    gap: spacing.s2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  row: {
    borderRadius: radius.sm,
    padding: spacing.s2,
    marginHorizontal: -spacing.s2,
    gap: 2,
  },
  rowHighlighted: {
    backgroundColor: colors.primarySoft,
  },
  rowCompact: {
    // The apply-form compaction: ONE line per type (name left, remaining
    // right) — the stacked caption is dropped with `compact`.
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s1 + 2,
    paddingHorizontal: spacing.s2,
  },
  nameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  nameWrapCompact: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textBody,
    flexShrink: 1,
  },
  nameMuted: {
    color: colors.textMuted,
  },
  remaining: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  remainingMuted: {
    color: colors.textMuted,
  },
  remainingOverdrawn: {
    color: colors.status.cancelled.fg,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
