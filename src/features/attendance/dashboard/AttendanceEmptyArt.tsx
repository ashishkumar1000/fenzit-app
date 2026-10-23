/**
 * AttendanceEmptyArt — the Today tab's "no one is on attendance" scene
 * (2026-10 owner redesign): the team around the desk — the calendar board,
 * the alarm clock, two people — drawn in the NoJobsCard line-art idiom:
 * theme blues with the single success accent, decorative only.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export function AttendanceEmptyArt() {
  return (
    <Svg width={252} height={150} viewBox="0 0 252 150">
      {/* ground */}
      <Rect x={26} y={132} width={200} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* the calendar board: header band, pin, a grid of day dots, one checked */}
      <G x={78} y={14}>
        <Rect width={96} height={86} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Path d="M0 26 H96" stroke={colors.primary} strokeOpacity={0.25} strokeWidth={2} />
        <Rect x={36} y={-6} width={24} height={12} rx={5} fill={colors.primary} fillOpacity={0.5} />
        {[0, 1, 2, 3].map(col =>
          [0, 1].map(row => (
            <Circle
              key={`${col}-${row}`}
              cx={18 + col * 20}
              cy={40 + row * 20}
              r={5}
              fill={col === 1 && row === 0 ? colors.primary : colors.primary}
              fillOpacity={col === 1 && row === 0 ? 0.7 : 0.16}
            />
          )),
        )}
      </G>
      {/* the alarm clock */}
      <Circle cx={206} cy={54} r={23} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.32} strokeWidth={2} />
      <Circle cx={206} cy={54} r={2.6} fill={colors.primary} fillOpacity={0.6} />
      <Path d="M206 54 L206 41" stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M206 54 L216 59" stroke={colors.primary} strokeOpacity={0.55} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M192 36 L188 30" stroke={colors.primary} strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" />
      <Path d="M220 36 L224 30" stroke={colors.primary} strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" />
      {/* two people at the desk: heads + rounded bodies (success + primary) */}
      <Circle cx={62} cy={78} r={11} fill={colors.success} fillOpacity={0.75} />
      <Path d="M44 132 C44 108 52 96 62 96 C72 96 80 108 80 132 Z" fill={colors.success} fillOpacity={0.3} />
      <Circle cx={104} cy={84} r={10} fill={colors.primary} fillOpacity={0.7} />
      <Path d="M88 132 C88 112 94 100 104 100 C114 100 120 112 120 132 Z" fill={colors.primary} fillOpacity={0.28} />
      {/* desk items: a sheet and a pen between the people and the board */}
      <Rect x={136} y={118} width={26} height={14} rx={3} fill={colors.primary} fillOpacity={0.14} transform="rotate(-8 149 125)" />
      <Path d="M172 130 L188 118" stroke={colors.primary} strokeOpacity={0.45} strokeWidth={3.5} strokeLinecap="round" />
      {/* sparkles */}
      <Circle cx={46} cy={38} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={236} cy={100} r={2} fill={colors.primary} fillOpacity={0.2} />
      <Circle cx={30} cy={102} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}
