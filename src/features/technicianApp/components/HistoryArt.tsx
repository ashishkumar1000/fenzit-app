/**
 * HistoryArt — the History tab's empty-state illustration: a stack of past
 * job cards (the ones behind are the history), each row already closed out —
 * green ticks for completed work, one muted red cross for cancelled — with
 * the history clock leaning on the pile. Hand-built SVG in the Fenzit
 * palette, same language as the onboarding artwork: blue does the decorative
 * work, green appears only where something is complete, and the red is the
 * brand's cancelled colour kept soft so it doesn't read as an error.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { palette, spacing } from '../../../theme';

type Props = {
  size?: number;
};

const BLUE = palette.blue600;
const BLUE_MID = palette.blue400;
const BLUE_SOFT = palette.blue300;
const BLUE_FAINT = palette.blue200;
const BLUE_BG = palette.blue50;
const BLUE_STACK = palette.blue100;
const GREEN = palette.green500;
const RED = palette.red500;
const RED_SOFT = palette.red100;

export function HistoryArt({ size = 160 }: Props) {
  return (
    // Purely decorative — screen readers skip it.
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
        {/* soft disc + dashed halo, the onboarding art's stage */}
        <Circle cx={48} cy={48} r={36} fill={BLUE_BG} />
        <Circle
          cx={48}
          cy={48}
          r={42.5}
          stroke={BLUE_FAINT}
          strokeWidth={1.6}
          strokeDasharray="3 5"
          strokeLinecap="round"
        />

        {/* the stack: earlier jobs tucked behind the front card */}
        <Rect
          x={25}
          y={21}
          width={42}
          height={50}
          rx={6}
          fill={BLUE_STACK}
          stroke={BLUE_FAINT}
          strokeWidth={1.5}
        />

        {/* the front job card, closed out */}
        <Rect
          x={30}
          y={27}
          width={42}
          height={50}
          rx={6}
          fill="#FFFFFF"
          stroke={BLUE}
          strokeWidth={2.5}
        />
        <Rect x={36} y={33.5} width={15} height={3.5} rx={1.75} fill={BLUE_SOFT} />

        {/* completed rows */}
        <Circle cx={38.5} cy={45} r={4.2} fill={GREEN} />
        <Path
          d="M36.5 45.1l1.5 1.3 2.4-2.8"
          stroke="#FFFFFF"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Rect x={45.5} y={43.4} width={19} height={3.2} rx={1.6} fill={BLUE_FAINT} />

        <Circle cx={38.5} cy={55} r={4.2} fill={GREEN} />
        <Path
          d="M36.5 55.1l1.5 1.3 2.4-2.8"
          stroke="#FFFFFF"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Rect x={45.5} y={53.4} width={15} height={3.2} rx={1.6} fill={BLUE_FAINT} />

        {/* the cancelled one, muted */}
        <Circle cx={38.5} cy={65} r={4.2} fill={RED_SOFT} />
        <Path
          d="M37 63.5l3 3M40 63.5l-3 3"
          stroke={RED}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <Rect x={45.5} y={63.4} width={10} height={3.2} rx={1.6} fill={BLUE_FAINT} />

        {/* the history clock, leaning on the pile */}
        <Circle cx={66} cy={70} r={9.5} fill={BLUE} stroke="#FFFFFF" strokeWidth={2.5} />
        <Path
          d="M66 65.8L66 70L69.4 72"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* floating accents in the gap between disc and halo */}
        <Circle cx={14} cy={28} r={2.2} fill={BLUE_MID} />
        <Circle cx={84} cy={22} r={1.8} fill={BLUE_SOFT} />
        <Circle cx={85} cy={62} r={2} fill={BLUE_FAINT} />
        <Circle cx={12} cy={62} r={1.6} fill={BLUE_SOFT} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    // Same gap the icon medallion keeps above the title.
    marginBottom: spacing.s5,
  },
});
