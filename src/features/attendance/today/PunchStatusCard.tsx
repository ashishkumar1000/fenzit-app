/**
 * PunchStatusCard — the tinted status card beneath the PunchButton (the
 * approved mockup): a solid icon well, a bold title, a solid chip on the
 * right and a body of emphasis segments. Tone comes from the model and
 * maps onto the existing status tokens (done=green, progress=blue,
 * cancelled=red, scheduled=amber, neutral=gray) — no new card palette.
 *
 * Purely presentational; the copy lives in the model's frozen table.
 */
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors, fontSize, radius, spacing } from '../../../theme';
import type {
  PunchCardTone,
  PunchStatusCardModel,
} from './attendanceTodayModel';

const TONES: Record<
  PunchCardTone,
  { bg: string; border: string; fg: string; solid: string }
> = {
  done: {
    bg: colors.status.done.bg,
    border: colors.status.done.border,
    fg: colors.status.done.fg,
    solid: colors.status.done.solid,
  },
  progress: {
    bg: colors.status.progress.bg,
    border: colors.status.progress.border,
    fg: colors.status.progress.fg,
    solid: colors.status.progress.solid,
  },
  cancelled: {
    bg: colors.status.cancelled.bg,
    border: colors.status.cancelled.border,
    fg: colors.status.cancelled.fg,
    solid: colors.status.cancelled.solid,
  },
  scheduled: {
    bg: colors.status.scheduled.bg,
    border: colors.status.scheduled.border,
    fg: colors.status.scheduled.fg,
    solid: colors.status.scheduled.solid,
  },
  neutral: {
    bg: colors.status.neutral.bg,
    border: colors.status.neutral.border,
    fg: colors.status.neutral.fg,
    solid: colors.status.neutral.solid,
  },
};

export function PunchStatusCard({ model }: { model: PunchStatusCardModel }) {
  const t = TONES[model.tone];
  return (
    <View
      style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityLabel={model.announce}
      accessibilityRole="text">
      <View style={styles.iconWell}>
        <MapPin size={18} color={t.solid} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <View style={styles.headRow}>
          {model.title ? (
            <Text style={styles.title} numberOfLines={1}>
              {model.title}
            </Text>
          ) : null}
          {model.chip ? (
            <View style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: t.solid }]} />
              <Text style={[styles.chipLabel, { color: t.fg }]}>{model.chip}</Text>
            </View>
          ) : null}
        </View>
        {model.segments.length > 0 ? (
          <Text style={styles.bodyText} maxFontSizeMultiplier={1.6}>
            {model.segments.map((s, i) => (
              <Text
                key={i}
                style={
                  s.emphasis === 'danger'
                    ? styles.danger
                    : s.emphasis === 'strong'
                      ? styles.strong
                      : undefined
                }>
                {s.text}
              </Text>
            ))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  iconWell: {
    // The redesign's soft tile: white squircle, outline pin in the tone's
    // solid — calmer than the old solid disc.
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.textStrong,
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  chipLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.4),
    color: colors.textBody,
  },
  strong: {
    fontWeight: '700',
    color: colors.textStrong,
  },
  danger: {
    fontWeight: '700',
    color: colors.status.cancelled.solid,
  },
});
