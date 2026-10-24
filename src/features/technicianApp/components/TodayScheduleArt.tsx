/**
 * TodayScheduleArt — the empty-day medallion's hand-built SVG (the
 * approved redesign): an empty clipboard — a fresh checklist with no
 * ticks, waiting for the day's assignments. All blue family (green
 * stays for completed work), in the same language as the other feature
 * artwork.
 */
import Svg, { Circle, Rect } from 'react-native-svg';
import { palette } from '../../../theme';

export function TodayScheduleArt({ size = 40 }: { size?: number }) {
  const BLUE = palette.blue600;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* the board */}
      <Rect
        x={10}
        y={8}
        width={28}
        height={34}
        rx={5}
        fill="#FFFFFF"
        stroke={BLUE}
        strokeWidth={2.5}
      />
      {/* the clip */}
      <Rect x={18} y={4} width={12} height={8} rx={2.5} fill={BLUE} />
      <Rect x={21} y={6.8} width={6} height={2.4} rx={1.2} fill="#FFFFFF" opacity={0.85} />
      {/* the blank rows — bullets and bars, deliberately unticked */}
      <Circle cx={15.5} cy={20} r={2.2} fill={palette.blue300} />
      <Rect x={20.5} y={18.4} width={13} height={3.2} rx={1.6} fill={palette.blue200} />
      <Circle cx={15.5} cy={28} r={2.2} fill={palette.blue200} />
      <Rect x={20.5} y={26.4} width={9} height={3.2} rx={1.6} fill={palette.blue200} />
      <Circle cx={15.5} cy={36} r={2.2} fill={palette.blue200} />
      <Rect x={20.5} y={34.4} width={13} height={3.2} rx={1.6} fill={palette.blue100} />
    </Svg>
  );
}
