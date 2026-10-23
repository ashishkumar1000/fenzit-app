/**
 * MonthlyEmptyArt — the Monthly tab pane's "nothing to review" scene
 * (2026-10 owner redesign, same treatment as the Today pane): a month
 * sheet with its day grid between the month chevrons, drawn in the
 * NoJobsCard line-art idiom — theme blues, decorative only.
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../../../theme';

export function MonthlyEmptyArt() {
  return (
    <Svg width={252} height={150} viewBox="0 0 252 150">
      {/* ground */}
      <Rect x={30} y={132} width={192} height={2} rx={1} fill={colors.primary} fillOpacity={0.08} />
      {/* the month sheet: header band + day grid, one day highlighted */}
      <G x={82} y={14}>
        <Rect width={88} height={104} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.3} strokeWidth={2} />
        <Rect x={32} y={-6} width={24} height={12} rx={5} fill={colors.primary} fillOpacity={0.5} />
        <Path d="M0 24 H88" stroke={colors.primary} strokeOpacity={0.25} strokeWidth={2} />
        {[0, 1, 2, 3].map(col =>
          [0, 1, 2].map(row => {
            const highlighted = col === 2 && row === 1;
            return (
              <Circle
                key={`${col}-${row}`}
                cx={16 + col * 19}
                cy={38 + row * 20}
                r={highlighted ? 7 : 5}
                fill={colors.primary}
                fillOpacity={highlighted ? 0.7 : 0.16}
              />
            );
          }),
        )}
      </G>
      {/* the month chevrons either side */}
      <Path d="M52 62 L40 74 L52 86" stroke={colors.primary} strokeOpacity={0.45} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M200 62 L212 74 L200 86" stroke={colors.primary} strokeOpacity={0.45} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* a tracked-day tick floating off the sheet (the review that will come) */}
      <Circle cx={196} cy={34} r={11} fill={colors.success} fillOpacity={0.25} />
      <Path d="M191 34 L195 38 L202 30" stroke={colors.success} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* sparkles */}
      <Circle cx={52} cy={30} r={2.5} fill={colors.primary} fillOpacity={0.25} />
      <Circle cx={224} cy={104} r={2} fill={colors.primary} fillOpacity={0.2} />
      <Circle cx={40} cy={106} r={2} fill={colors.primary} fillOpacity={0.18} />
    </Svg>
  );
}
