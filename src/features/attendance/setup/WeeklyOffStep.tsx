/**
 * WeeklyOffStep — wizard step 3 (Story 15-8). Shows the SAVED canonical
 * tenant default (the GET result — the Sunday preselection on the weekly
 * off screen is visual-only and never counts); "Set weekly off" pushes
 * `AttendanceWeeklyOff` where the save lives. Step 3 is NOT skippable:
 * the footer's Continue gate requires the R-11 `configured` flag (a saved
 * decision — see `wizardModel`). When the saved rule is future-dated the
 * card shows `pendingNext` instead of "Not set yet", so an enabled
 * Continue never sits under a self-contradicting summary.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { Button, Card, Eyebrow, InlineError, Skeleton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ApiError, IsoWeekday, WeeklyOffView } from '../../../services';
import { formatLongDate } from '../../../utils';
import { describeDays, describeDaysOff } from '../settings/weeklyOffModel';

type Props = {
  /** The saved default's days, or null when no rule is in force today
   *  (never configured, explicitly cleared, or the rule starts later). */
  defaultDays: IsoWeekday[] | null;
  /** R-11's `configured` — a saved decision exists even when nothing is in
   *  force today, so a cleared rule reads "All days working", not "Not set
   *  yet" under an enabled Continue. */
  configured: boolean;
  /** Future edits, ascending — the queued chain behind the live rule. The
   *  card lists the first MAX_SHOWN_HOPS; the editor's Upcoming panel owns
   *  the full queue. */
  pendingHops: WeeklyOffView[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onManageWeeklyOff: () => void;
};

/** Hops listed in the queued-change note before it defers to the editor. */
const MAX_SHOWN_HOPS = 3;

export function WeeklyOffStep({
  defaultDays,
  configured,
  pendingHops,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  onManageWeeklyOff,
}: Props) {
  const pendingNext = pendingHops[0] ?? null;
  // Hops the note lists: all of them behind a live rule; behind a
  // future-first rule the "Starts …" helper already covers hop 1.
  const noteHops = defaultDays !== null ? pendingHops : pendingHops.slice(1);
  if (isLoading && !hasLoaded) {
    // First load: a card-shaped shimmer, labelled (the 19-5 idiom).
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading attendance">
        <Skeleton rows={2} height={64} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load your weekly off. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Card padding="md">
        <Eyebrow>Default weekly off</Eyebrow>
        <Text style={styles.days}>
          {defaultDays !== null
            ? describeDays(defaultDays)
            : pendingNext !== null
              ? describeDays(pendingNext.days)
              : configured
                ? describeDays([])
                : 'Not set yet'}
        </Text>
        <Text style={styles.helper}>
          {defaultDays !== null
            ? 'Everyone works the other days. Individual overrides can be set per employee later.'
            : pendingNext !== null
              ? `Starts ${formatLongDate(pendingNext.validFrom)} — everyone works all days until then.`
              : 'Pick the days your team is off each week — everyone works the rest.'}
        </Text>
        {noteHops.length > 0 && (
          // Queued changes behind the visible rule: without this the card
          // reads "Sun only" right after the owner saved Thu–Sun from next
          // week, and the save looks lost (found on device 2026-10-26).
          // Same wording and soft-blue treatment as the editor's Upcoming
          // panel (describeDaysOff + primarySoft) — one voice on both
          // surfaces. Capped at MAX_SHOWN_HOPS; the editor owns the queue.
          <View style={styles.queuedNote}>
            <View style={styles.queuedLines}>
              {noteHops.slice(0, MAX_SHOWN_HOPS).map((hop) => (
                // One row per start date (AD-8's exclusion constraint), so
                // validFrom keys the list.
                <Text key={hop.validFrom} style={styles.queuedText}>
                  {`From ${formatLongDate(hop.validFrom)}: ${describeDaysOff(hop.days)}.`}
                </Text>
              ))}
              {noteHops.length > MAX_SHOWN_HOPS && (
                <Text style={styles.queuedMore}>
                  {`+${noteHops.length - MAX_SHOWN_HOPS} more — see all in Set weekly off.`}
                </Text>
              )}
            </View>
          </View>
        )}
      </Card>
      <Button
        variant="secondary"
        leadingIcon={
          <CalendarDays size={16} color={colors.primary} strokeWidth={2} />
        }
        onPress={onManageWeeklyOff}>
        Set weekly off
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.s3,
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  days: {
    ...typography.title,
    color: colors.textStrong,
    marginTop: spacing.s2,
  },
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
  queuedNote: {
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  queuedLines: {
    flex: 1,
    gap: spacing.s1,
  },
  queuedText: {
    ...typography.label,
    color: colors.primary,
  },
  queuedMore: {
    ...typography.bodySm,
    color: colors.primary,
  },
});
