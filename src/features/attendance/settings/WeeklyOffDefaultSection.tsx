/**
 * WeeklyOffDefaultSection — the tenant-default block of `WeeklyOffScreen`
 * (Story 15-6, FR-18): one card holding the FOR EVERYONE badge, helper copy,
 * the 7 day pills with a live "N days off / M working days" chip, the
 * starting-date field and the Save CTA; the "Upcoming changes" panel sits
 * below the card.
 *
 * Layout (weekly-off redesign): four quiet groups inside the card —
 * intro, days, date, save — separated by one hairline and a consistent gap,
 * so nothing repeats (the date shows once, with its subtitle inside the
 * field) and nothing crowds.
 *
 * Presentational only — every piece of state lives in the screen, so the
 * screen owns the dirty/gating rules and this file owns the layout. Split
 * out to keep `WeeklyOffScreen.tsx` under the ~300-line file limit.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  Button,
  Card,
  DatePickerField,
  Eyebrow,
  InlineError,
  InlineNotice,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ApiError, IsoWeekday, WeeklyOffView } from '../../../services';
import { WeeklyOffDayPicker } from './WeeklyOffDayPicker';
import WeeklyOffEveryoneBackdrop from './WeeklyOffEveryoneBackdrop';
import { WeeklyOffUpcomingPanel } from './WeeklyOffUpcomingPanel';
import {
  describeDaysOff,
  formatLongDate,
  weeklyOffSaveHint,
} from './weeklyOffModel';

export type WeeklyOffDefaultSectionProps = {
  /** No default row exists yet (first open) — swaps the helper copy. */
  neverConfigured: boolean;
  selectedDays: IsoWeekday[];
  onDayToggle: (next: IsoWeekday[]) => void;
  /** Save in flight — pills and the date field lock. */
  isSaving: boolean;
  /** All 7 days picked — FR-18's mirror gate. */
  sevenSelected: boolean;
  /** Zero days picked. */
  noWorkingDays: boolean;
  effectiveFrom: string;
  onEffectiveFromChange: (next: string) => void;
  today: string;
  saveError: ApiError | null;
  saveDisabled: boolean;
  onSave: () => void;
  /** Future-effective rows from the BE's `history` (ascending). */
  upcoming: WeeklyOffView[];
  /** The schedule in force today — the "transitions from" side of each row. */
  currentDays: IsoWeekday[];
};

export function WeeklyOffDefaultSection({
  neverConfigured,
  selectedDays,
  onDayToggle,
  isSaving,
  sevenSelected,
  noWorkingDays,
  effectiveFrom,
  onEffectiveFromChange,
  today,
  saveError,
  saveDisabled,
  onSave,
  upcoming,
  currentDays,
}: WeeklyOffDefaultSectionProps) {
  // The picker only produces valid dates, so the date is never the blocker.
  const saveHint = weeklyOffSaveHint({
    saveDisabled,
    isSaving,
    workingDays: selectedDays,
    dateValid: true,
  });
  return (
    <>
      <Card padding="md">
        {/* Faint corner drawing, first child so everything else paints over it. */}
        <WeeklyOffEveryoneBackdrop />
        <View style={styles.body}>
          <View style={styles.group}>
            <View style={styles.badgeRow}>
              <View style={styles.dot} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>FOR EVERYONE</Text>
              </View>
            </View>
            <Text style={styles.helper}>
              {neverConfigured
                ? "No weekly off set yet. By default Sunday is shown off — pick the days you'd like off. Save to apply for everyone."
                : 'Pick the days everyone is off. Days not picked count as working days.'}
            </Text>
            {neverConfigured ? null : (
              <Text style={styles.rightNow}>
                {`Right now: ${describeDaysOff(currentDays)}`}
              </Text>
            )}
          </View>

          <View style={styles.group}>
            <WeeklyOffDayPicker
              value={selectedDays}
              onChange={onDayToggle}
              disabled={isSaving}
            />
            <View style={styles.summaryChip} accessibilityLiveRegion="polite">
              <Check size={14} color={colors.primary} strokeWidth={2.5} />
              <Text style={styles.summaryText}>
                {`${selectedDays.length} ${
                  selectedDays.length === 1 ? 'day' : 'days'
                } off, ${7 - selectedDays.length} working ${
                  7 - selectedDays.length === 1 ? 'day' : 'days'
                }`}
              </Text>
            </View>
            {sevenSelected ? (
              <InlineNotice
                tone="info"
                message="Pick at least one working day — a full week off isn't allowed."
              />
            ) : noWorkingDays ? (
              <InlineNotice
                tone="info"
                message="No day is off. If you save, everyone will work all 7 days."
              />
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.group}>
            <Eyebrow>Starting date</Eyebrow>
            <DatePickerField
              value={effectiveFrom}
              today={today}
              minDate={today}
              onChange={onEffectiveFromChange}
              placeholder={formatLongDate(today)}
              subtitle="Starts from the beginning of this day"
              helper="Choose today or a later date"
            />
          </View>

          <View style={styles.group}>
            {saveError && !isSaving ? (
              <InlineError
                message={
                  (saveError as ApiError).message ?? "Couldn't save. Try again."
                }
              />
            ) : null}
            <Button
              variant="primary"
              onPress={onSave}
              disabled={saveDisabled}
              loading={isSaving}
              leadingIcon={
                <Check size={18} color={colors.onPrimary} strokeWidth={2.5} />
              }
              fullWidth>
              Save schedule
            </Button>
            {saveHint ? <Text style={styles.hint}>{saveHint}</Text> : null}
          </View>
        </View>
      </Card>

      {upcoming.length > 0 ? (
        <WeeklyOffUpcomingPanel rows={upcoming} currentDays={currentDays} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s4,
  },
  group: {
    gap: spacing.s3,
  },
  helper: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rightNow: {
    ...typography.label,
    color: colors.textStrong,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.s2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    ...typography.labelStrong,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.s1,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  summaryText: {
    ...typography.label,
    color: colors.primary,
  },
});
