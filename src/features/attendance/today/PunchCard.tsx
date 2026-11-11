/**
 * PunchCard — the redesigned Today card (2026-11-10 owner mockups): two
 * punch tiles (in / out) with the arrow connector. Each tile reads top to
 * bottom — a dotted eyebrow label, the big time (or the dashed
 * placeholder with the shift-end meridiem hint), and the punch's VERDICT:
 * green "On time" / amber "Late by …" / "Early by …" text, or the grey
 * Pending pill while the punch hasn't landed. When the day is closed a
 * divider opens the lone WORKED chip, toned by the day's verdict — a full
 * shift keeps the green ✓ celebration ("Full shift completed • Sched …"),
 * a short day reads amber without the ✓ and captions the gap ("Short by
 * …"), a day with no schedule stays neutral. Punctuality lives in the
 * tiles: green "On time", amber "Late by …"/"Early by …", and RED
 * "Early by …" when the leave crossed the shift midpoint (half the shift
 * or less worked). A flat composition of theme tokens per
 * DESIGN_SYSTEM.md (no gradients).
 *
 * Rendered whenever the merged record exists (mid-session included: the
 * checkout tile reads the dashed placeholder and the Pending pill), and
 * it remains after check-out — the done posture that replaces the
 * button. Before any record exists ("Check in" zero-state) the parent
 * renders NOTHING here — the zero-state's whitespace rule (DESIGN.md)
 * beats an empty card.
 */
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check } from 'lucide-react-native';
import { Card } from '../../../components/ui';
import { colors, fontSize, radius, shadow, spacing, typography } from '../../../theme';
import type {
  TodayTileVerdict,
  TodayTilesModel,
  WorkedTileChip,
} from './attendanceTodayModel';
import { tileVerdictText } from './attendanceTodayModel';
import { PunchCardBackdrop, WorkedChipBackdrop } from './PunchCardBackdrop';

/** Meridiem split: "4:06 AM" → ["4:06", "AM"] (the mockup's big-time +
 *  small-AM tile). Non-splitting input renders as one unit. */
function splitMeridiem(timeText: string): [string, string | null] {
  const space = timeText.lastIndexOf(' ');
  if (space <= 0) return [timeText, null];
  return [timeText.slice(0, space), timeText.slice(space + 1)];
}

function PunchTile({
  label,
  timeText,
  verdict,
  meridiemHint,
  align,
}: {
  label: string;
  timeText: string | null;
  verdict: TodayTileVerdict;
  /** Shift-end meridiem ("PM") shown beside the empty placeholder. */
  meridiemHint?: string | null;
  align: 'start' | 'end';
}) {
  const [big, meridiem] = timeText !== null ? splitMeridiem(timeText) : [null, null];
  const landed = verdict.kind !== 'pending';
  const verdictText = tileVerdictText(verdict);
  return (
    <View style={[styles.tile, align === 'start' ? styles.tileStart : styles.tileEnd]}>
      <View style={styles.tileLabelRow}>
        <View style={[styles.tileDot, landed ? styles.tileDotDone : null]} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      {big !== null && meridiem !== null ? (
        <Text style={styles.tileTime} maxFontSizeMultiplier={1.4}>
          {big}
          <Text style={styles.tileMeridiem}> {meridiem}</Text>
        </Text>
      ) : (
        <Text
          style={[styles.tileTime, styles.tileTimeEmpty]}
          maxFontSizeMultiplier={1.4}>
          - - : - -
          {meridiemHint ? (
            <Text style={styles.tileMeridiem}> {meridiemHint}</Text>
          ) : null}
        </Text>
      )}
      {verdictText !== null ? (
        <Text
          style={[
            styles.tileVerdict,
            verdict.kind === 'onTime'
              ? styles.tileVerdictGood
              : verdict.kind === 'early' && verdict.major
                ? // Left at/before the shift midpoint — half the shift or
                  // less worked. The verdict red (the too-far family), not
                  // the punctuality amber.
                  styles.tileVerdictMajor
                : styles.tileVerdictFlag,
          ]}
          maxFontSizeMultiplier={1.6}>
          {verdictText}
        </Text>
      ) : (
        // The one verdict that isn't ink: a grey stadium pill (the
        // mockup's "Pending"), promising the punch rather than judging it.
        <View style={styles.pendingPill}>
          <Text style={styles.pendingPillText} maxFontSizeMultiplier={1.6}>
            Pending
          </Text>
        </View>
      )}
    </View>
  );
}

