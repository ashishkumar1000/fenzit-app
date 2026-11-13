/**
 * BellIcon — an ink-filled hand bell caught mid-ring: tipped eight degrees with
 * the clapper ball swung to the strike side and two sound dashes flying off the
 * raised shoulder, its left shoulder carrying a hand-cut comma highlight
 * (silhouette lessons from Phosphor's fill/bell-ringing, Heroicons' solid bell
 * and SF Symbols' bell.fill; every path drawn from scratch).
 */
import { Svg, G, Path } from 'react-native-svg';

export function BellIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Sound dashes: two hand-cut strokes arcing away from the raised (right) shoulder */}
      <Path
        d="M16.2 4C17.9 4.5 19.2 5.6 19.9 7.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M19.3 2.2C20.9 2.8 22 4.1 22.5 6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Tipped bell: solid ink body with the comma highlight as a true evenodd hole (header colour shows through on any background), clapper swung toward the strike side */}
      <G transform="rotate(-8 12 12.5)">
        <Path
          d="M12 3.4C9.2 3.4 7.15 5.35 7.05 8.15C6.95 10.95 6.35 13.75 5.25 15.55C4.85 16.2 4.95 16.75 5.6 16.95L18.4 16.95C19.05 16.75 19.15 16.2 18.75 15.55C17.65 13.75 17.05 10.95 16.95 8.15C16.85 5.35 14.8 3.4 12 3.4Z M10.1 6.2C8.9 6.9 8.35 8.35 8.45 10C8.5 10.85 9.7 10.85 9.75 10C9.85 8.6 10.3 7.45 11.15 6.75C11.9 6.15 10.95 5.7 10.1 6.2Z"
          fill={color}
          fillRule="evenodd"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <Path
          d="M11.4 19.6a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z"
          fill={color}
        />
      </G>
    </Svg>
  );
}
