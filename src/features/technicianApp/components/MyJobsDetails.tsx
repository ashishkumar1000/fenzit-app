/**
 * MyJobsDetails — the body of the "My jobs" screen (2026-11-13: the summary
 * moved off the Profile tab into its own screen; this is what the entry
 * card opens). Everything the old expanded card showed: the 7/30 window
 * control, the 3+2 outcome tiles, the approval-rate and average-wait rows,
 * the Assigned/Completed lanes and the rejection reasons.
 *
 * Self-contained like the card was: it calls `useMyJobReport` itself, so
 * the screen just drops it in. The tile tap-throughs live one navigator up
 * from the Profile tab now — a root-stack screen can't `navigate('History')`
 * directly (nested-navigation delegation, 15-10), so they route through
 * `TechnicianTabs`.
 */
import { useCallback } from 'react';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TechnicianRootStackParamList } from '../../../navigation/types';
import { InlineError, SegmentedControl, Skeleton } from '../../../components/ui';
import { ChevronRightIcon } from '../../jobs/icons';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import { formatIstDateLabel } from '../../../utils/istDate';
import type { MyJobReportState, ReportRangeDays } from '../useMyJobReport';

// SegmentedControl is string-valued (it's a React key / selection identity);
// the hook holds the numeric day count, so the chip value converts at this
// one boundary.
const RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const;

/** How many rejection rows show before the "+ N more" line. */
const REJECTION_PREVIEW = 3;

/** 0–1 rate → "75%"; null (nothing decided yet) → an em dash. */
function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/**
 * The rate row's companion dot — a glance signal, not a verdict: green for a
 * rate of 90% or better, amber from 50, red below, and no dot at all while
 * nothing has been decided (null). The number itself stays the source of
 * truth; the dot only speeds the read.
 */
function rateDotColor(rate: number | null): string | null {
  if (rate === null) return null;
  if (rate >= 0.9) return colors.status.done.solid;
  // The middle band is NEUTRAL: amber is this app's "waiting" colour and a
  // middling approval rate is not a wait. Only a poor rate earns red.
  if (rate >= 0.5) return colors.textDisabled;
  return colors.status.rejected.solid;
}

/** Minutes → "45m" / "2h 10m" / "1d 4h"; null (no decisions yet) → em dash.
 *  Rounds BEFORE splitting, so 59.7 minutes reads "1h 0m", never "60m". */
function formatWait(minutes: number | null): string {
  if (minutes === null) return '—';
  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** One stat tile: colored dot + label above the number; zeros read muted. */
function Tile({
  value,
  label,
  dotColor,
  accent,
  onPress,
  accessibilityHint,
}: {
  value: number;
  label: string;
  dotColor: string;
  accent?: boolean;
  /** Present only where a real list exists (Pending / Rejected, CAP-9) —
   *  the other tiles stay plain Views. */
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  // Tappable tiles carry a small chevron — the screen's only exits must
  // look like exits (the three plain tiles stay chevronless on purpose).
  const body = (
    <>
      <View style={styles.tileLabelRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.tileLabel, accent ? styles.tileLabelAccent : null]}>
          {label}
        </Text>
        {onPress ? (
          <ChevronRightIcon
            size={14}
            color={colors.textMuted}
            strokeWidth={2}
          />
        ) : null}
      </View>
      <Text style={[styles.tileValue, value === 0 ? styles.tileValueZero : null]}>
        {value}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.tile, accent ? styles.tileAccent : null]}>{body}</View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        accent ? styles.tileAccent : null,
        pressed && styles.tilePressed,
      ]}>
      {body}
    </Pressable>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <View style={styles.divider} />
      {/* A blank label means the child owns the row (the two-lane stats) —
          no label Text, so space-between can't push it right. */}
      <View style={styles.metaRow}>
        {label ? <Text style={styles.metaLabel}>{label}</Text> : null}
        {children}
      </View>
    </>
  );
}

