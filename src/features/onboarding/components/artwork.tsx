/**
 * Onboarding artwork — hand-built SVG illustrations in the Fenzit palette,
 * one grade above line icons: layered shapes, soft fills, small accent dots.
 *
 * Colour rule (design-system discipline): the BLUE family does all the
 * decorative work; GREEN appears only where something is verified/complete
 * (check marks and seals); amber is never used here — it means "scheduled".
 *
 * All pure react-native-svg, sized via the `size` prop, no assets to load.
 */
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { palette } from '../../../theme';

type ArtProps = {
  size?: number;
};

const BLUE = palette.blue600;
const BLUE_DK = palette.blue800;
const BLUE_MID = palette.blue500;
const BLUE_LT = palette.blue400;
const BLUE_SOFT = palette.blue300;
const BLUE_BG = palette.blue50;
const GREEN = palette.green500;
const GREEN_DK = palette.green700;
const INK = palette.gray700;

/** Attendance: a map pin with a check, inside a dashed geofence ring. */
export function CheckInArt({ size = 52 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Circle cx={24} cy={24} r={20} stroke={BLUE_SOFT} strokeWidth={1.6} strokeDasharray="3 4.5" strokeLinecap="round" />
      <Circle cx={24} cy={24} r={14.5} fill={BLUE_BG} />
      <Path
        d="M24 11c-5 0-9 3.9-9 8.8 0 6.4 9 15.2 9 15.2s9-8.8 9-15.2c0-4.9-4-8.8-9-8.8z"
        fill={BLUE}
      />
      <Circle cx={24} cy={20} r={4.6} fill="#FFFFFF" />
      <Path
        d="M21.8 20.1l1.7 1.7 3-3.4"
        stroke={GREEN}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={39} cy={10} r={2.6} fill={BLUE_LT} />
      <Circle cx={9} cy={34} r={1.8} fill={BLUE_SOFT} />
    </Svg>
  );
}

/** Job steps: a phone with a dotted route from a start dot to a destination pin. */
export function NavigateArt({ size = 52 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect x={13} y={5} width={22} height={38} rx={5} fill="#FFFFFF" stroke={BLUE} strokeWidth={2} />
      <Rect x={17} y={10} width={14} height={26} rx={2.5} fill={BLUE_BG} />
      <Path
        d="M23 33c0-5 6-4.5 6-9 0-2.6-1.8-3.4-3-4"
        stroke={BLUE_LT}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="0.1 5"
      />
      <Circle cx={23} cy={33.5} r={2.4} fill={BLUE_MID} />
      <Path
        d="M26 11.5c-2.6 0-4.6 2-4.6 4.5 0 3.2 4.6 7.6 4.6 7.6s4.6-4.4 4.6-7.6c0-2.5-2-4.5-4.6-4.5z"
        fill={BLUE_DK}
      />
      <Circle cx={26} cy={16} r={1.7} fill="#FFFFFF" />
      <Circle cx={40} cy={40} r={2.6} fill={BLUE_SOFT} />
      <Circle cx={7} cy={12} r={1.8} fill={BLUE_LT} />
    </Svg>
  );
}

