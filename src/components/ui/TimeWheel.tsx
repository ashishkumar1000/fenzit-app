/**
 * TimeWheel — one scrolling column of a time picker (hour, minute or am/pm).
 * Snaps to a row, fades rows away from the centre, and (when `loop`) wraps
 * round so 59 sits above 00. Plain JS FlatList — no native picker module.
 *
 * `loop` renders the items in LOOP_COPIES stacked copies and starts in the
 * middle one; when a scroll settles outside the middle band it jumps (no
 * animation) to the same value inside it, so the owner can keep spinning.
 * The selected row is always the one under the centre band the parent
 * draws (VISIBLE_ROWS tall, selection in the middle row).
 *
 * Screen readers cannot drag a wheel, so each column is an "adjustable"
 * control: swipe up/down (increment/decrement) steps one row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, typography } from '../../theme';

export const WHEEL_ROW_H = 48;
export const WHEEL_VISIBLE_ROWS = 5;
const LOOP_COPIES = 5;
const MIDDLE_COPY = 2;

/** Row opacity by distance from the centre row — the "fading drum" look. */
const FADE = [1, 0.55, 0.22];

type Props = {
  items: readonly string[];
  /** Selected index into `items`. */
  index: number;
  onChange: (index: number) => void;
  /** Wrap round at both ends (hours, minutes); false for am/pm. */
  loop?: boolean;
  width: number;
  /** a11y name of the column, e.g. "Hour". */
  label: string;
  /** Draw the selected row in the brand colour (the am/pm wheel). */
  accent?: boolean;
};

export function TimeWheel({ items, index, onChange, loop = false, width, label, accent = false }: Props) {
  const n = items.length;
  const copies = loop ? LOOP_COPIES : 1;
  const listRef = useRef<FlatList<number>>(null);
  const data = useRef(Array.from({ length: n * copies }, (_, i) => i)).current;
  const home = (value: number) => (loop ? n * MIDDLE_COPY + value : value);

  // Row currently under the centre band — drives the fade only.
  const [centre, setCentre] = useState(home(index));
  const settledRef = useRef(index);

  const scrollTo = useCallback((row: number, animated: boolean) => {
    listRef.current?.scrollToOffset({ offset: row * WHEEL_ROW_H, animated });
  }, []);

  // Parent moved the value (re-seed on open, a11y step) → follow it.
  useEffect(() => {
    if (index === settledRef.current) return;
    settledRef.current = index;
    setCentre(home(index));
    scrollTo(home(index), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const row = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ROW_H);
    setCentre(prev => (prev === row ? prev : row));
  };

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const row = Math.min(
      data.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.y / WHEEL_ROW_H)),
    );
    const value = row % n;
    if (loop && (row < n || row >= n * (copies - 1))) {
      scrollTo(home(value), false);
    } else if (Math.abs(e.nativeEvent.contentOffset.y - row * WHEEL_ROW_H) > 1) {
      // Android's snap can stop short of a row — finish the alignment so
      // the selected value always sits exactly under the centre band.
      scrollTo(row, true);
    }
    if (value !== settledRef.current) {
      settledRef.current = value;
      onChange(value);
    }
  };

  const step = (delta: number) => {
    const next = loop ? (index + delta + n) % n : Math.min(n - 1, Math.max(0, index + delta));
    if (next !== index) onChange(next);
  };

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') step(1);
    if (e.nativeEvent.actionName === 'decrement') step(-1);
  };

  const pad = ((WHEEL_VISIBLE_ROWS - 1) / 2) * WHEEL_ROW_H;

  return (
    <View
      style={{ width, height: WHEEL_ROW_H * WHEEL_VISIBLE_ROWS }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={row => String(row)}
        getItemLayout={(_, i) => ({ length: WHEEL_ROW_H, offset: WHEEL_ROW_H * i, index: i })}
        initialScrollIndex={home(index)}
        snapToInterval={WHEEL_ROW_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: pad }}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onSettle}
        importantForAccessibility="no-hide-descendants"
        renderItem={({ item: row }) => {
          const distance = Math.abs(row - centre);
          const selected = distance === 0;
          return (
            <Pressable
              onPress={() => scrollTo(row, true)}
              style={styles.row}
              accessibilityElementsHidden>
              <Text
                style={[
                  selected ? [styles.selected, accent && styles.accent] : styles.text,
                  { opacity: FADE[Math.min(distance, FADE.length - 1)] },
                ]}>
                {items[row % n]}
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
    height: WHEEL_ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.heading,
    color: colors.textStrong,
  },
  selected: {
    ...typography.title,
    color: colors.textStrong,
  },
  accent: {
    color: colors.primary,
  },
});
