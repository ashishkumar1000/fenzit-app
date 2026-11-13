/**
 * CircleXIcon — "declined stamp": a solid rubber-stamp body, pressed a touch
 * askew, with its inner frame line and the inked X knocked clean out of it
 * (plus two small ink skips, the way real stamp ink breaks). Deliberately
 * drops the circled-X silhouette — the owner rejected that as too close to
 * stock sets. The knockout-X language comes from Phosphor's x-circle-fill and
 * Apple's xmark.circle.fill (with their breathing gap to the rim); the tilted
 * frame-and-seal composition comes from RSVP "declined" stamp marks. Reads as
 * "not happening" without the red-alert urgency of an error glyph.
 */

import { Svg, Path, Mask, G } from 'react-native-svg';

const STAMP_BODY =
  'M6 4.5 H18 A3.5 3.5 0 0 1 21.5 8 V16 A3.5 3.5 0 0 1 18 19.5 H6 A3.5 3.5 0 0 1 2.5 16 V8 A3.5 3.5 0 0 1 6 4.5 Z';

const FRAME =
  'M6 6 H18 A2 2 0 0 1 20 8 V16 A2 2 0 0 1 18 18 H6 A2 2 0 0 1 4 16 V8 A2 2 0 0 1 6 6 Z';

export function CircleXIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  // Knockouts ride on strokeWidth so the prop still tunes the mark:
  // the X stays chunky (1.3x), the frame stays fine (0.65x).
  const xWeight = strokeWidth * 1.3;
  const frameWeight = strokeWidth * 0.65;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* white = keep the stamp, black = knock the ink out of it */}
      <Mask id="declined-stamp-cut" maskUnits="userSpaceOnUse">
        <G transform="rotate(-8 12 12)">
          <Path d={STAMP_BODY} fill="white" />
          <Path
            d={FRAME}
            stroke="black"
            strokeWidth={frameWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* bowed inked X, crossing just off-centre, ends clear of the frame */}
          <Path
            d="M 8.8 9.2 Q 12.1 12.6 15.2 14.8"
            stroke="black"
            strokeWidth={xWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M 15.3 9.3 Q 12 12.4 8.7 14.7"
            stroke="black"
            strokeWidth={xWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* ink skips — short breaks in the frame line, like real stamp ink */}
          <Path
            d="M 10 6 H 11.8"
            stroke="white"
            strokeWidth={frameWeight * 1.4}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 13.4 18 H 15.4"
            stroke="white"
            strokeWidth={frameWeight * 1.4}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Mask>
      <Path d={STAMP_BODY} fill={color} mask="url(#declined-stamp-cut)" />
    </Svg>
  );
}
