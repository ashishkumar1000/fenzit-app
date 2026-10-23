/**
 * HolidaysEmptyArt — the wizard Holidays step's "no upcoming holidays"
 * scene (2026-10 owner redesign, same treatment as the attendance panes):
 * the calendar with a star-marked day under a little flag, drawn in the
 * NoJobsCard line-art idiom — theme blues with the single warning-gold
 * accent, decorative only.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export function HolidaysEmptyArt() {
  return (
    <Svg width={252} height={150} viewBox="0 0 252 150">
      {/* ground */}
      <Rect x={30} y={132} width={192} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* the calendar: header band, ring binders, a starred holiday cell */}
      <G x={88} y={16}>
        <Rect width={80} height={100} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Rect x={28} y={-7} width={24} height={13} rx={6} fill={colors.primary} fillOpacity={0.5} />
        <Circle cx={24} cy={4} r={3} fill={colors.primary} fillOpacity={0.4} />
        <Circle cx={56} cy={4} r={3} fill={colors.primary} fillOpacity={0.4} />
        <Path d="M0 24 H80" stroke={colors.primary} strokeOpacity={0.25} strokeWidth={2} />
        {[0, 1, 2].map(col =>
          [0, 1, 2].map(row => {
            const starred = col === 1 && row === 1;
            return (
              <Circle
                key={`${col}-${row}`}
                cx={18 + col * 22}
                cy={38 + row * 22}
                r={highlight(starred)}
                fill={colors.primary}
                fillOpacity={starred ? 0 : 0.16}
              />
            );
          }),
        )}
        {/* the starred holiday cell: gold star over a soft ring */}
        <Circle cx={40} cy={60} r={10} fill={colors.warning} fillOpacity={0.18} />
        <Path
          d="M40 53 L42.2 57.6 L47.2 58.2 L43.6 61.6 L44.6 66.6 L40 64.1 L35.4 66.6 L36.4 61.6 L32.8 58.2 L37.8 57.6 Z"
          fill={colors.warning}
        />
      </G>
      {/* the little celebration flag planted beside the calendar */}
      <Path d="M186 130 V96" stroke={colors.primary} strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />
      <Path d="M186 96 L208 102 L186 110 Z" fill={colors.success} fillOpacity={0.55} />
      {/* sparkles */}
      <Circle cx={56} cy={36} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={214} cy={64} r={2} fill={colors.warning} fillOpacity={0.4} />
      <Circle cx={44} cy={104} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}

function highlight(starred: boolean): number {
  return starred ? 10 : 5;
}