/** The lone WORKED chip under the divider, toned by the day's verdict
 *  (owner decision 2026-11-10): a full shift keeps the green ✓
 *  celebration ("Full shift completed • Sched …"); a short day drops the
 *  ✓ and reads amber with the quantified gap ("Short by 6h 31m"); no
 *  schedule on the wire stays neutral grey with the plain "Shift
 *  duration" — the chip never celebrates a day it cannot judge. */
function WorkedChip({ chip }: { chip: WorkedTileChip }) {
  const tone = chip.full
    ? colors.status.done
    : chip.shortfallMinutes != null
      ? colors.status.checkoutMissing
      : colors.status.neutral;
  return (
    <View style={[styles.chipWide, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <WorkedChipBackdrop ink={tone.solid} />
      <Text style={[styles.chipLabel, { color: tone.fg }]} maxFontSizeMultiplier={1.6}>
        WORKED
      </Text>
      <View style={styles.wideValueRow}>
        <Text style={styles.chipValueBig} maxFontSizeMultiplier={1.4}>
          {chip.value}
        </Text>
        {chip.full ? (
          <View style={[styles.checkBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Check size={16} color={tone.fg} strokeWidth={2.6} />
          </View>
        ) : null}
      </View>
      {chip.caption !== null ? (
        <Text style={[styles.chipCaption, { color: tone.fg }]} maxFontSizeMultiplier={1.6}>
          {chip.caption}
        </Text>
      ) : null}
    </View>
  );
}

export function PunchCard({ tiles }: { tiles: TodayTilesModel }) {
  return (
    <Card style={styles.card}>
      <PunchCardBackdrop />
      <View style={styles.tiles}>
        <PunchTile
          label="CHECK IN"
          timeText={tiles.checkinText}
          verdict={tiles.checkinVerdict}
          align="start"
        />
        <View style={styles.arrow}>
          <ArrowRight size={16} color={colors.primary} strokeWidth={2.4} />
        </View>
        <PunchTile
          label="CHECK OUT"
          timeText={tiles.checkoutText}
          verdict={tiles.checkoutVerdict}
          meridiemHint={tiles.checkoutHintMeridiem}
          align="end"
        />
      </View>
      {tiles.worked !== null ? (
        <>
          <View style={styles.divider} />
          <WorkedChip chip={tiles.worked} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // overflow hidden clips the decorative backdrop to the card's corners.
    overflow: 'hidden',
    padding: spacing.s5,
    gap: spacing.s3,
  },
  tiles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // The approved mockup keeps the tiles FLAT — labels and times sit
  // directly on the card, edge-aligned (left column flush left, right
  // column flush right); no tile boxes.
  tile: {
    flex: 1,
    gap: spacing.s2,
  },
  tileStart: {
    alignItems: 'flex-start',
  },
  tileEnd: {
    alignItems: 'flex-end',
  },
  tileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // The status dot: grey while the punch is pending, green once landed —
  // "did this punch happen" lives in the dot, punctuality in the verdict.
  tileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderDefault,
  },
  tileDotDone: {
    backgroundColor: colors.status.done.solid,
  },
  tileLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
  },
  tileTime: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textStrong,
  },
  tileTimeEmpty: {
    color: colors.textDisabled,
    fontWeight: '600',
    letterSpacing: 2,
  },
  tileMeridiem: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    // Nested inside the placeholder it would inherit the dashes' tracking.
    letterSpacing: 0,
  },
  tileVerdict: {
    ...typography.labelStrong,
    // Same vertical padding as the Pending pill: both verdict variants
    // must share one row height or the two tiles' rows drift apart.
    paddingVertical: spacing.s1,
  },
  tileVerdictGood: {
    color: colors.status.done.fg,
  },
  tileVerdictFlag: {
    color: colors.status.checkoutMissing.fg,
  },
  tileVerdictMajor: {
    color: colors.status.cancelled.fg,
  },
  pendingPill: {
    // Stadium radius: the pill hugs a 14pt label, so a token radius would
    // read as a rounded box — the mockup draws a full capsule.
    borderRadius: 999,
    backgroundColor: colors.status.neutral.bg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  pendingPillText: {
    ...typography.labelStrong,
    color: colors.status.neutral.fg,
  },
  arrow: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  chipWide: {
    // Clips the chip's decorative backdrop to its rounded corners.
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    gap: spacing.s1,
  },
  // The value row: the big value on the left, the caption (schedule / ✓)
  // on the SAME line — bottoms aligned, so the caption reads as the
  // value's baseline note, not a floating middle line.
  wideValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  chipLabel: {
    ...typography.eyebrow,
  },
  chipValueBig: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.textStrong,
  },
  checkBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCaption: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    opacity: 0.85,
  },
});
