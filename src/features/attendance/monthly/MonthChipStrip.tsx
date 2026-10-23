/**
 * MonthChipStrip — the Monthly pane's month navigator (2026-10 owner
 * redesign, from the fare-calendar strip idea): a sticky YEAR tag on the
 * leading edge (the SELECTED month's year) and a horizontal strip of
 * month-name chips — the chips print the month only; the selected chip
 * highlights blue, the rest stay white. Tap a chip to jump to that
 * month; the strip extends a year at a time as the owner scrolls right
 * (after Dec 2027, 2028 comes — and so on). Chips past the CURRENT real
 * month render disabled — the day-statuses read never grades a future
 * month (the old ›'s clamp, kept).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme';
import { shiftYearMonth } from './monthlyModel';

const CHIP_W = 72;
const CHIP_GAP = spacing.s2;
const START_MONTH = '2025-01';
const EXTEND_BY = 12;

/** 'YYYY-MM' list, inclusive. */
function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const MONTH_ABBR: Record<number, string> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

/** The chip prints the month name only — the sticky tag owns the year. */
function chipLabel(ym: string): string {
  return MONTH_ABBR[Number(ym.slice(5, 7))];
}

/** Screen-reader context: the bare month alone is ambiguous. */
function chipA11yLabel(ym: string): string {
  return `${MONTH_ABBR[Number(ym.slice(5, 7))]} ${ym.slice(0, 4)}`;
}

/** The device's real current month — the future-clamp line. */
function deviceThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type Props = {
  /** The viewed month ('YYYY-MM'). */
  value: string;
  /** Parameter load in flight — chips lock (the old nav's Q5 rule). */
  disabled?: boolean;
  onSelect: (ym: string) => void;
};

export function MonthChipStrip({ value, disabled = false, onSelect }: Props) {
  const [endMonth, setEndMonth] = useState('2027-12');
  const months = useMemo(() => monthRange(START_MONTH, endMonth), [endMonth]);
  const listRef = useRef<FlatList<string>>(null);
  const scrolledFor = useRef<string | null>(null);
  const current = deviceThisMonth();

  // Keep the selected chip in view — on mount and on every jump. Keyed to
  // the SELECTION, not to `months`: an onEndReached extension appends
  // chips but must not yank the viewport back to the selected month while
  // the owner browses the far right.
  useEffect(() => {
    if (scrolledFor.current === value) return;
    const idx = months.indexOf(value);
    if (idx >= 0 && listRef.current != null) {
      scrolledFor.current = value;
      listRef.current.scrollToOffset({
        offset: Math.max(0, idx * (CHIP_W + CHIP_GAP) - 60),
        animated: true,
      });
    }
  }, [value, months]);

  const future = (ym: string) => ym > current;

  return (
    <View style={styles.row}>
      {/* The sticky year tag — the selected month's year, pinned while the
          chips scroll (the fare-strip's "OCT", promoted to the year). */}
      <View style={styles.yearTag}>
        <Text style={styles.yearTagText}>{value.slice(0, 4)}</Text>
      </View>
      <FlatList
        ref={listRef}
        horizontal
        data={months}
        keyExtractor={(ym) => ym}
        // Render through the selected chip on the FIRST frame — the
        // auto-scroll effect then only moves, never populates: the owner
        // never sees the strip's early years flash past (and the selected
        // chip exists in the tree without waiting on scroll virtualization).
        initialNumToRender={Math.max(10, months.indexOf(value) + 4)}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: CHIP_W,
          offset: (CHIP_W + CHIP_GAP) * index,
          index,
        })}
        onEndReached={() => setEndMonth(shiftYearMonth(endMonth, EXTEND_BY))}
        onEndReachedThreshold={0.5}
        renderItem={({ item: ym }) => {
          const selected = ym === value;
          // The SELECTED month is never disabled — the echo-correction can
          // land on a month past the device's own (a server clock ahead
          // across a month boundary), and a selected chip that reads
          // disabled would strand the view on an untappable month.
          const isFuture = ym !== value && future(ym);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={chipA11yLabel(ym)}
              accessibilityState={{ selected, disabled: disabled || isFuture }}
              disabled={disabled || isFuture}
              onPress={() => onSelect(ym)}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                (disabled || isFuture) && styles.chipDisabled,
              ]}>
              <Text
                style={[
                  styles.chipText,
                  selected && styles.chipTextSelected,
                  (disabled || isFuture) && styles.chipTextDisabled,
                ]}>
                {chipLabel(ym)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.s2,
  },
  yearTag: {
    width: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearTagText: {
    ...typography.labelStrong,
    color: colors.surfaceCard,
    letterSpacing: 0.5,
  },
  chip: {
    width: CHIP_W,
    marginRight: CHIP_GAP,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s3,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    ...typography.label,
    color: colors.textStrong,
  },
  chipTextSelected: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  chipTextDisabled: {
    color: colors.textMuted,
  },
});
