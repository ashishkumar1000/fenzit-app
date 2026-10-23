/**
 * LeaveEmptyArt — the Leave tab pane's "no requests" scene (2026-10 owner
 * redesign, same treatment as the Today and Monthly panes): a leave slip
 * with its day rows and an approved-tick seal under a calm sun, drawn in
 * the NoJobsCard line-art idiom — theme blues with the single success
 * accent, decorative only.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export function LeaveEmptyArt() {
  return (
    <Svg width={252} height={150} viewBox="0 0 252 150">
      {/* ground */}
      <Rect x={30} y={132} width={192} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* the calm sun */}
      <Circle cx={200} cy={40} r={18} fill={colors.warning} fillOpacity={0.2} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
        <Path
          key={deg}
          d={`M200 16 L200 10`}
          stroke={colors.warning}
          strokeOpacity={0.5}
          strokeWidth={3}
          strokeLinecap="round"
          transform={`rotate(${deg} 200 40)`}
        />
      ))}
      {/* the leave slip: header band, day rows, a decided tick */}
      <G x={86} y={16}>
        <Rect width={80} height={106} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Rect x={30} y={-6} width={20} height={12} rx={5} fill={colors.primary} fillOpacity={0.5} />
        {[26, 44, 62, 80].map((y, i) => (
          <G key={y}>
            <Circle cx={20} cy={y} r={4.5} fill={colors.primary} fillOpacity={i === 0 ? 0.6 : 0.2} />
            <Rect x={31} y={y - 3} width={i === 1 ? 26 : 32} height={5} rx={2.5} fill={colors.primary} fillOpacity={0.16} />
          </G>
        ))}
      </G>
      {/* the approved-tick seal overlapping the slip */}
      <Circle cx={172} cy={100} r={15} fill={colors.success} fillOpacity={0.28} />
      <Path d="M165 100 L170 105 L180 94" stroke={colors.success} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* sparkles */}
      <Circle cx={54} cy={34} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={226} cy={104} r={2} fill={colors.primary} fillOpacity={0.2} />
      <Circle cx={42} cy={104} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}
