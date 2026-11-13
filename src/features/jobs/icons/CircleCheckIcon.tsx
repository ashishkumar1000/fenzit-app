// "Signed-off seal": a hand-wobbled wax-seal rosette — the approval-stamp
// tradition — with the check knocked clean out of it, using Material Symbols'
// check_circle knockout technique and WhatsApp's short-drop, long-tail tick
// proportions so the mark reads as stamped-and-finished, not outlined.
import { Svg, Path } from 'react-native-svg';

type Pt = { x: number; y: number };

// Check anchor points: short drop, firm vertex, long steep tail (WhatsApp
// tick proportions), all kept inside the seal's scallop valleys.
const P1: Pt = { x: 7.7, y: 12.5 };
const P2: Pt = { x: 10.9, y: 15.6 };
const P3: Pt = { x: 16.5, y: 7.9 };

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y);
  return { x: a.x / l, y: a.y / l };
};

// Constant-width band around the polyline P1→P2→P3 with mitered joins — the
// polygon the seal is cut along. Band width follows strokeWidth so the prop
// keeps meaning on a filled icon (2 → a 2.4-wide knockout, matching stroke).
function checkKnockout(hw: number): string {
  const d1 = unit(sub(P2, P1));
  const d2 = unit(sub(P3, P2));
  // Left-of-travel normals (screen y-down) = the check's upper sides.
  const n1 = { x: d1.y, y: -d1.x };
  const n2 = { x: d2.y, y: -d2.x };
  const off = (p: Pt, n: Pt, s: number): Pt => ({ x: p.x + n.x * s, y: p.y + n.y * s });
  const meet = (a: Pt, da: Pt, b: Pt, db: Pt): Pt => {
    const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / (da.x * db.y - da.y * db.x);
    return { x: a.x + da.x * t, y: a.y + da.y * t };
  };
  const inner = meet(off(P1, n1, hw), d1, off(P3, n2, hw), d2);
  const outer = meet(off(P1, n1, -hw), d1, off(P3, n2, -hw), d2);
  const pts = [
    off(P1, n1, hw),
    inner,
    off(P3, n2, hw),
    off(P3, n2, -hw),
    outer,
    off(P1, n1, -hw),
  ];
  return (
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z'
  );
}

// Ten hand-wobbled scallops: valley points nudged off a perfect 8.75-radius
// circle and bump radii varied 3.2–3.6 so the seal feels pressed by hand.
const SEAL =
  'M 12.05 3.30 ' +
  'A 3.3 3.3 0 0 1 17.15 4.90 A 3.6 3.6 0 0 1 20.35 9.30 ' +
  'A 3.2 3.2 0 0 1 20.40 14.70 A 3.5 3.5 0 0 1 17.20 19.10 ' +
  'A 3.4 3.4 0 0 1 11.95 20.75 A 3.3 3.3 0 0 1 6.85 19.15 ' +
  'A 3.6 3.6 0 0 1 3.60 14.75 A 3.2 3.2 0 0 1 3.65 9.25 ' +
  'A 3.5 3.5 0 0 1 6.80 4.85 A 3.4 3.4 0 0 1 12.05 3.30 Z';

export function CircleCheckIcon({
  size = 24,
  color = '#111827',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const hw = Math.max(strokeWidth * 0.6, 0.9);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* One evenodd fill: solid seal with the check cut out of it, so the
          check shows whatever surface the icon sits on — no white halo. */}
      <Path fill={color} fillRule="evenodd" d={`${SEAL} ${checkKnockout(hw)}`} />
    </Svg>
  );
}
