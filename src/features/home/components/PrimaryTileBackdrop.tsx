/**
 * PrimaryTileBackdrop — a light drawing behind a filled (primary) Quick
 * Actions tile: thin dotted diagonal stripes, evenly spaced across the whole tile.
 * White at a low opacity so the icon and label on top never lose contrast;
 * decorative only — no touches, hidden from screen readers.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { colors, radius } from '../../../theme';

const STRIPE_GAP = 22;

export default function PrimaryTileBackdrop() {
  // The SVG needs pixel sizes — measure the tile, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={styles.clip}>
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        {Array.from({ length: Math.ceil((width + height) / STRIPE_GAP) }, (_, i) => {
          const x = i * STRIPE_GAP;
          return (
            <Line
              key={i}
              x1={x}
              y1={0}
              x2={x - height}
              y2={height}
              stroke={colors.onPrimary}
              strokeOpacity={0.4}
              strokeWidth={1.6}
              strokeDasharray="0.1 18"
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
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
