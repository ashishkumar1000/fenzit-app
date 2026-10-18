/**
 * WeeklyOffEveryoneBackdrop — the faint drawing in the top-right corner of
 * the "For everyone" card, a little holiday scene from left to right: a car
 * with a suitcase on its roof, a small sun, gentle waves, a big striped beach
 * umbrella, and on the sand beside a cool drink (straw, lemon) a pair of
 * flip-flops — the easy feel of a day off.
 *
 * Kept quiet on purpose, following the same rules as the employee card's
 * `WeeklyOffCardBackdrop`: one decorative layer, thin line art in one colour
 * (the brand blue) at a low opacity, and it lives ONLY in the corner beside
 * the FOR EVERYONE badge — above the helper text, never behind a day pill,
 * the date field or the Save button, which keep a solid card behind them.
 * It is wide rather than tall (the free space is beside the badge), ends
 * ~46px below the card's top edge, and shrinks on narrow phones so it can
 * never run into the badge.
 * Purely decorative, so it takes no touches and is hidden from screen
 * readers. A fixed-size drawing pinned to the corner, so no measuring needed.
 */
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors, spacing } from '../../../theme';

const W = 170;
const H = 46;
const STROKE = 1.5;
/** Where the FOR EVERYONE badge ends, measured from the screen's left edge. */
const BADGE_END = 172;
/** Shift that makes room for the car on the left. */
const SCENE_X = 50;

/** Shared look for every line: thin, round-ended, brand blue, faint. */
const line = {
  fill: 'none',
  stroke: colors.primary,
  strokeOpacity: 0.18,
  strokeWidth: STROKE,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Soft tint for the umbrella's alternate stripes, the car body and drink. */
const tint = {
  fill: colors.primary,
  fillOpacity: 0.07,
} as const;

/** A flip-flop sole centred on `cx`, 7px wide and 11px tall, with its strap. */
function flipFlop(cx: number): { sole: string; strap: string } {
  return {
    sole: `M${cx} 33.5 C${cx + 3.5} 33.5 ${cx + 4} 37.5 ${cx + 3} 40.5 C${
      cx + 2
    } 43.5 ${cx - 2} 43.5 ${cx - 3} 40.5 C${cx - 4} 37.5 ${cx - 3.5} 33.5 ${cx} 33.5 Z`,
    strap: `M${cx} 35.3 L${cx - 2.5} 39.3 M${cx} 35.3 L${cx + 2.5} 39.3`,
  };
}

const LEFT_FLIP_FLOP = flipFlop(78);
const RIGHT_FLIP_FLOP = flipFlop(88);

export default function WeeklyOffEveryoneBackdrop() {
  const { width: screenWidth } = useWindowDimensions();
  // Scale down on narrow phones: the space left of the corner, after the
  // badge and the card's right inset, is all the drawing may use.
  const free = screenWidth - BADGE_END - spacing.s4 * 2 - spacing.s2;
  const renderWidth = Math.max(80, Math.min(W, free));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.corner}>
      <Svg
        width={renderWidth}
        height={(renderWidth * H) / W}
        viewBox={`0 0 ${W} ${H}`}>
        {/* Car — side view with two windows, a door line, lights, a roof
            rack with a suitcase on it, and two wheels (filled with the
            card colour so the body lines stop at the tyres) */}
        <Path
          d="M3 37 V31 C3 29.5 4 28.5 5.5 28 L12 26 L17 19.5 C18 18.2 19 17.5 20.5 17.5 H31 C32.5 17.5 33.5 18 34.5 19 L39 26 L44 27.5 C46 28 47 29.5 47 31 V37 Z"
          {...line}
          {...tint}
        />
        <Path d="M18.5 25 L21.8 20 H25.5 V25 Z" {...line} />
        <Path d="M28 25 V20 H31 C31.8 20 32.3 20.3 32.8 20.9 L36 25 Z" {...line} />
        <Path d="M26.7 20 V35 M4.5 30.5 H6.5 M43.5 29.5 H45.5" {...line} />
        <Path d="M20.5 17.5 V15.8 M31 17.5 V15.8 M19.5 15.8 H32" {...line} />
        <Path d="M22.5 15.8 V11 H29 V15.8 M24.5 11 V9.6 H27 V11" {...line} />
        <Circle cx={13} cy={37.5} r={4.8} {...line} fill={colors.surfaceCard} />
        <Circle cx={13} cy={37.5} r={1.6} {...line} />
        <Circle cx={37} cy={37.5} r={4.8} {...line} fill={colors.surfaceCard} />
        <Circle cx={37} cy={37.5} r={1.6} {...line} />
        <Path d="M0 43.5 H49" {...line} />

        {/* Sun, waves, umbrella, flip-flops and drink — shifted right */}
        <G x={SCENE_X}>
          {/* Sun — a small circle with eight short rays */}
          <Circle cx={13} cy={13} r={4.5} {...line} />
          <Path
            d="M13 4.5 V2 M13 21.5 V24 M4.5 13 H2 M21.5 13 H24 M7 7 L5.3 5.3 M19 7 L20.7 5.3 M7 19 L5.3 20.7 M19 19 L20.7 20.7"
            {...line}
          />

          {/* Umbrella — wide dome, six scalloped panels (every other one
              tinted), ribs to the tip, a pole and a stretch of sand */}
          <Path d="M58 2 C44 2 28 8 28 22 Q33 27 38 22 Z" {...tint} />
          <Path d="M58 2 L48 22 Q53 27 58 22 Z" {...tint} />
          <Path d="M58 2 L68 22 Q73 27 78 22 Z" {...tint} />
          <Path
            d="M28 22 C28 8 44 2 58 2 C72 2 88 8 88 22 Q83 27 78 22 Q73 27 68 22 Q63 27 58 22 Q53 27 48 22 Q43 27 38 22 Q33 27 28 22 Z"
            {...line}
          />
          <Path
            d="M58 2 L38 22 M58 2 L48 22 M58 2 V22 M58 2 L68 22 M58 2 L78 22"
            {...line}
          />
          <Path d="M58 27 V44 M40 44 H116" {...line} />

          {/* Flip-flops — two soles with a V strap each, beside the drink */}
          <Path d={LEFT_FLIP_FLOP.sole} {...line} />
          <Path d={LEFT_FLIP_FLOP.strap} {...line} />
          <Path d={RIGHT_FLIP_FLOP.sole} {...line} />
          <Path d={RIGHT_FLIP_FLOP.strap} {...line} />

          {/* Drink — tumbler with a liquid line, straw, lemon, bubbles */}
          <Path d="M96 22 H112 L110 43 H98 Z" {...line} {...tint} />
          <Path d="M97.3 29 H110.7" {...line} />
          <Path d="M107 22 L111 9 H116" {...line} />
          <Circle cx={96} cy={22} r={3.4} {...line} />
          <Path d="M93.4 22 H98.6" {...line} />
          <Circle cx={102} cy={36} r={1} {...line} />
          <Circle cx={106} cy={32} r={0.9} {...line} />

          {/* Gentle waves */}
          <Path d="M2 38 q4 -3 8 0 t8 0 t8 0" {...line} />
          <Path d="M10 43 q4 -3 8 0 t8 0" {...line} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pinned to the card's top-right; ~46px tall, so it ends above the helper.
  corner: {
    position: 'absolute',
    top: spacing.s1,
    right: spacing.s4,
  },
});
