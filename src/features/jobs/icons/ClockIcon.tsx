/**
 * ClockIcon — "solid face" clock: a filled disk whose elbow-shaped pill hands,
 * a six-o'clock tick and a hairline face groove are knocked out in negative
 * space (shaped by Phosphor's fill/duotone weights, SF Symbols' clock.fill and
 * delivery-app ETA sector timers — the solid silhouette keeps it readable at
 * 12px, where hairline stroke clocks collapse).
 */
import { Svg, Circle, Path } from 'react-native-svg';

export function ClockIcon({
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
      {/* bold rim — the only stroked element; carries the strokeWidth prop */}
      <Circle
        cx={12}
        cy={12}
        r={9}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* filled face with knocked-out elbow hands + six-o'clock tick (evenodd) */}
      <Path
        fill={color}
        fillRule="evenodd"
        d="M12 4.4a7.6 7.6 0 1 0 0 15.2a7.6 7.6 0 1 0 0-15.2Z M10.8 13.2 L10.8 7 A1.2 1.2 0 0 1 13.2 7 L13.2 9.6 A1.2 1.2 0 0 0 14.4 10.8 L17 10.8 A1.2 1.2 0 0 1 17 13.2 L10.8 13.2 Z M12 15.7a0.9 0.9 0 1 0 0 1.8a0.9 0.9 0 1 0 0-1.8Z"
      />
    </Svg>
  );
}
