/**
 * AddressMapBackdrop — the faint street map behind an office card's address:
 * a loose grid of side streets, two crossing avenues (white with a dashed
 * centre line), and a park patch. It says "this is a place" without an icon beside the
 * text. Everything is drawn in the brand/green tints at a few percent opacity
 * (muted like the roads of a map's base layer) so the address on top keeps
 * its contrast; purely decorative, so it takes no touches and is hidden from
 * screen readers.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { colors, radius } from '../../../theme';

const STREET_GAP_X = 46;
const STREET_GAP_Y = 30;

export default function AddressMapBackdrop() {
  // The SVG needs pixel sizes — measure the chip, draw to fit.
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
          {/* Park patch, lower middle. */}
          <Rect
            x={width * 0.46}
            y={height * 0.5}
            width={width * 0.2}
            height={height * 0.7}
            rx={6}
            fill={colors.success}
            fillOpacity={0.045}
          />
          {/* Side streets: an even grid, shifted per column so it reads as a town, not graph paper. */}
          {Array.from({ length: Math.ceil(width / STREET_GAP_X) + 1 }, (_, i) => (
            <Line
              key={`v${i}`}
              x1={i * STREET_GAP_X + (i % 2) * 7}
              y1={0}
              x2={i * STREET_GAP_X + (i % 2) * 7}
              y2={height}
              stroke={colors.primary}
              strokeOpacity={0.04}
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: Math.ceil(height / STREET_GAP_Y) + 1 }, (_, i) => (
            <Line
              key={`h${i}`}
              x1={0}
              y1={i * STREET_GAP_Y + 9}
              x2={width}
              y2={i * STREET_GAP_Y + 9}
              stroke={colors.primary}
              strokeOpacity={0.04}
              strokeWidth={1}
            />
          ))}
          {/* Two avenues crossing: white road, dashed centre line. */}
          {[
            [0, height * 0.9, width * 0.62, -height * 0.1],
            [width * 0.28, height * 1.1, width * 0.9, height * 0.05],
          ].map(([x1, y1, x2, y2], i) => (
            <Line
              key={`r${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colors.surfaceCard}
              strokeOpacity={0.55}
              strokeWidth={5}
              strokeLinecap="round"
            />
          ))}
          {[
            [0, height * 0.9, width * 0.62, -height * 0.1],
            [width * 0.28, height * 1.1, width * 0.9, height * 0.05],
          ].map(([x1, y1, x2, y2], i) => (
            <Line
              key={`d${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colors.primary}
              strokeOpacity={0.06}
              strokeWidth={1}
              strokeDasharray="4 5"
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
