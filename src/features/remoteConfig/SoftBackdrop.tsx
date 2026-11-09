import { StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../../theme';

/**
 * Soft decoration behind the update card: two large tinted discs in the top
 * and bottom corners, and a thin ring. Very low opacity, so text keeps its
 * contrast. Pure decoration: no touches, hidden from screen readers.
 */
export function SoftBackdrop() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
      accessible={false}>
      <G>
        <Circle cx={270} cy={-10} r={120} fill={colors.primary} fillOpacity={0.07} />
        <Circle cx={-20} cy={410} r={110} fill={colors.status.warning.solid} fillOpacity={0.09} />
        <Circle cx={300} cy={70} r={46} stroke={colors.primary} strokeOpacity={0.12} strokeWidth={2} fill="none" />
        <Circle cx={10} cy={330} r={28} fill={colors.primary} fillOpacity={0.05} />
      </G>
    </Svg>
  );
}
