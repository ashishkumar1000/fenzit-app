/**
 * CalendarClockIcon — a flip-calendar page bound by left-edge spiral rings whose
 * face IS the clock: an open dial arc is wound around a filled "today" date
 * square with hands rising from a filled pivot, and a dog-eared fold turns over
 * at the page's top-right — fusing the two glyphs into one face (per Google
 * Calendar's abstract date mark and Calendly's fused time mark) and deliberately
 * rejecting the corner-badge clock juxtaposed onto a pin-topped rect in Lucide's
 * CalendarClock, Material Symbols' calendar_clock and Phosphor's duotone
 * calendar-clock. Used for the Jobs page empty states.
 */
import { Svg, Path, Rect, Circle } from 'react-native-svg';

export function CalendarClockIcon({
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
      {/* flip-calendar page — its top-right corner is folded away by the dog-ear */}
      <Path
        d="M6.5 4.5 H15.8 L20.5 9.2 V17.5 A3 3 0 0 1 17.5 20.5 H6.5 A3 3 0 0 1 3.5 17.5 V7.5 A3 3 0 0 1 6.5 4.5 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* the turned-over fold, filled so it reads as lifted paper */}
      <Path
        d="M15.8 4.5 L20.5 9.2 H15.8 Z"
        fill={color}
      />
      {/* left-edge spiral rings, bulging out from the page edge */}
      <Path
        d="M4.4 5.9 C2.2 5.9 2.2 8.5 4.4 8.5 M4.4 10.4 C2.2 10.4 2.2 13.0 4.4 13.0 M4.4 14.9 C2.2 14.9 2.2 17.5 4.4 17.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* today's date — filled square the dial winds around */}
      <Rect
        x={6.6}
        y={6.6}
        width={3}
        height={3}
        rx={0.9}
        fill={color}
      />
      {/* open dial arc — its gap frames the date square, so the page itself is the clock face */}
      <Path
        d="M8.6 12.2 A4.2 4.2 0 1 1 10.9 9.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* minute hand, reaching toward 1 o'clock */}
      <Path
        d="M12.6 13.4 L13.4 10.0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* hour hand, resting toward 4 o'clock */}
      <Path
        d="M12.6 13.4 L14.8 14.9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* winding pivot */}
      <Circle
        cx={12.6}
        cy={13.4}
        r={0.9}
        fill={color}
      />
    </Svg>
  );
}
