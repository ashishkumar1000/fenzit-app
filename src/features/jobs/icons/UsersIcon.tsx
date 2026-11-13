// Crew of three: two equal solid busts standing in front with a hand-carved
// V-shaped negative seam between them, and a smaller third head peeking above
// and between them — depth-staggered like a team huddle, drawn after Material
// Symbols' groups (fill1) and SF Symbols' person.2.fill occlusion-cutout
// construction, with Phosphor's users fill as the solidness reference.
// All-fill on purpose: solid shapes survive a 15px chip where stroked arcs
// blur, so strokeWidth is kept for the family contract but intentionally
// unused.
import { Svg, Path } from 'react-native-svg';

export function UsersIcon({ size = 24, color = '#111827', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* back person — head plus the narrow shoulder wedge that survives
          between the two front figures, its edges cut along the seams */}
      <Path
        d="M 11.4 9.2 C 10.6 7.8 10.3 7.0 10.3 6.5 A 2.4 2.4 0 1 1 13.7 6.5 C 13.7 7.0 13.4 7.8 12.6 9.2 Z"
        fill={color}
      />
      {/* front-left bust — head and shoulders one silhouette, neck notches
          where the shoulder curves meet the head circle */}
      <Path
        d="M 3.4 20.5 L 3.4 18.6 C 3.4 15.9 4.2 14.4 5.7 13.1 A 2.7 2.7 0 1 1 9.5 13.1 C 10.8 14.4 11.0 15.9 11.0 18.6 L 11.0 20.5 Z"
        fill={color}
      />
      {/* front-right bust — mirror of the left, bottom seam held open to 2.0 */}
      <Path
        d="M 20.6 20.5 L 20.6 18.6 C 20.6 15.9 19.8 14.4 18.3 13.1 A 2.7 2.7 0 1 1 14.5 13.1 C 13.2 14.4 13.0 15.9 13.0 18.6 L 13.0 20.5 Z"
        fill={color}
      />
    </Svg>
  );
}