export default function MyJobsDetails({ state }: { state: MyJobReportState }) {
  // The hook lives in the screen (its pull-to-refresh drives it there);
  // this body stays the pure renderer of the report state.
  const { report, rangeDays, isLoading, error, setRangeDays, refresh } = state;

  // CAP-9's "link to each list" — the tiles' tap-through. This screen sits
  // on the ROOT stack (it covers the tab bar), so tab routes are reached
  // through the delegation form (15-10) — and with PUSH, not navigate:
  // `navigate` finds `TechnicianTabs` already in the stack and pops this
  // screen to reach it, so hardware back landed on Home instead of back
  // here (user report 2026-11-13). A push layers a second tabs instance;
  // the shared stores keep the data, and back returns to the record.
  const navigation = useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>();
  const openPending = useCallback(
    () =>
      navigation.dispatch(
        StackActions.push('TechnicianTabs', {
          screen: 'History',
          params: { scope: 'pending' },
          initialTab: 'History',
        }),
      ),
    [navigation],
  );
  const openRejected = useCallback(
    () =>
      navigation.dispatch(
        StackActions.push('TechnicianTabs', {
          screen: 'History',
          params: { scope: 'history', filter: 'rejected' },
          initialTab: 'History',
        }),
      ),
    [navigation],
  );
  const openToday = useCallback(
    () =>
      navigation.dispatch(StackActions.push('TechnicianTabs', { screen: 'Today', initialTab: 'Today' })),
    [navigation],
  );

  // Approved and Auto-approved render SEPARATELY (user decision 2026-11-13,
  // CAP-9's "counts match the web"): the approval rate is computed over
  // manual approvals only, so a merged tile could never agree with it.
  // Tappable tiles: Pending → the Jobs tab's Pending list; Rejected →
  // History with the Rejected chip; the Assigned lane → Today. Created and
  // the two approved kinds have no single list (their jobs scatter across
  // Today/Upcoming/History by slot), so they stay plain — the honest links
  // only, per CAP-9's "link to each list".

  const reasons = report?.rejectionReasons.slice(0, REJECTION_PREVIEW) ?? [];
  const moreRejections = report
    ? report.rejectionReasonsTotal - reasons.length
    : 0;

  return (
    <View style={styles.card}>
      {/* The 7/30 window control, right-aligned above the numbers — with
          its one-line context ("Last"), since the old card's title no
          longer carries it. */}
      <View style={styles.rangeRow}>
        <Text style={styles.rangeLabel}>Last</Text>
        <View style={styles.rangeWrap}>
          <SegmentedControl
            options={RANGE_OPTIONS}
            value={String(rangeDays)}
            onChange={next => setRangeDays(Number(next) as ReportRangeDays)}
          />
        </View>
      </View>

      {error ? (
        <View style={styles.errorWrap}>
          <InlineError message={error} />
          {/* Retry is a plain pressable — a Button would overweight a card
              row. Same contract as every retry text in the app. */}
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            style={styles.retry}>
            <Text style={styles.moreText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.body}>
          <Skeleton rows={6} />
        </View>
      ) : report ? (
        // A loaded report survives a failed refresh behind the error banner
        // (the jobs screens' rule): the numbers were real when loaded —
        // blanking them would punish a flaky refresh (review 2026-11-13).
        // The error block above already renders the banner + Retry.
        <View style={styles.body}>
          {/* 3+2 grid, not five across: "Auto-approved" needs ~80px and a
              fifth of a card row gives it less — five equal slots truncate
              the headline labels on every normal phone. */}
          <View style={styles.tileGrid}>
            <View style={styles.tileRow}>
              <Tile value={report.created.created} label="Created" dotColor={colors.primary} />
              <Tile value={report.created.approved} label="Approved" dotColor={colors.status.done.solid} accent />
              <Tile
                value={report.created.autoApproved}
                label="Auto-approved"
                dotColor={colors.status.done.solid}
              />
            </View>
            <View style={styles.tileRow}>
              <Tile
                value={report.created.pending}
                label="Pending"
                dotColor={colors.status.pendingApproval.solid}
                onPress={openPending}
                accessibilityHint="Opens the Jobs tab's Pending list"
              />
              <Tile
                value={report.created.rejected}
                label="Rejected"
                dotColor={colors.status.rejected.solid}
                onPress={openRejected}
                accessibilityHint="Opens your Jobs history's Rejected filter"
              />
              {/* Slot 3 stays empty: row 2 keeps the 3-column rhythm of row
                  1 instead of growing into half-card slabs. */}
              <View style={styles.tileSpacer} />
            </View>
          </View>

          {/* These numbers count the CHOSEN window; the lists a tile opens
              are not windowed (the Jobs tab's Pending list is everything
              waiting, History is all time). Saying so once stops the
              "4 rejected here, 4 in the list (or 9)" mismatch reading as a
              bug (review 2026-11-13). */}
          <Text style={styles.windowNote}>
            Counts cover the last {rangeDays} days.
          </Text>

          <MetaRow label="Approval rate">
            <View style={styles.rateValueRow}>
              <Text style={styles.metaValue}>{formatRate(report.approvalRate)}</Text>
              {(() => {
                const dot = rateDotColor(report.approvalRate);
                return dot ? (
                  <View style={[styles.rateDot, { backgroundColor: dot }]} />
                ) : null;
              })()}
            </View>
          </MetaRow>
          <MetaRow label="Avg wait for a decision">
            <Text style={styles.metaValue}>
              {formatWait(report.averageMinutesToDecision)}
            </Text>
          </MetaRow>
          {/* The two-lane row: what's on my plate now, and what I finished in
              the window — each with its own badge, split by a hairline. The
              Assigned lane deep-links Today (that's where the active jobs
              live); Completed spans scopes, so it stays plain. */}
          <MetaRow label="">
            <View style={styles.lanesRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Assigned now"
                accessibilityHint="Opens your Jobs tab's Today list"
                onPress={openToday}
                style={styles.lane}>
                <Text style={styles.laneLabel}>Assigned</Text>
                <View style={styles.valuePill}>
                  <Text style={styles.valuePillText}>
                    Active {report.assignedNow}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.laneDivider} />
              <View style={styles.lane}>
                <Text style={styles.laneLabel}>Completed</Text>
                {/* Zero completions wear the neutral pill, not green — the
                    tiles' own "zeros read muted" rule, one section down. */}
                {report.completedInRange === 0 ? (
                  <View style={styles.valuePill}>
                    <Text style={styles.valuePillText}>
                      Done {report.completedInRange}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.donePill}>
                    <Text style={styles.donePillText}>
                      Done {report.completedInRange}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </MetaRow>

          {reasons.length > 0 ? (
            <>
              <MetaRow label="Rejection reasons">
                <View />
              </MetaRow>
              {reasons.map(r => (
                <View key={r.jobId} style={styles.reasonRow}>
                  <Text style={styles.reasonJob}>{r.jobNumber}</Text>
                  <Text style={styles.reasonText} numberOfLines={2}>
                    {r.reason ?? 'No reason given'}
                  </Text>
                  <Text style={styles.reasonDate}>
                    {formatIstDateLabel(r.decidedAt)}
                  </Text>
                </View>
              ))}
              {moreRejections > 0 ? (
                // Link-blue text earns a real destination: the Rejected
                // filter in the Jobs history is exactly that list.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`See all ${moreRejections} rejected jobs`}
                  onPress={openRejected}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.moreWrap}>
                  {/* paddingVertical brings the target to 44px; the caption
                      alone sits at ~32px even with slop. */}
                  <Text style={styles.moreText}>
                    + {moreRejections} more in your Jobs history
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    padding: spacing.s4,
    ...shadow.sm,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  rangeLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // Content-sized with a floor — a fixed width truncates "30 days" under
  // large font scaling.
  rangeWrap: {
    alignSelf: 'flex-start',
    minWidth: 172,
  },
  errorWrap: {
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s2,
  },
  moreWrap: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  body: {
    gap: spacing.s3,
  },
  tileGrid: {
    gap: spacing.s2,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  windowNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  tileSpacer: {
    flex: 1,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s2,
    alignItems: 'center',
    gap: spacing.s1,
  },
  tileAccent: {
    backgroundColor: colors.status.done.bg,
    borderColor: colors.status.done.border,
  },
  tilePressed: {
    opacity: 0.85,
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
    color: colors.textMuted,
  },
  tileLabelAccent: {
    ...typography.captionStrong,
    color: colors.status.done.fg,
  },
  tileValue: {
    ...typography.title,
    fontSize: 22,
    color: colors.textStrong,
  },
  tileValueZero: {
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  rateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  rateDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  lanesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  lane: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  laneLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  laneDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderSubtle,
  },
  metaValue: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    fontVariant: ['tabular-nums'],
  },
  valuePill: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  valuePillText: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    fontVariant: ['tabular-nums'],
  },
  donePill: {
    backgroundColor: colors.status.done.bg,
    borderWidth: 1,
    borderColor: colors.status.done.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  donePillText: {
    ...typography.bodyStrong,
    color: colors.status.done.fg,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s2,
  },
  reasonJob: {
    ...typography.captionStrong,
    color: colors.textStrong,
  },
  reasonText: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
    flexGrow: 1,
  },
  reasonDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  moreText: {
    ...typography.caption,
    color: colors.primary,
  },
});
