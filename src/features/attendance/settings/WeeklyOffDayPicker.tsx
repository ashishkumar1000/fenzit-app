/**
 * WeeklyOffDayPicker — 7 pill row (Mon..Sun) for selecting weekly-off days
 * (Story 15-6). Mirrors the Fenzit DS day-pill pattern (radius.pill +
 * typography.heading); selection state is owned by the parent.
 *
 * Accessibility floor (UX-DR):
 *   - Every pill carries a full accessible label ("Sunday"), NOT just the
 *     visible glyph — the two S's and two T's must never share an a11y label.
 *   - The pills are CHECKBOXES in a labelled group (15-6 review): the
 *     control is genuinely multi-select (any combination of days), so
 *     radio/radiogroup semantics announced it as single-select. Each pill
 *     carries `accessibilityState={{ checked }}`, which is how the selected
 *     state is announced ("Sunday, checkbox, checked" — the UX-DR's
 *     "Sunday, selected" in AT vocabulary); the group View carries the
 *     "Days off" label so the seven read as one widget.
 *   - The full day-of-week name comes from a hoisted module formatter
 *     anchored to `timeZone: 'UTC'` (15-6 review iteration 1: formatting a
 *     UTC instant WITHOUT that option lets the device zone shift the name —
 *     TZ=America/New_York announced "Sunday" for the Monday pill). The
 *     formatter is built once per module load, wrapped in try/catch with a
 *     hardcoded English fallback (Hermes ships incomplete Intl on some
 *     builds — see utils/istDate's note), and the unused `locale` param is
 *     gone: the app is hardcoded-English with no i18n layer (the
 *     localization stance is a recorded review deferral).
 *   - 56px tall two-line pills (letter + Work/Off). Seven must fit one row,
 *     so the width is ~39dp on a 360dp phone — under the 44px floor, a
 *     stated exception alongside the calendar cells; the height compensates.
 *
 * "All 7 selected" gate: surfaced as a sibling text (the parent renders
 * the inline rule). The picker itself never blocks a tap — the parent's
 * `onChange` decides whether to disable Save.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import type { IsoWeekday } from '../../../services';

export const WEEKLY_OFF_DAY_LETTERS: Record<IsoWeekday, string> = {
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
  7: 'S',
};

/** Stable ordering for the row: Mon=1 .. Sun=7. */
export const WEEKLY_OFF_DAY_ORDER: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export type WeeklyOffDayPickerProps = {
  /** Selected ISO weekdays (1..7). */
  value: IsoWeekday[];
  onChange: (next: IsoWeekday[]) => void;
  /** Disables all pills (e.g. while a save is in flight). */
  disabled?: boolean;
};

const DAY_NAME_FALLBACK: Record<IsoWeekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

// Built once, not per pill per render; the instant is UTC-anchored AND the
// format is pinned to UTC, so the device zone can never shift the name.
const weekdayNames = (() => {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    return (day: IsoWeekday): string =>
      fmt.format(new Date(Date.UTC(2026, 0, 5) + (day - 1) * 86400000));
  } catch {
    // Hermes builds with incomplete Intl (or a thrown constructor): the
    // hardcoded English map is the answer, unchanged.
    return (day: IsoWeekday): string => DAY_NAME_FALLBACK[day];
  }
})();

/** Full day-of-week name for one ISO weekday — timezone-independent. */
export function weeklyOffDayName(day: IsoWeekday): string {
  return weekdayNames(day);
}

export function WeeklyOffDayPicker({
  value,
  onChange,
  disabled,
}: WeeklyOffDayPickerProps) {
  const selected = new Set<IsoWeekday>(value);
  const toggle = (day: IsoWeekday) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    // Sort ascending so the PUT body matches the canonical `[1, 2, …]`
    // shape — the BE CHECKs uniqueness + range but the FE keeps the wire
    // format deterministic for diffs.
    onChange(WEEKLY_OFF_DAY_ORDER.filter((d) => next.has(d)));
  };

  return (
    <View
      style={styles.row}
      accessibilityRole="group"
      accessibilityLabel="Days off">
      {WEEKLY_OFF_DAY_ORDER.map((day) => {
        const isSelected = selected.has(day);
        const longName = weeklyOffDayName(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityLabel={longName}
            accessibilityState={{ checked: isSelected }}
            disabled={disabled}
            onPress={() => toggle(day)}
            style={({ pressed }) => [
              styles.pill,
              isSelected && styles.pillSelected,
              pressed && !disabled && styles.pillPressed,
            ]}>
            <Text
              maxFontSizeMultiplier={PILL_FONT_CAP}
              style={[
                styles.pillLabel,
                isSelected && styles.pillLabelSelected,
              ]}>
              {WEEKLY_OFF_DAY_LETTERS[day]}
            </Text>
            <Text
              maxFontSizeMultiplier={PILL_FONT_CAP}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                styles.pillSubLabel,
                isSelected && styles.pillLabelSelected,
              ]}>
              {isSelected ? 'Off' : 'Work'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Two-line pill (letter + Work/Off), 56px tall. Seven pills must fit one
// row inside the card (~39dp wide on a 360dp phone), so the width sits
// under the 44px floor — the height keeps the touch target generous, the
// same stated exception as the calendar cells.
const PILL_SIZE = 56;
// The pills are ~39dp wide, so their tiny labels cannot follow the system
// font all the way up (200% wrapped `Work` to `Wor`/`k`). Capped, not
// disabled: they still grow to 130%; the sub-label also shrinks to fit.
const PILL_FONT_CAP = 1.3;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s1,
  },
  pill: {
    flex: 1,
    minHeight: PILL_SIZE,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    outlineColor: colors.primarySoft,
    outlineWidth: 3,
  },
  pillSubLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillLabel: {
    ...typography.heading,
    color: colors.textStrong,
  },
  pillLabelSelected: {
    color: colors.onPrimary,
  },
});
