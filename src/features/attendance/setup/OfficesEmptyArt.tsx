/**
 * OfficesEmptyArt — the wizard Offices step's "no offices yet" scene
 * (2026-10 owner redesign, same treatment as the attendance panes): the
 * map card with its route and the big location pin, drawn in the
 * NoJobsCard line-art idiom — theme blues with the single success
 * accent, decorative only.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export function OfficesEmptyArt() {
  return (
    <Svg width={252} height={150} viewBox="0 0 252 150">
      {/* ground */}
      <Rect x={30} y={132} width={192} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* the map card: folded in three, a dashed route across it */}
      <G x={66} y={34}>
        <Rect width={120} height={78} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Path d="M40 0 V78 M80 0 V78" stroke={colors.primary} strokeOpacity={0.16} strokeWidth={2} />
        <Path
          d="M14 58 C30 58 26 24 46 24 C64 24 58 50 78 50 C94 50 96 30 106 26"
          stroke={colors.primary}
          strokeOpacity={0.4}
          strokeWidth={2.5}
          strokeDasharray="5 5"
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={14} cy={58} r={4.5} fill={colors.primary} fillOpacity={0.3} />
        <Circle cx={106} cy={26} r={4.5} fill={colors.success} fillOpacity={0.7} />
      </G>
      {/* the location pin over the card */}
      <Path
        d="M126 22 C111 22 100 33 100 48 C100 62 114 74 126 86 C138 74 152 62 152 48 C152 33 141 22 126 22 Z"
        fill={colors.primarySoft}
        stroke={colors.primary}
        strokeOpacity={0.55}
        strokeWidth={2.5}
      />
      <Circle cx={126} cy={47} r={9} fill={colors.primary} fillOpacity={0.75} />
      {/* sparkles */}
      <Circle cx={54} cy={34} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={216} cy={60} r={2} fill={colors.primary} fillOpacity={0.2} />
      <Circle cx={46} cy={106} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}
