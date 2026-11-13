/**
 * PunchStatusCard — the tinted status card beneath the PunchButton: a
 * bold title and a body of emphasis segments. Tone comes from the model
 * and maps onto the existing status tokens (done=green, progress=blue,
 * cancelled=red, scheduled=amber, neutral=gray) — no new card palette.
 *
 * 2026-11-10 (owner decision): the icon well and the status chip are
 * GONE — the card is just title + body in the tone's tint. Purely
 * presentational; the copy lives in the model's frozen table.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, weight } from '../../../theme';
import type {
  PunchCardTone,
  PunchStatusCardModel,
} from './attendanceTodayModel';
import { LostPinBackdrop } from './PunchCardBackdrop';

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
  // The red family again, as its own posture: the blocker card inks its
  // text in `fg` and carries the lost-pin motif (see the render).
  blocker: {
    bg: colors.status.cancelled.bg,
    border: colors.status.cancelled.border,
    fg: colors.status.cancelled.fg,
    solid: colors.status.cancelled.solid,
  },
};

export function PunchStatusCard({ model }: { model: PunchStatusCardModel }) {
  const t = TONES[model.tone];
  // Owner decisions 2026-11-10: the "Location is off" blocker reads red
  // end to end — red text and its own motif. Every other posture keeps
  // dark text on its tint.
  const blocker = model.tone === 'blocker';
  const ink = blocker ? { color: t.fg } : null;
  return (
    <View
      style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityLabel={model.announce}
      accessibilityRole="text">
      {blocker ? <LostPinBackdrop /> : null}
      {model.title ? (
        <Text style={[styles.title, ink]} numberOfLines={1}>
          {model.title}
        </Text>
      ) : null}
      {model.segments.length > 0 ? (
        <Text style={[styles.bodyText, ink]} maxFontSizeMultiplier={1.6}>
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
  );
}

const styles = StyleSheet.create({
  card: {
    // overflow hidden clips the backdrop motif to the card's corners.
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    gap: 3,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: weight.extra,
    color: colors.textStrong,
  },
  bodyText: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.4),
    color: colors.textBody,
  },
  strong: {
    fontWeight: weight.bold,
    color: colors.textStrong,
  },
  danger: {
    fontWeight: weight.bold,
    color: colors.status.cancelled.solid,
  },
});
