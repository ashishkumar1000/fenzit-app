import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../../theme';

interface ExpiredHeroIconProps {
  size?: number;
}

/**
 * Hourglass with sand in the lower bulb: the "time has run out" mark on the
 * subscription-expired card. Drawn in the warning family, 32 units square.
 */
export function ExpiredHeroIcon({ size = 32 }: ExpiredHeroIconProps) {
  const stroke = colors.status.warning.fg;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      {/* Top and bottom caps */}
      <Rect x={8} y={3} width={16} height={3} rx={1.5} fill={stroke} />
      <Rect x={8} y={26} width={16} height={3} rx={1.5} fill={stroke} />
      {/* Glass bulbs */}
      <Path
        d="M10 6 C10 13, 15 15, 16 16 C17 15, 22 13, 22 6 Z"
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M10 26 C10 19, 15 17, 16 16 C17 17, 22 19, 22 26 Z"
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Sand in the lower bulb */}
      <Path d="M12.5 23.5 L19.5 23.5 L16 19 Z" fill={colors.status.warning.solid} />
      {/* Falling grain from the neck */}
      <Rect x={15.25} y={16} width={1.5} height={2.5} rx={0.75} fill={colors.status.warning.solid} />
    </Svg>
  );
}
