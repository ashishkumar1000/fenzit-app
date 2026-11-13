/**
 * WrenchIcon — a filled open-end spanner biting down on a hex bolt with a
 * curved turn arrow overhead: the fastener mid-turn, so the mark reads
 * "work underway" rather than a lone tool (shaped by Phosphor's filled
 * side-view spanner, Material Symbols' build/handyman tool pairing, and
 * maintenance pictograms' bolt-plus-rotation language; deliberately unlike
 * lucide's diagonal open-jaw stroke wrench).
 */
import { Svg, Path } from 'react-native-svg';

export function WrenchIcon({ size = 24, color = '#111827', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Turn arrow: one sweeping arc around the bolt, arrowhead pointing down the rotation */}
      <Path
        d="M12.33 2.07A4.4 4.4 0 0 1 14.36 6.41"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M14.09 8.29L15.5 6.57L13.22 6.25Z" fill={color} />
      {/* Hex bolt, seated in the jaw, socket hole punched out (even-odd) */}
      <Path
        fillRule="evenodd"
        d="M10 3.1L12.34 4.45L12.34 7.15L10 8.5L7.66 7.15L7.66 4.45ZM11.15 5.8A1.15 1.15 0 0 1 8.85 5.8A1.15 1.15 0 0 1 11.15 5.8Z"
        fill={color}
      />
      {/* Spanner body: open jaw whose walls bite the bolt flanks, flowing into the handle */}
      <Path
        d="M8.45 8A3.2 3.2 0 0 0 8.95 13.82L8.95 19.5A1.05 1.05 0 0 0 11.05 19.5L11.05 13.82A3.2 3.2 0 0 0 11.55 8L11.55 8.95A1.55 1.55 0 0 1 8.45 8.95L8.45 8Z"
        fill={color}
      />
    </Svg>
  );
}
