/**
 * OfficeCardBackdrop — the faint drawing behind an office card, themed on
 * what an office row is about: radar-style rings spreading from the top-right
 * corner (the check-in radius around the office) and a small skyline of
 * buildings standing on the bottom-right edge. Drawn in the brand colour at a
 * few percent opacity so the text above never loses contrast; purely
 * decorative, so it takes no touches and is hidden from screen readers.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '../../../theme';

const RINGS = [34, 62, 90, 118];

/** Skyline: [x offset from the right edge, width, height] per building. */
const BUILDINGS: readonly (readonly [number, number, number])[] = [
  [96, 14, 22],
  [78, 18, 36],
  [56, 16, 26],
  [36, 20, 42],
  [14, 16, 30],
];
const WINDOW = 3;

export default function OfficeCardBackdrop() {
  // The SVG needs pixel sizes — measure the card, draw to fit.
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
          {RINGS.map((r, i) => (
            <Circle
              key={r}
              cx={width - spacing.s4}
              cy={spacing.s4}
              r={r}
              fill="none"
              stroke={colors.primary}
              strokeWidth={1}
              strokeOpacity={0.12 - i * 0.025}
            />
          ))}
          <Circle
            cx={width - spacing.s4}
            cy={spacing.s4}
            r={4}
            fill={colors.primary}
            fillOpacity={0.12}
          />
          {BUILDINGS.map(([fromRight, w, h]) => {
            const x = width - fromRight - w;
            const y = height - h;
            return (
              <Rect
                key={fromRight}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={2}
                fill={colors.primary}
                fillOpacity={0.07}
              />
            );
          })}
          {BUILDINGS.map(([fromRight, w, h]) =>
            [0, 1, 2].map(row => (
              <Rect
                key={`${fromRight}-${row}`}
                x={width - fromRight - w + (w - WINDOW) / 2}
                y={height - h + 6 + row * 8}
                width={WINDOW}
                height={WINDOW}
                rx={1}
                fill={colors.surfaceCard}
                fillOpacity={row * 8 + 12 < h ? 0.9 : 0}
              />
            )),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
