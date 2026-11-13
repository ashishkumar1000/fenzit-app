// Job-sheet still life: a work-order page torn from a pad (sawtooth tear,
// after the perforated-edge ticket glyphs in Phosphor/Tabler) with three
// uneven ink dashes on it — the last barely started — and a pen resting
// across the pad's corner, nib filled, waiting to write the next line.
// The single-element-silhouette tip from Bas Milius's clipboard icon
// writing (via Noun Project's icon-craft notes) shapes the torn edge:
// no clip at all, so it never reads as a generic clipboard.
import { Svg, Path } from 'react-native-svg';

export function ClipboardListIcon({
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
      {/* sheet torn from the pad: ragged top edge, rounded bottom corners */}
      <Path
        d="M5 19.5 V8.2 l1.2 -1.5 1.6 1.5 1.2 -1.5 1.6 1.5 1.2 -1.5 1.6 1.5 1.2 -1.5 1.6 1.5 1.2 -1.5 1.6 1.5 V19.5 a2 2 0 0 1 -2 2 H7 a2 2 0 0 1 -2 -2 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* ink dashes — uneven lengths, the last one just begun */}
      <Path
        d="M8.5 11.75 H14.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M8.5 15 H11.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M8.5 18 H10.75"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* pen resting across the pad's corner, nib pointing at the dashes */}
      <Path
        d="M12.7 16.9 L14.94 17.16 L20.99 21.03 L19.81 22.77 L13.76 18.9 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* filled nib — the only solid shape, the pen's point of intent */}
      <Path
        d="M12.7 16.9 L14.94 17.16 L13.76 18.9 Z"
        fill={color}
      />
      {/* cap ring near the pen tail */}
      <Path
        d="M19.67 20.13 L18.49 21.87"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