/** Proof: a photo card with mountains, a signature card, and a verified seal. */
export function ProofArt({ size = 52 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect x={6} y={7} width={25} height={20} rx={3.5} fill={BLUE_BG} stroke={BLUE} strokeWidth={2} />
      <Circle cx={13.5} cy={13.5} r={2.1} fill={palette.blue200} />
      <Path d="M10 24l6-7.5 4.2 5 3-3.6 4.8 6.1H10z" fill={BLUE_LT} />
      <Rect x={21} y={24} width={21} height={16} rx={3.5} fill="#FFFFFF" stroke={GREEN_DK} strokeWidth={2} />
      <Path
        d="M25 34.5c1.6-3.6 3.2 1.6 4.8-1 1.5-2.6 2.6 1 4.2-1.6 1-1.6 2.3-.4 3.6-.9"
        stroke={INK}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={13} cy={36} r={6.2} fill={GREEN} />
      <Path
        d="M10.2 36l2 2 3.6-4"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Permissions header: a layered shield with a check, on a soft ring. */
export function ShieldArt({ size = 72 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx={32} cy={32} r={28} fill={BLUE_BG} />
      <Circle cx={32} cy={32} r={28} stroke={palette.blue200} strokeWidth={1.6} strokeDasharray="3 5" strokeLinecap="round" />
      <Defs>
        <LinearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BLUE} />
          <Stop offset="1" stopColor={BLUE_DK} />
        </LinearGradient>
      </Defs>
      <Path
        d="M32 10l14 5v12.5C46 38 40 45.5 32 49c-8-3.5-14-11-14-21.5V15l14-5z"
        fill="url(#shieldGrad)"
      />
      <Path
        d="M25.5 31.5l4.6 4.6 8.4-9.4"
        stroke="#FFFFFF"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={51} cy={14} r={2.4} fill={BLUE_LT} />
      <Circle cx={12} cy={20} r={1.8} fill={BLUE_SOFT} />
    </Svg>
  );
}

/** Permissions row: location pin with a partial geofence arc. */
export function LocationArt({ size = 44 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 6c-7.2 0-13 5.6-13 12.6C11 27.9 24 42 24 42s13-14.1 13-23.4C37 11.6 31.2 6 24 6z"
        fill={BLUE}
      />
      <Circle cx={24} cy={18.5} r={5} fill="#FFFFFF" />
      <Circle cx={24} cy={18.5} r={2} fill={BLUE_MID} />
      <Path
        d="M8 20a16.2 16.2 0 0132 0"
        stroke={BLUE_SOFT}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeDasharray="3 5"
      />
    </Svg>
  );
}

/** Permissions row: a friendly camera with lens and flash dot. */
export function CameraArt({ size = 44 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M17 13l2.6-4.4h8.8L31 13h-14z" fill={BLUE_DK} />
      <Rect x={6} y={13} width={36} height={26} rx={6} fill={BLUE} />
      <Circle cx={24} cy={26} r={8.4} fill="#FFFFFF" />
      <Circle cx={24} cy={26} r={4.6} fill={BLUE_LT} />
      <Circle cx={36.5} cy={19} r={2.2} fill={palette.blue200} />
      <Rect x={10} y={17} width={5} height={3} rx={1.5} fill={palette.blue200} />
    </Svg>
  );
}

/** Role pick — owner: a shopfront with awning and a pennant flag. */
export function OwnerArt({ size = 44 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M24 4v7" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <Path d="M24 4l8 2.5-8 2.5V4z" fill={BLUE_LT} />
      <Rect x={10} y={19} width={28} height={22} rx={2.5} fill="#FFFFFF" stroke={BLUE} strokeWidth={2} />
      <Rect x={7} y={12} width={34} height={7.5} rx={2} fill={BLUE} />
      <Rect x={13.5} y={12} width={4} height={7.5} fill="#FFFFFF" opacity={0.85} />
      <Rect x={22} y={12} width={4} height={7.5} fill="#FFFFFF" opacity={0.85} />
      <Rect x={30.5} y={12} width={4} height={7.5} fill="#FFFFFF" opacity={0.85} />
      <Rect x={15} y={27} width={7.5} height={14} rx={1.5} fill={BLUE_LT} />
      <Rect x={26.5} y={27} width={8.5} height={7} rx={1.5} fill={BLUE_BG} stroke={BLUE} strokeWidth={1.6} />
      <Circle cx={40} cy={40} r={2.4} fill={palette.blue200} />
    </Svg>
  );
}

/** Role pick — staff: a hard hat with a verified check seal. */
export function StaffArt({ size = 44 }: ArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M10 29a14 14 0 0128 0v1H10v-1z" fill={BLUE} />
      <Rect x={21.5} y={11} width={5} height={13} rx={2} fill={BLUE_DK} />
      <Rect x={6.5} y={30} width={35} height={4.5} rx={2.25} fill={BLUE_DK} />
      <Circle cx={35} cy={36} r={6.4} fill={GREEN} />
      <Path
        d="M32.2 36l2 2 3.6-4.2"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9} cy={12} r={1.8} fill={BLUE_LT} />
    </Svg>
  );
}

