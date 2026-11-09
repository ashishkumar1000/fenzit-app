import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme';

interface UpdateHeroIconProps {
  size?: number;
}

/**
 * Rocket for the update card: a white body with a blue porthole, two fins and
 * an amber flame. Drawn on a 32-unit grid; sits on a primary-colour tile.
 */
export function UpdateHeroIcon({ size = 32 }: UpdateHeroIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      {/* Flame */}
      <Path d="M13 22 L16 30 L19 22 Z" fill={colors.status.warning.solid} />
      {/* Fins */}
      <Path d="M10.5 17 L6 23 L10.5 22 Z" fill={colors.onPrimary} />
      <Path d="M21.5 17 L26 23 L21.5 22 Z" fill={colors.onPrimary} />
      {/* Body */}
      <Path
        d="M16 3 C21.5 7.5 22.5 13.5 21.5 21 L10.5 21 C9.5 13.5 10.5 7.5 16 3 Z"
        fill={colors.onPrimary}
      />
      {/* Porthole */}
      <Circle cx={16} cy={12} r={2.5} fill={colors.primary} />
    </Svg>
  );
}
