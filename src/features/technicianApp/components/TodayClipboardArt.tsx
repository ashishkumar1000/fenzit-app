/**
 * TodayClipboardArt — the compact empty-day medallion's hand-built SVG
 * (owner request 2026-11-10, replaces the lucide glyph): a clipboard
 * with a single bold tick — the confirmed "day accounted for" state,
 * distinct from TodayScheduleArt's blank unticked checklist. All blue
 * family, same drawing language as the other feature artwork.
 */
import Svg, { Path, Rect } from 'react-native-svg';
import { palette } from '../../../theme';

export function TodayClipboardArt({ size = 26 }: { size?: number }) {
  const BLUE = palette.blue600;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* the board */}
      <Rect
        x={11}
        y={8}
        width={26}
        height={34}
        rx={5}
        fill="#FFFFFF"
        stroke={BLUE}
        strokeWidth={3}
      />
      {/* the clip */}
      <Rect x={19} y={4} width={10} height={8} rx={2.5} fill={BLUE} />
      <Rect x={21.5} y={6.8} width={5} height={2.4} rx={1.2} fill="#FFFFFF" opacity={0.85} />
      {/* the tick */}
      <Path
        d="M 17.5 26.5 L 22.5 31.5 L 30.5 21"
        stroke={BLUE}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