/**
 * Journey band for the role picker: the shop, the service van carrying a
 * job, and the destination pin — the whole Fenzit day on one road.
 */
export function JourneyArt() {
  return (
    <Svg
      width="100%"
      height={128}
      viewBox="0 0 320 128"
      fill="none"
      preserveAspectRatio="xMidYMid meet">
      {/* the road */}
      <Path d="M8 112H312" stroke={BLUE_SOFT} strokeWidth={2} strokeLinecap="round" />

      {/* shop */}
      <Rect x={24} y={60} width={62} height={52} rx={3} fill="#FFFFFF" stroke={BLUE} strokeWidth={2.5} />
      <Path
        d="M18 46h74v9a9.25 8 0 0 1-18.5 0a9.25 8 0 0 1-18.5 0a9.25 8 0 0 1-18.5 0a9.25 8 0 0 1-18.5 0Z"
        fill={BLUE_BG}
        stroke={BLUE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Rect x={48} y={84} width={16} height={28} rx={2} fill={BLUE_BG} stroke={BLUE} strokeWidth={2} />
      <Rect x={30} y={70} width={12} height={12} rx={2} fill="#FFFFFF" stroke={BLUE_LT} strokeWidth={2} />
      <Rect x={68} y={70} width={12} height={12} rx={2} fill="#FFFFFF" stroke={BLUE_LT} strokeWidth={2} />
      <Path d="M55 46V28" stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M55 28l15 4.5-15 4.5Z" fill={BLUE_LT} />

      {/* van, rolling in */}
      <Path d="M108 92h11" stroke={BLUE_SOFT} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M102 101h13" stroke={BLUE_SOFT} strokeWidth={2.5} strokeLinecap="round" />
      <Rect x={128} y={74} width={54} height={32} rx={4} fill="#FFFFFF" stroke={BLUE} strokeWidth={2.5} />
      <Path
        d="M182 84h12a3 3 0 0 1 2.2 1l9.4 10.4a3 3 0 0 1 .8 2v5.6a3 3 0 0 1-3 3h-21.4Z"
        fill={BLUE_BG}
        stroke={BLUE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <Rect x={186} y={88} width={10} height={8} rx={1.5} fill="#FFFFFF" stroke={BLUE_LT} strokeWidth={2} />
      <Circle cx={144} cy={105} r={7} fill={BLUE_DK} />
      <Circle cx={144} cy={105} r={2.6} fill="#FFFFFF" />
      <Circle cx={192} cy={105} r={7} fill={BLUE_DK} />
      <Circle cx={192} cy={105} r={2.6} fill="#FFFFFF" />
      <Circle cx={155} cy={90} r={9} fill={BLUE_BG} stroke={BLUE} strokeWidth={2} />
      <Path
        d="m150.8 90 3.1 3.1 5.8-6.4"
        stroke={BLUE}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* destination pin */}
      <Path
        d="M262 72c-8.8 0-14.7 6.4-14.7 14.2 0 10.4 14.7 22.6 14.7 22.6s14.7-12.2 14.7-22.6C276.7 78.4 270.8 72 262 72Z"
        fill={BLUE}
      />
      <Circle cx={262} cy={86.5} r={4.6} fill="#FFFFFF" />
      <Circle cx={234} cy={58} r={2.4} fill={BLUE_SOFT} />
      <Circle cx={294} cy={92} r={2} fill={BLUE_LT} />
    </Svg>
  );
}
