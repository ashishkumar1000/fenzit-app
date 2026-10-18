/**
 * HolidayIllustration — the Holidays empty-state picture: a calendar tile
 * (blue header, binder dots, a plus) resting on a tilted ghost tile, a
 * yellow sparkle badge and a green tick badge floating at its corners, all
 * on a soft blue glow. Purely decorative (hidden from screen readers) and
 * drawn in SVG with design-token colours — no image files.
 */
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors, palette } from '../../../theme';

const W = 220;
const H = 190;

export default function HolidayIllustration() {
  return (
    <Svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="holidayGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.primary} stopOpacity={0.18} />
          <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Glow */}
      <Circle cx={W / 2} cy={H / 2} r={92} fill="url(#holidayGlow)" />

      {/* Ghost tile, tilted behind */}
      <G rotation={-9} origin={`${W / 2}, ${H / 2}`}>
        <Rect
          x={52}
          y={46}
          width={116}
          height={104}
          rx={18}
          fill={colors.primarySoft}
          stroke={palette.blue200}
          strokeWidth={1.5}
        />
      </G>

      {/* Calendar tile */}
      <G rotation={4} origin={`${W / 2}, ${H / 2}`}>
        <Rect x={50} y={44} width={120} height={108} rx={18} fill={colors.surfaceCard} stroke={palette.blue200} strokeWidth={1.5} />
        <Path d="M50 62 a18 18 0 0 1 18 -18 H152 a18 18 0 0 1 18 18 V76 H50 Z" fill={colors.primary} />
        <Circle cx={72} cy={60} r={3.5} fill={colors.onPrimaryFaint} />
        <Circle cx={148} cy={60} r={3.5} fill={colors.onPrimaryFaint} />
        <Circle cx={110} cy={114} r={20} fill={colors.primarySoft} />
        <Path d="M110 104 V124 M100 114 H120" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" />
      </G>

      {/* Sparkle badge — top right */}
      <Circle cx={176} cy={42} r={17} fill={palette.amber500} opacity={0.95} />
      <Path
        d="M176 31 L179 39 L187 42 L179 45 L176 53 L173 45 L165 42 L173 39 Z"
        fill={colors.onPrimary}
      />

      {/* Tick badge — bottom left */}
      <Circle cx={40} cy={146} r={15} fill={colors.success} />
      <Path
        d="M33 146 L38 151 L47 141"
        stroke={colors.onPrimary}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Confetti dots */}
      <Circle cx={24} cy={70} r={3} fill={palette.blue200} />
      <Circle cx={196} cy={112} r={3.5} fill={palette.blue200} />
      <Circle cx={150} cy={170} r={2.5} fill={palette.amber500} opacity={0.6} />
      <Circle cx={70} cy={22} r={2.5} fill={colors.success} opacity={0.5} />
    </Svg>
  );
}
