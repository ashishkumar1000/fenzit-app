// "Late badge" — a solid round badge with the exclamation knocked out of it
// (leaning stem + off-axis dot, the way SF Symbols' exclamationmark.circle.fill
// and exclamationmark.badge.fill punch their mark out of a filled glyph), while
// a detached outer arc sweeps around the lower right like the last stretch of a
// clock face — the clock-plus-exclamation overdue pattern from productivity
// apps (Icons8's "Overtime" glyph), softened here so brand-blue reads "needs
// attention", not alarm-red. Build style nods to Phosphor's fully-rounded,
// fill-first warning-circle rather than a stroked ring.
import { Svg, Path } from 'react-native-svg';

export function CircleAlertIcon({ size = 24, color = '#111827', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Filled badge; the leaning stem and dot below are knocked out via evenodd */}
      <Path
        d="M 20.3 11.8 A 8.4 8.4 0 1 0 3.5 11.8 A 8.4 8.4 0 1 0 20.3 11.8 Z M 9.72 7.84 L 10.72 13.24 A 1.3 1.3 0 0 0 13.28 12.76 L 12.28 7.36 A 1.3 1.3 0 0 0 9.72 7.84 Z M 13.6 16.55 A 1.25 1.25 0 1 0 11.1 16.55 A 1.25 1.25 0 1 0 13.6 16.55 Z"
        fill={color}
        fillRule="evenodd"
      />
      {/* Detached clock-arc hugging the lower right — the overdue sweep */}
      <Path
        d="M 22.14 9.06 A 10.6 10.6 0 0 1 14.64 22.04"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
