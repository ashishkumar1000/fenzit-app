/**
 * Background patterns for `GradientSurface` — each is a set of SVG shapes
 * drawn on top of the gradient, faint enough that white text stays legible.
 *  - `pulse`: two soft waves along the bottom and a fading dot grid in the
 *    top-right corner (the Home attendance "pulse").
 *  - `festive`: a sunburst of rays behind the top-right corner with a ring
 *    around it, plus scattered four-point sparkles and dots (holidays).
 *  - `map`: a dashed route running to a marker ringed like a check-in radius,
 *    over faint map-grid lines on the right (the Offices "Add office" banner).
 */
import { Circle, G, Line, Path } from 'react-native-svg';
import { colors, spacing } from '../../theme';

export type SurfacePattern = 'pulse' | 'festive' | 'map';

type Size = { width: number; height: number };

// --- pulse ---------------------------------------------------------------

const DOT_COLS = 8;
const DOT_ROWS = 5;
const DOT_GAP = 16;
const DOTS = Array.from({ length: DOT_COLS * DOT_ROWS }, (_, i) => {
  const col = i % DOT_COLS;
  const row = Math.floor(i / DOT_COLS);
  const away = (col + row) / (DOT_COLS + DOT_ROWS - 2);
  return { col, row, opacity: 0.32 * (1 - away) };
});

function wavePath(width: number, height: number, base: number, amp: number, phase: number) {
  const y = height * base;
  const step = width / 2;
  return (
    `M0 ${y + phase} ` +
    `C${step * 0.5} ${y - amp} ${step * 0.9} ${y + amp} ${step} ${y + phase} ` +
    `S${step * 1.6} ${y - amp} ${width} ${y - phase} ` +
    `L${width} ${height} L0 ${height} Z`
  );
}

export function PulsePattern({ width, height }: Size) {
  return (
    <G>
      <Path d={wavePath(width, height, 0.62, 18, 6)} fill={colors.onPrimary} fillOpacity={0.05} />
      <Path d={wavePath(width, height, 0.8, 14, -4)} fill={colors.onPrimary} fillOpacity={0.05} />
      {DOTS.map(({ col, row, opacity }) => (
        <Circle
          key={`${col}-${row}`}
          cx={width - spacing.s4 - col * DOT_GAP}
          cy={spacing.s4 + row * DOT_GAP}
          r={1.6}
          fill={colors.onPrimary}
          fillOpacity={opacity}
        />
      ))}
    </G>
  );
}

// --- festive -------------------------------------------------------------

const RAYS = 16;

/** A four-point sparkle centred on (cx, cy), `r` from centre to tip. */
function sparkle(cx: number, cy: number, r: number) {
  const k = r * 0.28;
  return (
    `M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} ` +
    `L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k} Z`
  );
}

// --- map -----------------------------------------------------------------

const MAP_RINGS = [16, 32, 48];
const GRID_LINES = 5;

export function MapPattern({ width, height }: Size) {
  // Marker: right side, vertically centred — clear of the left-aligned text.
  const mx = width - spacing.s6 - 24;
  const my = height / 2;
  const startX = width * 0.6;
  const route =
    `M${startX} ${height - 8} ` +
    `C${startX + 30} ${height * 0.75} ${mx - 60} ${my + 34} ${mx - 28} ${my + 14} ` +
    `S${mx - 8} ${my + 6} ${mx} ${my}`;
  return (
    <G>
      {Array.from({ length: GRID_LINES }, (_, i) => {
        const x = width * 0.6 + (i * (width * 0.4)) / (GRID_LINES - 1);
        return (
          <Line
            key={i}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={colors.onPrimary}
            strokeOpacity={0.06}
            strokeWidth={1}
          />
        );
      })}
      {[0.33, 0.66].map(f => (
        <Line
          key={f}
          x1={width * 0.6}
          y1={height * f}
          x2={width}
          y2={height * f}
          stroke={colors.onPrimary}
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      ))}
      <Path
        d={route}
        fill="none"
        stroke={colors.onPrimary}
        strokeOpacity={0.3}
        strokeWidth={2}
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {MAP_RINGS.map((r, i) => (
        <Circle
          key={r}
          cx={mx}
          cy={my}
          r={r}
          fill="none"
          stroke={colors.onPrimary}
          strokeOpacity={0.2 - i * 0.06}
          strokeWidth={1.5}
        />
      ))}
      <Circle cx={mx} cy={my} r={5} fill={colors.onPrimary} fillOpacity={0.45} />
    </G>
  );
}

export function FestivePattern({ width, height }: Size) {
  // Burst centre: where the date badge sits (top-right, inset by the padding).
  const cx = width - spacing.s4 - 32;
  const cy = spacing.s4 + 38;
  return (
    <G>
      {Array.from({ length: RAYS }, (_, i) => {
        const a = (i / RAYS) * Math.PI * 2;
        const [r1, r2] = i % 2 === 0 ? [46, 92] : [46, 70];
        return (
          <Line
            key={i}
            x1={cx + Math.cos(a) * r1}
            y1={cy + Math.sin(a) * r1}
            x2={cx + Math.cos(a) * r2}
            y2={cy + Math.sin(a) * r2}
            stroke={colors.onPrimary}
            strokeOpacity={0.14}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={104} fill="none" stroke={colors.onPrimary} strokeOpacity={0.07} strokeWidth={1.5} />
      <Path d={sparkle(width * 0.5, height * 0.22, 7)} fill={colors.onPrimary} fillOpacity={0.22} />
      <Path d={sparkle(width * 0.12, height * 0.55, 4)} fill={colors.onPrimary} fillOpacity={0.16} />
      <Path d={sparkle(width * 0.92, height * 0.9, 6)} fill={colors.onPrimary} fillOpacity={0.2} />
      <Circle cx={width * 0.68} cy={height * 0.8} r={2.5} fill={colors.onPrimary} fillOpacity={0.16} />
    </G>
  );
}
