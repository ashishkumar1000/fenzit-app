/**
 * LeaveApplyFields — the shared leave-form body (Story 17-6, spec D4):
 * the presentational extraction of 17-5's Day-part / date-rows /
 * count-chip / reason blocks. Presentational ONLY — every value and
 * handler arrives as a prop; `leaveApplyModel.ts` stays the shared
 * brain. The technician `LeaveApplyScreen` renders identically through
 * it (its tests pin the anatomy), and `ApplyOnBehalfScreen` composes the
 * same fields with the count-chip slot replaced: the owner route has NO
 * live preview (the preview GET is technician-only — the owner JWT
 * answers 403), so the optional `countSlot` holds the muted one-liner.
 *
 * Story 23-14 adds the balances card slot (first, above everything) and
 * the Leave type section. The device pass pulled the inline radio list
 * into a bottom sheet (LeaveTypePickerSheet — the EmployeePickerSheet
 * idiom): five full rows sat between the balances card and Day part, so
 * this surface now renders a compact TRIGGER ROW (the current selection
 * + chevron) that opens the sheet; the balance captions live there and
 * the first type is the default (there is no "No type" row — the owner's
 * call). The old `Type` eyebrow is now `Day part` — with a real Leave
 * type section on the same form, the bare "Type" label read as the
 * picker.
 *
 * 23-14 late ruling (the owner's): a request the server would refuse
 * must never be submittable. The preview now runs the POST's whole
 * validation (balance included) and answers `ok: false` with its
 * message — the rejected branch below renders that VERBATIM, and the
 * hooks gate `canSubmit` on it. There is deliberately no FE-side
 * balance math here: one server truth, no drift.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react-native';
import {
  Eyebrow,
  InlineNotice,
  Input,
  SectionHead,
  SegmentedControl,
  Skeleton,
} from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeavePart } from '../../../services/resources/attendanceLeave';
import type { LeavePreviewState } from './useLeaveApply';
import { LeaveDateRow } from './LeaveDateRow';
import { workingDaysCopy } from './leaveApplyModel';

const RESET_NOTE_MESSAGE =
  'Day part reset to Full day — half day applies to a single date only.';
const EMPTY_COUNT_HINT = 'Pick dates to see the working-days count.';
const REASON_MAX = 500;
const REASON_NEAR_LIMIT = 450;
const NO_TYPES_AVAILABLE_MESSAGE =
  'No leave types are set up for your company. Leave applies without a type.';
const NO_TYPE_PICKABLE_MESSAGE =
  'No leave type is available to pick right now. Leave applies without a type.';

/** The mock reason quick-picks (UI-only vocabulary — NOT a leave type; the
 *  wire carries no type field): a tap PREFILLS the Reason field with the
 *  phrase verbatim (the user's ruling) — the counter, the 500 cap and the
 *  single reason text are unchanged, so it is exactly a typing shortcut. */
const REASON_PRESETS = [
  'Sick leave',
  'Personal',
  'Family event',
  'Doctor visit',
];

/** One preset chip — a plain bordered pill, tapping prefills the Reason.
 *  The pill is ~33px tall (under the 44px touch minimum), so the hitSlop
 *  tops it up vertically; horizontally 4px per side stays inside the 8px
 *  flex-wrap gap, so neighbouring chips never collide. */
