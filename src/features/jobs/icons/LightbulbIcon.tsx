/**
 * LightbulbIcon — "the tip is a spark caught inside solid glass": a fully
 * filled bulb with a four-point spark knocked out of it as negative space,
 * floating over a single detached base bar. Shaped by Phosphor's fill bulb
 * (knocked-out interior, lightbulb-fill's arc / lightbulb-filament-fill's
 * stem), Material Symbols' tips_and_updates sparkle, and SF Symbols'
 * lightbulb.fill — but where all three keep the filament, this icon drops
 * the wire entirely and lets the spark be the idea.
 */
import { Svg, Path } from 'react-native-svg';

export function LightbulbIcon({
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
      {/* solid glass with the spark cut out of it (one path, evenodd = hole) */}
      <Path
        d="M12 2.25 A7.25 7.25 0 0 0 4.75 9.5 C4.75 11.7 5.8 13.5 7.6 14.9 L8.1 16.4 Q8.3 17.2 9.1 17.2 L14.9 17.2 Q15.7 17.2 15.9 16.4 L16.4 14.9 C18.2 13.5 19.25 11.7 19.25 9.5 A7.25 7.25 0 0 0 12 2.25 Z M12 5.4 Q13 8.3 16 9.4 Q13 10.5 12 13.4 Q11 10.5 8 9.4 Q11 8.3 12 5.4 Z"
        fill={color}
        fillRule="evenodd"
      />
      {/* single detached base bar — no screw threads, just the socket edge */}
      <Path
        d="M7.5 20.5 L16.5 20.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
