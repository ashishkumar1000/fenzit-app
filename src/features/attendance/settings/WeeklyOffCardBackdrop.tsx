/**
 * WeeklyOffCardBackdrop — the faint drawing in the bottom-right corner of the
 * "Employee-wise weekly off" card: two weeks of dots (Mon..Sun), the Sat and
 * Sun columns drawn as soft squares — "days, and the ones that are off".
 *
 * Kept deliberately quiet, per the research behind it: one decorative layer,
 * a single colour (the brand blue) at a few percent opacity, fading towards
 * the left edge, and clear of every line of text (the footer line keeps a
 * margin). Purely decorative, so it takes no touches and is hidden from
 * screen readers. Same recipe as `OfficeCardBackdrop`: measure the card, draw
 * to fit, clip to the card's rounded corners.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '../../../theme';

const COLUMNS = 7; // Mon..Sun, left to right
const ROWS = 2;
const PITCH = 10;
const DOT = 2.2;
const SQUARE = 7;

/** Width the drawing needs, so callers can keep text clear of it. */
export const WEEKLY_OFF_BACKDROP_WIDTH = COLUMNS * PITCH;

export default function WeeklyOffCardBackdrop() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={styles.clip}>
      {width > 0 && height > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          {Array.from({ length: ROWS }).map((_, row) =>
            Array.from({ length: COLUMNS }).map((__, col) => {
              // Centre of this cell, counted from the bottom-right corner.
              const cx = width - spacing.s4 - (COLUMNS - col - 0.5) * PITCH;
              const cy = height - spacing.s4 - (ROWS - row - 0.5) * PITCH;
              // Fades in towards the corner: faintest on the left.
              const fade = 0.07 + (col / (COLUMNS - 1)) * 0.09;
              const isWeekend = col >= COLUMNS - 2;
              return isWeekend ? (
                <Rect
                  key={`${row}-${col}`}
                  x={cx - SQUARE / 2}
                  y={cy - SQUARE / 2}
                  width={SQUARE}
                  height={SQUARE}
                  rx={2}
                  fill={colors.primary}
                  fillOpacity={0.16 + (row === 0 ? 0.04 : 0)}
                />
              ) : (
                <Circle
                  key={`${row}-${col}`}
                  cx={cx}
                  cy={cy}
                  r={DOT}
                  fill={colors.primary}
                  fillOpacity={fade}
                />
              );
            }),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clip to the card's rounded corners so nothing spills past the border.
  clip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
