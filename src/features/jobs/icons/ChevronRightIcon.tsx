// A calligraphic right-caret, drawn with ink pressure instead of a matched
// chevron pair (the "ajar door" composition was replaced — on a list row it
// read as "logout/exit", not "this opens"): one continuous lower stroke that
// sweeps up through the nose and flicks out into a curved tail, plus a
// shorter, bowed upper barb that stops just short of the nose. The asymmetry
// is the signature; at 18px muted gray it stays a whisper.
import { Svg, Path } from 'react-native-svg';

export function ChevronRightIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lower stroke: rises through the nose and flicks out into the tail. */}
      <Path
        d="M8.6 5.6 C11.4 8.5 13.4 10.9 14.1 12 C13.4 13.1 11.3 15.7 8.4 18.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Upper barb: shorter, bowed, stops just short of the nose so the
          junction reads hand-made, not machined. */}
      <Path
        d="M13.1 10.9 C13.6 11.5 13.9 11.9 14.1 12.1 C13.8 12.6 13.4 13.1 12.9 13.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
