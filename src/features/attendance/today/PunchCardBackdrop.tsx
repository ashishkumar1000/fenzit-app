/**
 * PunchCardBackdrop — the punch card's fresh decorative backdrops (owner
 * request 2026-11-10): a quiet morning narrative, drawn in SVG (the DS
 * permits drawn art in SVG only, never View fills). Each surface gets
 * its OWN motif — never the same design twice:
 *
 *   • card   — sun sliver + amber companion peeking from the top edge,
 *              a low blue glow in the bottom-left corner, over a
 *              RADIATING HALFTONE: a dot grid whose dot size decays with
 *              distance from the sun (the researched card-pattern
 *              treatment — dot grid + radial fade, the Aceternity/shadcn
 *              signature — redrawn as light radiating out of the sun),
 *              plus two hairline ripple arcs. Quiet by arithmetic: the
 *              dots cover ~2% of the card, so even at per-dot 30% the
 *              effective wash stays ≤ 1%.
 *   • WORKED — a rising sun: disc crown rising into the bottom-right
 *              corner, rays fanning up. Green ink.
 *   • BLOCKER (red, "Location is off") — the lost pin: a dropped-pin
 *              silhouette with one locating arc sweeping off the top
 *              edge — the signal that isn't there.
 *
 * (The LATE BY ripples and EARLY BY setting-sun motifs retired with the
 * flag chips 2026-11-10 — punctuality moved into the tiles' verdict
 * lines, leaving WORKED the only chip.)
 *
 * Geometry: every backdrop MEASURES its container (the house idiom —
 * OfficeCardBackdrop, PrimaryTileBackdrop) and draws in exact pixels
 * anchored to corners. A viewBox + percent-size Svg cannot do this:
 * Yoga resolves an absolute child's PERCENT size against the parent's
 * content box (so the art stopped 2×padding short of the right/bottom
 * edges — a hard clip line, caught on device 2026-11-10), and a
 * centred `slice` re-crops the scene with the card's aspect, parking
 * the amber disc under the CHECK OUT label in the tall done card.
 * Corner-anchored pixels look identical in the short mid-session card
 * and the tall done card.
 *
 * All decorative, all QUIET: big fills ≤ 7%, strokes ≤ 15%, mostly
 * cropped outside the frame, pointerEvents none, clipped by containers.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, radius } from '../../../theme';

/** The card-level scene: the morning sun sliver and its amber companion
 *  peeking from the top edge, a low blue glow anchoring the bottom-left
 *  corner — and the radiating halftone woven through it all. */
export function PunchCardBackdrop() {
  // The SVG needs pixel sizes — measure the card, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const sun = { x: width - 16, y: -72 };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={styles.clip}>
      {width > 0 && height > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <RadiatingHalftone width={width} height={height} sun={sun} />
          <Circle cx={sun.x} cy={sun.y} r={84} fill={colors.status.done.solid} opacity={0.05} />
          <Circle cx={width - 88} cy={-16} r={26} fill={colors.status.checkoutMissing.solid} opacity={0.06} />
          <Circle cx={sun.x} cy={sun.y} r={120} stroke={colors.punch.ring} strokeWidth={1.4} fill="none" opacity={0.12} />
          <Circle cx={sun.x} cy={sun.y} r={156} stroke={colors.punch.ring} strokeWidth={1.4} fill="none" opacity={0.09} />
          <Circle cx={10} cy={height + 46} r={60} fill={colors.punch.ring} opacity={0.05} />
        </Svg>
      ) : null}
    </View>
  );
}

/** The radiating halftone: a dot grid whose dot size decays with distance
 *  from the sun's centre, so the texture reads as light radiating from
 *  the top-right corner and dissolving before it reaches the big times. */
function RadiatingHalftone({
  width,
  height,
  sun,
}: {
  width: number;
  height: number;
  sun: { x: number; y: number };
}) {
  const ink = colors.punch.ring;
  const SPACING = 18;
  const dots = [];
  for (let i = 0; ; i++) {
    const x = width - 9 - i * SPACING;
    if (x < 0) break;
    for (let j = 0; ; j++) {
      const y = 9 + j * SPACING;
      if (y > height) break;
      const falloff = Math.max(0, 1 - Math.hypot(x - sun.x, y - sun.y) / 280);
      const r = 2.2 * falloff;
      // Falloff only shrinks down each column — the first quiet row ends it.
      if (r < 0.4) break;
      dots.push(
        <Circle
          key={`${i}.${j}`}
          cx={x}
          cy={y}
          r={r}
          fill={ink}
          opacity={0.08 + 0.22 * falloff}
        />,
      );
    }
  }
  return <>{dots}</>;
}

/** WORKED — a rising sun: the disc's crown rising into the bottom-right
 *  corner, three rays fanning up into the visible area. Ink follows the
 *  chip's tone (green celebration by default). */
export function WorkedChipBackdrop({ ink }: { ink?: string }) {
  // The SVG needs pixel sizes — measure the chip, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  // Defaults to the green celebration ink; the short-day chip passes its
  // own tone so the rays never read "done" on a day that wasn't.
  const stroke = ink ?? colors.status.done.solid;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={styles.clip}>
      {width > 0 && height > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Circle cx={width + 6} cy={height + 12} r={64} fill={stroke} opacity={0.07} />
          <Line x1={width - 92} y1={53} x2={width - 64} y2={36} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" opacity={0.16} />
          <Line x1={width - 79} y1={73} x2={width - 47} y2={61} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" opacity={0.14} />
          <Line x1={width - 56} y1={33} x2={width - 32} y2={21} stroke={stroke} strokeWidth={1.7} strokeLinecap="round" opacity={0.15} />
        </Svg>
      ) : null}
    </View>
  );
}

/** The blocker card's motif (owner request 2026-11-10, red "Location is
 *  off" card) — the LOST PIN: a dropped-pin silhouette (teardrop + hole,
 *  evenodd) hanging in the upper right, its locating arc sweeping off the
 *  top edge beside it — the signal that isn't there. Red ink, quiet by
 *  the same arithmetic as the scene fills. */
export function LostPinBackdrop() {
  // The SVG needs pixel sizes — measure the card, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const ink = colors.status.cancelled.solid;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={e => setSize(e.nativeEvent.layout)}
      style={styles.clip}>
      {width > 0 && height > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Path
            d="M 0 -26 a 26 26 0 0 1 26 0 C 26 16 12 30 0 46 C -12 30 -26 16 -26 0 a 26 26 0 0 1 26 -26 Z M 0 -12 a 12 12 0 1 0 0 24 a 12 12 0 1 0 0 -24 Z"
            transform={`translate(${width - 51} 44) scale(0.79)`}
            fill={ink}
            fillRule="evenodd"
            opacity={0.08}
          />
          <Path
            d={`M ${width - 26} 12 A 40.7 40.7 0 0 1 ${width - 12} 33.5`}
            stroke={ink}
            strokeWidth={1.4}
            fill="none"
            opacity={0.15}
          />
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
