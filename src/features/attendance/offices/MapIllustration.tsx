/**
 * MapIllustration — a drawn city-map picture (blocks, roads, a park, a
 * pond) used in the Location card. `marker` adds the check-in rings and the
 * pin at the centre; without it the map is just a backdrop, faded so text
 * can sit on top (the "No location selected" panel). Purely decorative — the
 * rings are not to scale, the "Radius" chip carries the real value.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors, palette } from '../../../theme';

type Props = {
  /** Draw the radius rings and pin at the centre. */
  marker?: boolean;
  /** Fade the whole map into a backdrop. */
  faint?: boolean;
};

// Drawn on a 320x168 canvas; `slice` crops to whatever size the frame is.
const W = 320;
const H = 168;
const CX = W / 2;
const CY = H / 2;

const BLOCKS: [number, number, number, number][] = [
  [8, 8, 70, 44],
  [92, 8, 62, 44],
  [168, 8, 74, 44],
  [256, 8, 56, 44],
  [8, 66, 70, 36],
  [92, 66, 62, 36],
  [168, 66, 74, 36],
  [256, 66, 56, 36],
  [8, 116, 70, 44],
  [92, 116, 62, 44],
  [168, 116, 74, 44],
  [256, 116, 56, 44],
];

export default function MapIllustration({ marker = false, faint = false }: Props) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      opacity={faint ? 0.4 : 1}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Rect width={W} height={H} fill={colors.surfaceSunken} />

      {/* City blocks. */}
      <G fill={palette.gray200} opacity={0.6}>
        {BLOCKS.map(([x, y, w, h]) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={5} />
        ))}
      </G>

      {/* Park and pond. */}
      <Rect x={256} y={66} width={56} height={36} rx={6} fill={palette.green100} />
      <Path
        d="M256 124c10-8 30-8 44 0 8 6 6 22-8 26-16 4-36-2-40-12-1-6 0-10 4-14z"
        transform="translate(-236 0)"
        fill={palette.blue100}
      />

      {/* Roads: a grid, plus one diagonal avenue. */}
      <G stroke={colors.surfaceCard} strokeLinecap="round" fill="none">
        <Path d="M0 59H320" strokeWidth={9} />
        <Path d="M0 109H320" strokeWidth={6} />
        <Path d="M85 0V168" strokeWidth={9} />
        <Path d="M161 0V168" strokeWidth={6} />
        <Path d="M249 0V168" strokeWidth={9} />
        <Path d="M-10 150C80 120 190 40 330 18" strokeWidth={5} />
      </G>

      {marker ? (
        <G>
          <Circle
            cx={CX}
            cy={CY}
            r={62}
            fill={colors.primary}
            fillOpacity={0.1}
            stroke={colors.primary}
            strokeOpacity={0.5}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <Circle
            cx={CX}
            cy={CY}
            r={34}
            fill={colors.primary}
            fillOpacity={0.2}
            stroke={colors.primary}
            strokeWidth={1.5}
          />
          <Circle cx={CX} cy={CY} r={9} fill={colors.primary} stroke={colors.surfaceCard} strokeWidth={3} />
        </G>
      ) : null}
    </Svg>
  );
}
