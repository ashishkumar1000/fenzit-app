/**
 * ContactCardIcon — a contact card with a binder tab on top and a person
 * inside. Drawn in-house so the picker icon matches the Fenzit look (outline,
 * round caps) without relying on a general icon set.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
  strokeWidth?: number;
};

export function ContactCardIcon({ size = 22, color, strokeWidth = 2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Card body */}
      <Rect
        x={3}
        y={4}
        width={18}
        height={17}
        rx={3}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      {/* Binder tab on top */}
      <Path
        d="M9 2.5h6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Person: head */}
      <Circle cx={12} cy={10.5} r={2.5} stroke={color} strokeWidth={strokeWidth} />
      {/* Person: shoulders */}
      <Path
        d="M7.5 17.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
