/**
 * TilePatterns — the four "Jobs By Employees" tiles' hand-drawn background
 * watermarks (user request 2026-11-13: a researched, content-based motif per
 * tile, same tone-on-tone family as the Profile summary card's patterns).
 * One color prop each (the tile's fg token), low opacities only — the
 * number stays the loudest thing on the tile.
 *
 *   CreatedPattern  — a page corner with its first pencil stroke rising.
 *   ApprovedPattern — a stamp-worn approval seal with a signed check.
 *   AutoPattern     — a circuit trace that ends in a hand-drawn tick.
 *   OwnerPattern    — the owner's briefcase, bleeding off the corner.
 *
 * Each is anchored to the tile's top-right corner; the SVG viewport clips
 * the bleed, so nothing spills outside the tile.
 */
import { Svg, Path, Circle, Line, Polyline, Rect } from 'react-native-svg';

export function CreatedPattern({ color }: { color: string }) {
  return (
    // Rendered at 40×40 (Sally placement review 2026-11-13): at 44 the
    // page's left edge clipped the tail of the "Created" label.
    <Svg width={40} height={40} viewBox="0 0 44 44" pointerEvents="none">
      {/* page corner — right edge bleeds past the viewBox for the off-tile feel */}
      <Path
        d="M14 9.2 C25 8.3 35.5 8.7 46.8 8.1 L47.4 41.6 C36.5 42.1 25.5 41.7 14.6 42.2 C14.1 31 14.4 20.1 14 9.2 Z"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.08}
        strokeLinejoin="round"
      />
      {/* the first line, rising as it is written */}
      <Path
        d="M18.5 25.6 C23 23.6 30 19 39.4 13.6"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.12}
        strokeLinecap="round"
      />
      {/* pencil body, trailing off the corner */}
      <Line
        x1={36.8}
        y1={15.2}
        x2={45.6}
        y2={5.4}
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.1}
        strokeLinecap="round"
      />
      {/* open pencil tip pointing at the stroke's end */}
      <Polyline
        points="36.6,15.4 33.1,18.9 37.6,19.7"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.08}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ApprovedPattern({ color }: { color: string }) {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" pointerEvents="none">
      {/* faint ink pool of the seal */}
      <Circle cx={23} cy={21} r={14} fill={color} fillOpacity={0.06} stroke="none" />

      {/* stamp ring, broken where the press lifted (large arc, bottom-left) */}
      <Path
        d="M 31 9.5 A 14 14 0 1 1 9.1 19.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeOpacity={0.1}
        fill="none"
      />
      {/* short surviving top arc — the worn gap sits between the two ends */}
      <Path
        d="M 9.5 17.4 A 14 14 0 0 1 26.6 7.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeOpacity={0.09}
        fill="none"
      />

      {/* signed check — confident stroke, slight curve, sharp overshoot at the tip */}
      <Path
        d="M 15.9 21.7 C 18 24.3 20 26.6 21.5 27.7 C 24.2 23.9 27.9 18.9 31.3 13.9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeOpacity={0.12}
        fill="none"
      />
      {/* Sally placement review 2026-11-13: the two go-ticks were removed —
          with the seal lowered beside the value they trailed into the
          number's zone as fuzz. */}
    </Svg>
  );
}

export function AutoPattern({ color }: { color: string }) {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" pointerEvents="none">
      {/* circuit trace bleeding in from the right edge, dropping down with a slight wobble */}
      <Path
        d="M44.5 6.8 L33.2 6.8 L27.8 12.4 L27.6 17.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.1}
      />
      {/* solder nodes at the bend and where the trace hands off to the tick */}
      <Circle cx={33.2} cy={6.8} r={1.4} fill={color} opacity={0.12} />
      <Circle cx={27.6} cy={17.8} r={1.4} fill={color} opacity={0.12} />
      {/* the tick — the rule check passing, drawn a touch heavier as the payoff */}
      <Path
        d="M21.2 23.4 L25 27.2 L32.8 18.2"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.12}
      />
    </Svg>
  );
}

export function OwnerPattern({ color }: { color: string }) {
  return (
    <Svg width={52} height={46} viewBox="0 0 52 46" pointerEvents="none">
      {/* case body, right edge bleeding off the tile. Sally placement
          review 2026-11-13: the briefcase was the heaviest watermark on the
          row (largest shape, the only filled body) — the fill and stroke
          are pulled back to sit in the same family as its neighbours. */}
      <Path
        d="M 8.3 14.5 C 8.1 12.8 9.2 11.9 10.9 11.9 L 50 11.4 C 52.6 11.4 54.2 12.6 54.4 14.8 L 55.3 37.5 C 55.5 39.4 54 40.5 52 40.5 L 10.6 40.9 C 9 40.9 7.9 39.9 7.8 38.3 Z"
        fill={color}
        fillOpacity={0.04}
        stroke={color}
        strokeOpacity={0.08}
        strokeWidth={1.8}
      />
      {/* handle, arcing off the top edge */}
      <Path
        d="M 24.5 12 C 24 5.5 25.5 4.2 30.5 4 C 35.5 3.8 37 5 36.8 12"
        fill="none"
        stroke={color}
        strokeOpacity={0.1}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* seam across the case */}
      <Path
        d="M 8.2 24.5 C 22 23.8 40 24.2 55 23.6"
        fill="none"
        stroke={color}
        strokeOpacity={0.07}
        strokeWidth={1.5}
      />
      {/* single latch on the seam */}
      <Rect
        x={27.4}
        y={21.8}
        width={6}
        height={5.6}
        rx={1.2}
        fill={color}
        fillOpacity={0.09}
        stroke={color}
        strokeOpacity={0.08}
        strokeWidth={1.5}
      />
    </Svg>
  );
}
