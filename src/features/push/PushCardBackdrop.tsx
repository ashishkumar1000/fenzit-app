/**
 * PushCardBackdrop — a faint sound-wave drawing on one edge of the
 * notifications card: thin rings on the left (`start`) or right (`end`, the
 * default) edge, and a quiet dot grid across the middle (`center`).
 *
 * Decorative only: it takes no touches, is hidden from screen readers, and
 * sits behind the card's text and buttons (rendered first in the card).
 * The card clips it through its own `overflow: hidden`.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme';

/** Ring radii and matching stroke opacity, inner to outer (dp). */
const RINGS = [
  { r: 24, opacity: 0.14 },
  { r: 40, opacity: 0.11 },
  { r: 56, opacity: 0.08 },
  { r: 72, opacity: 0.06 },
  { r: 88, opacity: 0.04 },
  { r: 104, opacity: 0.025 },
] as const;

/** Which card edge the rings are centred on. */
export type PushCardBackdropSide = 'start' | 'center' | 'end';


/** Concentric rings centred on the left or right edge. */
function rings(side: 'start' | 'end', width: number, height: number) {
  const set = side === 'end' ? RINGS : RINGS.slice(0, 4);
  return set.map(ring => (
    <Circle
      key={ring.r}
      cx={side === 'end' ? width : 0}
      cy={height / 2}
      r={ring.r}
      fill="none"
      stroke={colors.primary}
      strokeWidth={1}
      strokeOpacity={ring.opacity}
    />
  ));
}

/** A quiet grid of dots across the middle third of the card. */
function centreDots(width: number, height: number) {
  const pitch = 12;
  const left = width * 0.35;
  const right = width * 0.65;
  const dots = [];
  for (let y = pitch / 2; y < height; y += pitch) {
    for (let x = left; x <= right; x += pitch) {
      dots.push(
        <Circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={1.2}
          fill={colors.primary}
          fillOpacity={0.12}
        />,
      );
    }
  }
  return dots;
}

export default function PushCardBackdrop({ side = 'end' }: { side?: PushCardBackdropSide }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={StyleSheet.absoluteFill}>
      {width > 0 && height > 0 ? (
        <Svg width={width} height={height}>
          {side === 'center'
            ? centreDots(width, height)
            : rings(side, width, height)}
        </Svg>
      ) : null}
    </View>
  );
}
