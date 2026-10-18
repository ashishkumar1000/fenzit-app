/**
 * WeeklyOffOverridesSection — the per-employee override list of
 * `WeeklyOffScreen` (Story 15-6, FR-19): header row with the "+ Set Off"
 * CTA, plus the loading / error / empty / list states.
 *
 * Owns its OWN fetch states (15-6 review P10): the default block's fetch is
 * independent, so a failed default first-load must not hide this section,
 * and a failed overrides first-load shows error + Retry here — not the
 * empty-state copy, which would claim "everyone follows the tenant default"
 * about data the screen never received.
 *
 * The whole section is ONE outer card; each person is a flat card inside
 * it (see `WeeklyOffOverrideRow` — name, days off in plain words, working
 * days, scheduled future edit, and an Edit button).
 *
 * Presentational only — the screen owns the hooks and the sheet wiring.
 * Split out to keep `WeeklyOffScreen.tsx` under the ~300-line file limit.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import {
  Button,
  Card,
  Eyebrow,
  InlineError,
  InlineNotice,
  Skeleton,
} from '../../../components/ui';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import type { WeeklyOffOverrideResponse } from '../../../services';
import WeeklyOffCardBackdrop, {
  WEEKLY_OFF_BACKDROP_WIDTH,
} from './WeeklyOffCardBackdrop';
import { WeeklyOffOverrideRow } from './WeeklyOffOverrideRow';

export type WeeklyOffOverridesSectionProps = {
  overrides: WeeklyOffOverrideResponse[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: unknown;
  /** Re-runs the overrides fetch (the first-load error's Retry). */
  onRetry: () => void;
  /** Owner has no employees yet — the CTA is disabled. */
  addDisabled: boolean;
  /**
   * Why the CTA is disabled, shown right under the header so the owner
   * never meets a dead button without an explanation. Null/undefined when
   * the CTA is enabled.
   */
  addDisabledReason?: string | null;
  onAdd: () => void;
  onEdit: (override: WeeklyOffOverrideResponse) => void;
};

export function WeeklyOffOverridesSection({
  overrides,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  addDisabled,
  addDisabledReason,
  onAdd,
  onEdit,
}: WeeklyOffOverridesSectionProps) {
  return (
    // The whole section is ONE card, like "For everyone" above: a light-blue
    // heading group first, then one flat card per person inside it. The space
    // ABOVE the card tells the owner a new section has started.
    <Card padding="md" style={styles.outer}>
      {/* Faint corner drawing, first child so everything else paints over it. */}
      <WeeklyOffCardBackdrop />
      <View style={styles.sectionCard}>
        <View style={styles.header}>
          <Eyebrow>Employee-wise weekly off</Eyebrow>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set weekly off for an employee"
            accessibilityState={{ disabled: addDisabled }}
            disabled={addDisabled}
            onPress={onAdd}
            hitSlop={4}
            style={({ pressed }) => [
              styles.addPill,
              addDisabled && styles.addPillDisabled,
              pressed && !addDisabled && styles.addPillPressed,
            ]}>
            <Plus size={16} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.addPillText}>Set Off</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHelper}>
          Give a different weekly off to one person.
        </Text>
      </View>

      {/* The gate's reason as an amber notice (device-check 2026-09-27):
          a dead CTA must explain itself, and plainly enough for a
          non-technical owner — copy-only, no icon. */}
      {addDisabled && addDisabledReason ? (
        <InlineNotice tone="info" icon={null} message={addDisabledReason} />
      ) : null}

      {error && hasLoaded ? (
        <View style={styles.staleError}>
          <InlineError message="Could not refresh. This is the list you saw last time." />
          {/* The rows on screen are stale — offer the re-fetch right here
              instead of forcing a leave-and-return to recover (the same
              affordance the holidays list carries; 15-6 review iteration 1). */}
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Retry
          </Button>
        </View>
      ) : null}

      {isLoading && !hasLoaded ? (
        // First load: a list-shaped shimmer, labelled (the 19-5 idiom).
        <View style={styles.skeleton} accessibilityLabel="Loading attendance">
          <Skeleton rows={3} height={64} />
        </View>
      ) : !hasLoaded && error ? (
        <View style={styles.firstLoadError}>
          <InlineError message="Couldn't load overrides. Check your connection and try again." />
          <Button variant="secondary" onPress={onRetry}>
            Retry
          </Button>
        </View>
      ) : !hasLoaded ? (
        // Not loading, no error, nothing loaded yet — the first fetch has
        // not produced a result. Render nothing rather than an empty state
        // the data cannot back.
        null
      ) : overrides.length === 0 ? (
        <Text style={styles.emptyText}>
          No employee-wise weekly offs yet. Everyone follows the "For everyone"
          weekly off above.
        </Text>
      ) : (
        <>
          {overrides.map((o) => (
            <WeeklyOffOverrideRow
              key={o.employeeId}
              override={o}
              onPress={() => onEdit(o)}
            />
          ))}
          <Text style={styles.footer}>
            {overrides.length === 1
              ? '1 employee has a different weekly off'
              : `${overrides.length} employees have a different weekly off`}
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginTop: spacing.s4,
    gap: spacing.s3,
  },
  // Light blue so the group reads as a heading, not as one more person card.
  sectionCard: {
    gap: spacing.s2,
    padding: spacing.s4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.blue200,
    backgroundColor: colors.primarySoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  firstLoadError: {
    gap: spacing.s3,
  },
  staleError: {
    gap: spacing.s3,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s4,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.blue200,
    // White, so it stands out on the light-blue group it sits in.
    backgroundColor: colors.surfaceCard,
  },
  addPillDisabled: {
    opacity: 0.5,
  },
  addPillPressed: {
    opacity: 0.85,
  },
  addPillText: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  sectionHelper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  footer: {
    ...typography.bodySm,
    color: colors.textMuted,
    // Keeps the line clear of the corner drawing (it wraps, never overlaps).
    marginRight: WEEKLY_OFF_BACKDROP_WIDTH + spacing.s2,
    minHeight: spacing.s6,
  },
});
