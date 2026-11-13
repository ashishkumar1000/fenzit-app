// PlusIcon — "new job sheet": a solid clipboard whose centre carries a large
// plus knocked out in negative space, so the mark reads as "add a job record"
// in one glance (shape drawn from SF Symbols' clipboard.fill with its
// negative-space clip, Material Symbols' note_add "new document" pattern, and
// the knockout-plus used by collection-add marks). The plus is the anchor and
// stays big and central so it still reads instantly at 18-20px white-on-blue
// on the "New job" button. strokeWidth is accepted to satisfy the icon-family
// signature but is unused — the ink weight is baked into the fill geometry.
import { Svg, Path } from 'react-native-svg';

export function PlusIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fillRule="evenodd"
        fill={color}
        d={
          // Board: filled rounded rectangle, x 3.5-20.5, y 2.5-21.5, r 3.
          'M6.5 2.5 h11 a3 3 0 0 1 3 3 v13 a3 3 0 0 1 -3 3 h-11 ' +
          'a3 3 0 0 1 -3 -3 v-13 a3 3 0 0 1 3 -3 z ' +
          // Plus hole: stadium-tipped plus with filleted inner corners,
          // centre (12, 14), spanning x 7.5-16.5, y 9.5-18.5.
          'M10.4 11.1 a1.6 1.6 0 0 1 3.2 0 v0.6 a0.7 0.7 0 0 0 0.7 0.7 ' +
          'h0.6 a1.6 1.6 0 0 1 0 3.2 h-0.6 a0.7 0.7 0 0 0 -0.7 0.7 v0.6 ' +
          'a1.6 1.6 0 0 1 -3.2 0 v-0.6 a0.7 0.7 0 0 0 -0.7 -0.7 h-0.6 ' +
          'a1.6 1.6 0 0 1 0 -3.2 h0.6 a0.7 0.7 0 0 0 0.7 -0.7 z ' +
          // Clip channel (hole): clip silhouette grown 1.3 on sides and
          // bottom, starting at the board's top edge, so a gap ring separates
          // the clip from the board below.
          'M7.4 2.5 h9.2 v3.3 a2.5 2.5 0 0 1 -2.5 2.5 h-4.2 ' +
          'a2.5 2.5 0 0 1 -2.5 -2.5 z ' +
          // Clip itself: a rounded tab that protrudes above the board top
          // (y 1.2-7.0) — the protruding part is a single crossing so it
          // fills, and together with the channel it reads as the separate
          // clip piece clasped over the board.
          'M10.5 1.2 h3 a1.8 1.8 0 0 1 1.8 1.8 v2.2 a1.8 1.8 0 0 1 -1.8 1.8 ' +
          'h-3 a1.8 1.8 0 0 1 -1.8 -1.8 v-2.2 a1.8 1.8 0 0 1 1.8 -1.8 z'
        }
      />
    </Svg>
  );
}
