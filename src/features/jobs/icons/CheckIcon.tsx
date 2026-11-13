// CheckIcon — "Ink-Pressure Tick": a light ribbon downstroke meeting a heavy,
// gently bowed upstroke that pools with ink at the elbow and lifts off in a
// chisel tip, so the mark reads as hand-confirmed rather than typed; shaped by
// Phosphor's hand-tuned bold/fill checks and WhatsApp's filled "confirmed" tick.
import { Svg, Path } from 'react-native-svg';

export function CheckIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Heavy upstroke: a filled wedge under pen pressure, tapering from the
          elbow (where an ink pool rounds it off) to a chisel tip. Filled on
          purpose — no stroke can vary its width along one path. */}
      <Path
        d="M9.3 14.65 C12.4 11.45 15.6 8.65 18.7 6.35 L19.7 7.45 C16.9 9.75 14.2 12.25 11.7 16.75 A1.9 1.9 0 0 1 9.3 14.65 Z"
        fill={color}
      />
      {/* Light downstroke: a thin ribbon stroke, the feathered entry of the
          same pen stroke; it dissolves into the ink pool at the elbow. */}
      <Path
        d="M4.6 9.75 C6.2 11.25 8.5 13.55 10.2 15.15"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
