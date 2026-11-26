/**
 * LeaveRequestRow — the employee-side history's compact read-only row
 * (Story 17-6, spec D3): no avatar, dates line first, count + part-day
 * caption, the status chip right — tappable into the read-only detail
 * sheet. (The former owner variant died with the two-tab Leave redesign —
 * the Requests pane's LeaveRequestCard replaced it; the review's dead-code
 * note removed it, 2026-11-26.)
 *
 * This file also exports LeaveStatusBadge — the D6 chip rendering shared
 * by the detail sheet and the split block.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarX,
  CheckCircle2,
  Clock,
  Undo2,
  XCircle,
} from 'lucide-react-native';
import { Badge } from '../../../components/ui';
import { colors, spacing, touch, typography } from '../../../theme';
import type { LeaveRequestRow as LeaveRequestRowData } from '../../../services/resources/attendanceLeave';
import {
  formatLeaveRange,
  requestStatusChip,
  splitDaySummary,
  workingDaysCopy,
  type LeaveStatusIconName,
} from './leaveStatusModel';

/** The D6 glyph map — one rendering for every chip site (rows, sheet,
 *  split block). */
const CHIP_ICONS: Record<
  LeaveStatusIconName,
  typeof Clock
> = {
  Clock,
  CheckCircle2,
  XCircle,
  CalendarX,
  Undo2,
};

export function LeaveStatusBadge({
  status,
  size = 'md',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const chip = requestStatusChip(status);
  const Icon = CHIP_ICONS[chip.icon];
  return (
    <Badge status={chip.badge} tone="soft" size={size} icon={<Icon size={12} color={colors.status[chip.badge].fg} strokeWidth={2} />}>
      {chip.label}
    </Badge>
  );
}

export function LeaveRequestRow(input: {
  request: LeaveRequestRowData;
  onPress?: () => void;
}) {
  const { request, onPress } = input;
  const partNote =
    request.part === 'first_half'
      ? ' · First half'
      : request.part === 'second_half'
        ? ' · Second half'
        : '';
  const split = splitDaySummary(request.dates);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Leave request, ${formatLeaveRange(
        request.startDate,
        request.endDate,
      )}, ${workingDaysCopy(request.workingDays)}, ${
        requestStatusChip(request.status).label
      }`}
      onPress={onPress}
      style={({ pressed }) => [styles.compact, pressed && styles.pressed]}>
      <View style={styles.compactTexts}>
        <Text style={styles.compactDates}>
          {formatLeaveRange(request.startDate, request.endDate)}
        </Text>
        <Text style={styles.compactCaption}>
          {workingDaysCopy(request.workingDays)}
          {partNote}
          {split ? ` · ${split.label}` : ''}
        </Text>
      </View>
      <LeaveStatusBadge status={request.status} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: touch.comfort,
    paddingVertical: spacing.s1,
  },
  compactTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  compactDates: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  compactCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
