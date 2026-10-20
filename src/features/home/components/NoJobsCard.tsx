/**
 * NoJobsCard — the "Today's jobs" empty state on Home. Kept light: a barely
 * there dot grid across the whole card, soft rings spreading from behind a
 * clipboard (a short checklist) that stands in for the old
 * calendar icon. All the art is one SVG behind the text — decorative, never
 * carrying meaning.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  /** Drives the hint: assign a job, or add a technician first. */
  hasTechnicians: boolean;
  /** False for a viewer: no create hint, since they cannot create jobs. Default true. */
  canWrite?: boolean;
};

const DOT_GAP = 18;
const CLIP_W = 64;
const CLIP_H = 78;

function Backdrop({ width, height }: { width: number; height: number }) {
  const cols = Math.ceil(width / DOT_GAP);
  const rows = Math.ceil(height / DOT_GAP);
  const cx = width / 2;
  const clipTop = spacing.s5;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <Circle
          key={i}
          cx={DOT_GAP / 2 + (i % cols) * DOT_GAP}
          cy={DOT_GAP / 2 + Math.floor(i / cols) * DOT_GAP}
          r={1.2}
          fill={colors.primary}
          fillOpacity={0.09}
        />
      ))}
      {[56, 92, 130, 172].map((r, i) => (
        <Circle
          key={r}
          cx={cx}
          cy={clipTop + CLIP_H / 2}
          r={r}
          fill="none"
          stroke={colors.primary}
          strokeOpacity={0.1 - i * 0.02}
          strokeWidth={1}
        />
      ))}

      {/* Clipboard: board, clip, three checklist rows. */}
      <G x={cx - CLIP_W / 2} y={clipTop}>
        <Rect width={CLIP_W} height={CLIP_H} rx={12} fill={colors.surfaceCard} stroke={colors.primary} strokeOpacity={0.22} strokeWidth={1.5} />
        <Rect x={20} y={-6} width={24} height={12} rx={5} fill={colors.primary} fillOpacity={0.55} />
        {[0, 1, 2].map(row => (
          <G key={row} y={22 + row * 16}>
            <Circle cx={16} cy={5} r={4.5} fill="none" stroke={colors.primary} strokeOpacity={0.4} strokeWidth={1.5} />
            <Rect x={27} y={2.5} width={row === 1 ? 20 : 26} height={5} rx={2.5} fill={colors.primary} fillOpacity={0.18} />
          </G>
        ))}
      </G>
    </Svg>
  );
}

export function NoJobsCard({ hasTechnicians, canWrite = true }: Props) {
  // The SVG needs pixel sizes — measure the card, draw to fit.
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <Card padding="none" style={styles.card}>
      <View onLayout={e => setSize(e.nativeEvent.layout)} style={styles.body}>
        {size.width > 0 ? <Backdrop width={size.width} height={size.height} /> : null}
        <View style={styles.art} />
        <Text style={styles.title}>No jobs yet</Text>
        <Text style={styles.hint}>
          {!canWrite
            ? 'Jobs your team creates will show up here.'
            : hasTechnicians
              ? 'Create your first job to assign it to a technician.'
              : 'Add a technician first, then you can create and assign jobs.'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  body: {
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s6,
  },
  // Room for the clipboard the backdrop draws (top inset + board).
  art: {
    height: spacing.s5 + CLIP_H + spacing.s3,
  },
  title: {
    ...typography.heading,
    fontSize: 16,
    color: colors.textStrong,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