function ReasonPreset({ text, onPick }: { text: string; onPick: (text: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Use ${text} as the reason`}
      onPress={() => onPick(text)}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => [styles.preset, pressed && styles.presetPressed]}>
      <Text style={styles.presetText}>{text}</Text>
    </Pressable>
  );
}

export function LeaveApplyFields(input: {
  typeOptions: { value: LeavePart; label: string }[];
  part: LeavePart;
  onChangePart: (part: LeavePart) => void;
  resetNote: boolean;
  from: string | null;
  to: string | null;
  onOpenFromPicker: () => void;
  onOpenToPicker: () => void;
  /** The To row's Clear affordance — present only when To is filled. */
  onClearTo?: () => void;
  /** The technician live-preview state (ignored when `countSlot` is set). */
  preview: LeavePreviewState;
  /** Replaces the whole count area — the on-behalf screen's muted slot. */
  countSlot?: ReactNode;
  /** True while no From exists (the technician screen's hint condition). */
  showEmptyHint?: boolean;
  reason: string;
  onChangeReason: (reason: string) => void;
  /** 23-14 — the balances card (LeaveBalancesCard), rendered first. */
  balancesSlot?: ReactNode;
  /** 23-14 — the enabled catalog types for the picker. Absent = the
   *  surface doesn't offer the picker (defensive; both surfaces pass it).
   *  Present-but-empty = the tenant disabled every type → the neutral
   *  notice, and the form behaves exactly as pre-23-14. */
  leaveTypeOptions?: { id: string; name: string; caption: string }[];
  /** True while the types GET is in flight (a small shimmer). */
  typesLoading?: boolean;
  /** 23-14 (Sally F6): true when the catalog HAS types but none is
   *  pickable (every accrual type's balance is used up and no Comp-Off /
   *  allow-over type exists). The trigger must not dress a disabled type
   *  up as the selection — the neutral notice renders instead, and the
   *  wire request stays untyped (the BE's untyped = paid-leave semantic,
   *  which the server accepts — so submit stays governed by the preview). */
  leaveTypeUnavailable?: boolean;
  /** The current selection (the hook resolves it to a catalog type; null
   *  while the catalog is empty or no type is pickable — the trigger then
   *  never renders). */
  selectedLeaveTypeId?: string | null;
  /** A type tap from the picker sheet. */
  onChangeLeaveType?: (id: string | null) => void;
  /** Opens the LeaveTypePickerSheet (the inline rows collapsed into it —
   *  the device-pass compaction). */
  onOpenTypePicker?: () => void;
}) {
  const {
    typeOptions,
    part,
    onChangePart,
    resetNote,
    from,
    to,
    onOpenFromPicker,
    onOpenToPicker,
    onClearTo,
    preview,
    countSlot,
    showEmptyHint = false,
    reason,
    onChangeReason,
    balancesSlot,
    leaveTypeOptions,
    typesLoading = false,
    leaveTypeUnavailable = false,
    selectedLeaveTypeId = null,
    onChangeLeaveType,
    onOpenTypePicker,
  } = input;
  const showChip =
    preview.status === 'ok' ||
    (preview.status === 'loading' && preview.workingDays != null);
  // The FIRST preview's wait now shows too (the 20-1 loading sweep): From is
  // picked, the GET is in flight and no old count exists to dim — a small
  // chip-shaped shimmer stands in the slot instead of blank space.
  const showFirstPreviewShimmer =
    preview.status === 'loading' && preview.workingDays == null && from != null;
  // The trigger row reflects the current selection — the hook guarantees
  // it resolves to a catalog type while options exist (first type is the
  // default); the fallbacks only cover the render-before-resolve gap.
  const selectedType =
    selectedLeaveTypeId != null
      ? leaveTypeOptions?.find(option => option.id === selectedLeaveTypeId)
      : undefined;
  const triggerName =
    selectedType?.name ?? leaveTypeOptions?.[0]?.name ?? '';
  const triggerCaption =
    selectedType?.caption ?? leaveTypeOptions?.[0]?.caption ?? '';

  return (
    <>
      {balancesSlot != null ? balancesSlot : null}

      {leaveTypeOptions != null ? (
        <View style={styles.block}>
          <Eyebrow>Leave type</Eyebrow>
          {typesLoading ? (
            <Skeleton rows={1} height={52} />
          ) : leaveTypeOptions.length === 0 || leaveTypeUnavailable ? (
            <InlineNotice
              message={
                leaveTypeUnavailable
                  ? NO_TYPE_PICKABLE_MESSAGE
                  : NO_TYPES_AVAILABLE_MESSAGE
              }
              tone="neutral"
            />
          ) : (
            /* The collapsed picker trigger — the inline radio list moved
               into the LeaveTypePickerSheet (device-pass compaction). */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Leave type: ${triggerName}, ${triggerCaption}. Tap to change.`}
              onPress={onOpenTypePicker}
              style={({ pressed }) => [
                styles.typeTrigger,
                pressed ? styles.presetPressed : null,
              ]}>
              <View style={styles.typeRowText}>
                <Text style={styles.typeTriggerName} numberOfLines={1}>
                  {triggerName}
                </Text>
                <Text style={styles.typeRowCaption} numberOfLines={1}>
                  {triggerCaption}
                </Text>
              </View>
              <ChevronDown size={16} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.block}>
        <Eyebrow>Day part</Eyebrow>
        <SegmentedControl
          options={typeOptions}
          value={part}
          onChange={onChangePart}
        />
        {resetNote ? (
          <InlineNotice message={RESET_NOTE_MESSAGE} tone="neutral" icon={null} />
        ) : null}
      </View>

      <View style={styles.block}>
        <SectionHead title="Dates" />
        <View style={styles.rows}>
          <LeaveDateRow label="From" value={from} onPress={onOpenFromPicker} />
          <LeaveDateRow
            label="To"
            value={to}
            placeholder="Optional"
            onPress={onOpenToPicker}
            disabled={!from}
            onClear={to ? onClearTo : undefined}
          />
          {countSlot != null ? (
            countSlot
          ) : showChip ? (
            <View
              style={[
                styles.countChip,
                preview.status === 'loading' ? styles.countDim : null,
              ]}
              accessibilityLiveRegion="polite">
              <CalendarDays
                size={16}
                color={colors.status.progress.fg}
                strokeWidth={2}
              />
              <Text style={styles.countText}>
                {preview.workingDays != null
                  ? workingDaysCopy(preview.workingDays)
                  : null}
              </Text>
            </View>
          ) : preview.status === 'rejected' ? (
            /* 23-14: the server's refusal (insufficient balance, locked
               month, overlap, …) IS the early catch — rendered verbatim,
               and the submit button is gated off while it stands. */
            <InlineNotice message={preview.message ?? ''} tone="info" />
          ) : preview.status === 'transport' ? (
            <InlineNotice message={preview.message ?? ''} tone="neutral" />
          ) : showFirstPreviewShimmer ? (
            <Skeleton rows={1} height={34} />
          ) : showEmptyHint ? (
            <Text style={styles.countHint}>{EMPTY_COUNT_HINT}</Text>
          ) : null}
          {/* With From not yet picked the "Pick dates" hint is the only
              content — no GET has started, so there is nothing to wait on. */}
        </View>
      </View>

      <View style={styles.block}>
        <SectionHead title="Reason (required)" />
        <View style={styles.presets}>
          {REASON_PRESETS.map(text => (
            <ReasonPreset key={text} text={text} onPick={onChangeReason} />
          ))}
        </View>
        <View style={styles.reasonField}>
          <Input
            value={reason}
            onChangeText={onChangeReason}
            placeholder="Why do you need leave?"
            multiline
            maxLength={REASON_MAX}
            accessibilityLabel="Reason (required)"
          />
          <Text
            style={[
              styles.counter,
              reason.length >= REASON_NEAR_LIMIT ? styles.counterNearLimit : null,
            ]}>
            {reason.length} / {REASON_MAX}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.s2,
  },
  rows: {
    gap: spacing.s3,
  },
  typeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 56,
  },
  typeTriggerName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  typeRowText: {
    flex: 1,
    gap: 1,
  },
  typeRowCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  preset: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  presetPressed: {
    opacity: 0.85,
  },
  presetText: {
    ...typography.label,
    color: colors.textBody,
  },
  reasonField: {
    gap: spacing.s1,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.status.progress.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  countDim: {
    opacity: 0.6,
  },
  countText: {
    ...typography.bodyStrong,
    color: colors.status.progress.fg,
  },
  countHint: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  counterNearLimit: {
    color: colors.status.scheduled.fg,
  },
});
