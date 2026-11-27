/**
 * LeaveRequestCard — the owner Requests pane's card (the two-tab Leave
 * redesign, 2026-11; the Stitch mobile mock's card anatomy over the Fenzit
 * DS tokens). Identity row (avatar + status glyph, name, EMP-code · office,
 * status chip), the date strip (span label + "N working days" chip + the
 * honest split suffix), the type tag + the verbatim reason in quotes, and
 * the per-status action row:
 *
 *   pending  → Decline (sheet-hosted, reason opportunity) + Approve
 *              (the one INLINE direct write — input-less, state-guarded).
 *   approved → "Planned absence" tag when the span starts after today
 *              (pure string compare, AD-7) + Revoke (sheet-hosted: the
 *              reason is REQUIRED on the wire).
 *   terminal → a quiet note; no actions. Revoked reads "Revoked by admin"
 *              (wire truth — the mock's "Self-withdrawn by employee" text
 *              would be false under an owner revoke); cancelled reads
 *              "No action needed"; rejected reads nothing (the rejection
 *              reason is not on the wire).
 */
import { StyleSheet, Text, View } from 'react-native';
import {
  CalendarDays,
  CalendarX,
  CheckCircle2,
  Clock,
  Undo2,
  XCircle,
} from 'lucide-react-native';
import { Avatar, Badge, Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { istTodayDate } from '../../../utils/istDate';
import type { LeaveRequestRow as LeaveRequestRowData } from '../../../services/resources/attendanceLeave';
import {
  formatLeaveRange,
  requestStatusChip,
  splitDaySummary,
  workingDaysCopy,
  type LeaveStatusIconName,
} from './leaveStatusModel';

/** The D6 glyph map — one rendering for every chip site. */
const CHIP_ICONS: Record<LeaveStatusIconName, typeof Clock> = {
  Clock,
  CheckCircle2,
  XCircle,
  CalendarX,
  Undo2,
};

/** Approved + future-dated → the card's "Planned absence" mini-tag. */
function isPlannedAbsence(request: LeaveRequestRowData): boolean {
  return request.status === 'approved' && request.startDate > istTodayDate();
}

/** The terminal row's quiet note — null for statuses that need none. */
function terminalNote(status: string): string | null {
  if (status === 'revoked') return 'Revoked by admin';
  if (status === 'cancelled') return 'No action needed';
  return null;
}

export function LeaveRequestCard(input: {
  request: LeaveRequestRowData;
  /** The inline Approve write in flight (the pane owns the latch) — the
   *  card renders its spinner and goes inert. */
  approving?: boolean;
  onPress?: () => void;
  onApprove?: () => void;
  /** Opens the detail sheet's reject stage (the reason opportunity). */
  onDecline?: () => void;
  /** Opens the detail sheet's revoke stage (the reason is required). */
  onRevoke?: () => void;
  /**
   * Epic 24 — the manager queue's read-only reason line ("Someone closer to
   * Ravi decides this."). When set, the pending row's action row is
   * suppressed and the quiet note renders instead. Absent on the owner's
   * cards, so their render is unchanged.
   */
  readOnlyNote?: string | null;
}) {
  const { request, approving = false, onPress, onApprove, onDecline, onRevoke, readOnlyNote } = input;

  const name = request.employeeName ?? 'Team member';
  const chip = requestStatusChip(request.status);
  const Icon = CHIP_ICONS[chip.icon];
  const split = splitDaySummary(request.dates);
  const note = terminalNote(request.status);
  const statusLine = `${chip.label}${request.employeeCode ? `, ${request.employeeCode}` : ''}`;
  const pending = request.status === 'pending';
  const approved = request.status === 'approved';
  const busy = approving;

  return (
    <Card
      interactive={onPress != null}
      disabled={busy && onPress != null}
      onPress={onPress}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={`Leave request for ${name}, ${formatLeaveRange(
        request.startDate,
        request.endDate,
      )}, ${workingDaysCopy(request.workingDays)}${
        request.leaveTypeName ? `, ${request.leaveTypeName}` : ''
      }, ${statusLine}${
        request.reason.trim() !== '' ? `, reason: ${request.reason.trim()}` : ''
      }`}>
      <View style={styles.identityRow}>
        <View style={styles.avatarWrap}>
          <Avatar name={name} uri={request.employeeAvatarUrl ?? null} size="md" />
          <View style={[styles.glyph, { backgroundColor: colors.status[chip.badge].bg }]}>
            <Icon size={11} color={colors.status[chip.badge].fg} strokeWidth={2.2} />
          </View>
        </View>
        <View style={styles.identityTexts}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {request.employeeCode ? `${request.employeeCode}` : ''}
            {request.employeeCode && request.officeName ? ' • ' : ''}
            {request.officeName ?? ''}
          </Text>
        </View>
        {/* The design's chip: a leading status dot + the word — the dot is
            the color story (amber/green/red/grey per the status family),
            the avatar's glyph badge carries the shape story. */}
        <Badge status={chip.badge} tone="soft" size="sm" dot>
          {chip.label}
        </Badge>
      </View>

      <View style={styles.dateStrip}>
        <View style={styles.dateLine}>
          <CalendarDays size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.dates} numberOfLines={1}>
            {formatLeaveRange(request.startDate, request.endDate)}
          </Text>
          <View style={styles.daysChip}>
            <Text style={styles.daysChipText} numberOfLines={1}>
              {workingDaysCopy(request.workingDays)}
            </Text>
          </View>
        </View>
        <View style={styles.metaLine}>
          {request.leaveTypeName ? (
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText} numberOfLines={1}>
                {request.leaveTypeName}
              </Text>
            </View>
          ) : null}
          {request.reason.trim() !== '' ? (
            <Text style={styles.reason} numberOfLines={1}>
              “{request.reason}”
            </Text>
          ) : null}
        </View>
        {split ? <Text style={styles.splitNote}>{split.label}</Text> : null}
      </View>

      {pending && !readOnlyNote && (onApprove != null || onDecline != null) ? (
        <View style={styles.actionRow}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onPress={onDecline}
            style={styles.actionBtn}>
            Decline
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={approving}
            disabled={busy}
            onPress={onApprove}
            style={styles.actionBtn}>
            Approve
          </Button>
        </View>
      ) : null}

      {readOnlyNote ? (
        <Text style={styles.decisionNote} accessibilityLiveRegion="polite">
          {readOnlyNote}
        </Text>
      ) : null}

      {approved ? (
        <View style={styles.actionRow}>
          {isPlannedAbsence(request) ? (
            <View style={styles.plannedTag}>
              <Text style={styles.plannedTagText}>Planned absence</Text>
            </View>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onPress={onRevoke}
            style={styles.actionBtn}>
            Revoke
          </Button>
        </View>
      ) : null}

      {note ? (
        <Text style={styles.terminalNote} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  avatarWrap: {
    position: 'relative',
  },
  glyph: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceCard,
  },
  identityTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  sub: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  dateStrip: {
    marginTop: spacing.s3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.s3,
    gap: spacing.s2,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  dates: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    flexShrink: 1,
  },
  daysChip: {
    marginLeft: 'auto',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  daysChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  typeTag: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  typeTagText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.primary,
  },
  reason: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  splitNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  actionBtn: {
    flex: 1,
  },
  plannedTag: {
    backgroundColor: colors.status.done.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  plannedTagText: {
    ...typography.caption,
    color: colors.status.done.fg,
    fontWeight: '500',
  },
  terminalNote: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s3,
    fontStyle: 'italic',
  },
  decisionNote: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s3,
  },
});
