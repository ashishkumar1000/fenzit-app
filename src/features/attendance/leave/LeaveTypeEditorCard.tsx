/**
 * LeaveTypeEditorCard — the selected leave type's rules editor (the
 * two-tab Leave redesign, 2026-11; the Stitch mock's config card over the
 * web editor's shipped semantics). The enable switch lives in its own
 * top row (the mock's "Turn on this leave type"); with the type off every
 * other row sleeps — disabled and dimmed — and a drafted rule HOLDS in
 * its input, shipping with the next awake save (while asleep only the
 * `enabled` change posts — `leaveTypesModel.patchBody`).
 *
 * The rate stepper steps ±0.5 clamped 0–366 (the web editor's contract —
 * NOT the mock's ±1 integers: the API takes 2-decimal rates). Monthly
 * types show the annualized conversion line; carry-forward and
 * over-balance render for monthly types only (the BE 422s them
 * otherwise); comp-off shows the no-rate note. Save posts changed fields
 * only and sleeps until dirty (the inert button reads "No changes yet");
 * an asleep-only dirty draft (held rules, nothing posts) disables Save
 * with the hold line; failures render the server's message verbatim above
 * the button with the draft preserved.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlarmClockCheck,
  Heart,
  Info,
  RotateCw,
  TrendingUp,
  Umbrella,
  VenetianMask,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Button, InlineError, Switch } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import type { LeaveTypeView } from '../../../services/resources/attendanceLeave';
import {
  annualConversion,
  daysOk,
  hasRate,
  modeChipLabel,
  patchBody,
  stepDays,
  typeDirty,
  type LeaveTypeDraft,
} from './leaveTypesModel';

/** The header tile's glyph — the same icon the chip row uses (web's
 *  CODE_GLYPH; the umbrella is the fallback for a legacy row). */
const CODE_GLYPH: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  earned: Umbrella,
  sick: VenetianMask,
  bereavement: Heart,
  comp_off: AlarmClockCheck,
};

/** One settings row: title (+ optional state chip), description, the
 *  switch on the right. The WHOLE row presses the toggle when it's live
 *  (the switch thumb alone was a small target for a full-width row — the
 *  review P3); the switch keeps its own handler, and an inner touch never
 *  reaches the row, so a switch tap can't double-fire. Sleeps (dims and
 *  goes inert) while the type is off — or entirely for a legacy remnant. */
function ToggleRow(input: {
  glyph: ComponentType<{ size?: number; color?: string }>;
  title: string;
  chip?: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const { glyph: Glyph, title, chip, description, checked, disabled, onChange } = input;
  const body = (
    <>
      <View style={styles.rowGlyph}>
        <Glyph size={15} color={colors.primary} />
      </View>
      <View style={styles.rowTexts}>
        <View style={styles.titleRow}>
          <Text style={styles.rowTitle}>{title}</Text>
          {chip ? <Text style={styles.rowChip}>{chip}</Text> : null}
        </View>
        <Text style={styles.rowDesc}>{description}</Text>
      </View>
      <Switch
        value={checked}
        disabled={disabled}
        onValueChange={onChange}
        style={styles.rowSwitch}
      />
    </>
  );
  if (disabled) {
    return <View style={[styles.row, styles.rowAsleep]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${checked ? 'on' : 'off'}. Double-tap to turn ${checked ? 'off' : 'on'}.`}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

export function LeaveTypeEditorCard(input: {
  type: LeaveTypeView;
  draft: LeaveTypeDraft;
  busy: boolean;
  /** Another type's save is in flight — THIS Save must not stack a
   *  second PATCH (the pane's latch would silently swallow the press). */
  savingElsewhere?: boolean;
  /** A successful save's transient mark (cleared when the draft changes). */
  saved: boolean;
  error: string | null;
  onChange: (patch: Partial<LeaveTypeDraft>) => void;
  onSave: () => void;
}) {
  const { type, draft, busy, savingElsewhere = false, saved, error, onChange, onSave } = input;
  const monthly = type.accrualMode === 'monthly';
  const rate = hasRate(type);
  const asleep = !draft.enabled;
  // A legacy remnant never wakes: every row sleeps and the switch is off.
  const locked = !type.configurable;
  const rowsDisabled = asleep || locked;
  const validDays = rate && daysOk(draft.days);
  const dirty = typeDirty(type, draft);
  // What a Save press WOULD post — empty means the button would no-op
  // (the asleep-only held draft: chip dirty, Save enabled, nothing
  // ships — the enabled no-op found in the review, 2026-11-26).
  const postable = Object.keys(patchBody(type, draft)).length > 0;
  const conversion = monthly ? annualConversion(draft.days) : null;
  const Glyph = CODE_GLYPH[type.code ?? ''] ?? Umbrella;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.headerGlyph, asleep && styles.rowAsleep]}>
          <Glyph size={20} color={colors.primary} />
        </View>
        <View style={styles.headerTexts}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {type.name}
            </Text>
            <Text style={styles.modeChip}>{locked ? 'Read-only' : modeChipLabel(type)}</Text>
          </View>
          <Text style={styles.headerSub} numberOfLines={1}>
            Rules, accruals &amp; carryover policy
          </Text>
        </View>
      </View>

      {locked ? (
        <Text style={styles.lockedNote}>
          This record predates the fixed catalog and is read-only.
        </Text>
      ) : null}

      <View style={styles.rows}>
        <ToggleRow
          glyph={Umbrella}
          title="Turn on this leave type"
          description="Disabled types hide from the apply screen; days already taken still count."
          checked={draft.enabled}
          disabled={locked || busy}
          onChange={enabled => onChange({ enabled })}
        />
        <View style={styles.divider} />
        <ToggleRow
          glyph={AlarmClockCheck}
          title="Paid"
          chip={draft.paid ? 'Full Pay' : 'Unpaid (LOP)'}
          description={
            draft.paid
              ? 'Never counted as loss of pay.'
              : 'Approved days count as loss of pay.'
          }
          checked={draft.paid}
          disabled={rowsDisabled || busy}
          onChange={paid => onChange({ paid })}
        />

        {rate ? (
          <>
            <View style={styles.divider} />
            <View style={[styles.rateBlock, rowsDisabled && styles.rowAsleep]}>
              <View style={styles.titleRow}>
                <Text style={styles.rowTitle}>
                  {monthly ? 'Days per month' : 'Days per year'}
                </Text>
              </View>
              <Text style={styles.rowDesc}>
                {monthly
                  ? 'Monthly accrual quota per employee'
                  : "The year's grant, added each April"}
              </Text>
              <View style={styles.stepperRow}>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease days"
                    disabled={rowsDisabled || busy}
                    onPress={() => onChange({ days: stepDays(draft.days, -0.5) })}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      (rowsDisabled || busy) && styles.stepDisabled,
                      pressed && styles.stepPressed,
                    ]}>
                    <Text style={styles.stepGlyph}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue} numberOfLines={1}>
                    {draft.days}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase days"
                    disabled={rowsDisabled || busy}
                    onPress={() => onChange({ days: stepDays(draft.days, 0.5) })}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      (rowsDisabled || busy) && styles.stepDisabled,
                      pressed && styles.stepPressed,
                    ]}>
                    <Text style={styles.stepGlyph}>+</Text>
                  </Pressable>
                </View>
                <Text style={styles.rateUnit}>{monthly ? 'days / month' : 'days / year'}</Text>
              </View>
              {conversion ? <Text style={styles.conversion}>{conversion}</Text> : null}
              {draft.days.trim() !== '' && !daysOk(draft.days) ? (
                <Text style={styles.rateError}>Up to 366, at most 2 decimals.</Text>
              ) : null}
              <View style={styles.hintBanner}>
                <Info size={14} color={colors.primary} />
                <Text style={styles.hintText}>
                  {monthly
                    ? 'Credit added each month, April–March. Setting to 0 disables automated monthly accruals.'
                    : 'Credited once each April. Set to 0 if the annual grant is disabled.'}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Text style={[styles.noRate, locked && styles.rowAsleep]}>
              No rate — days come from approved comp-off earns, not a rate.
            </Text>
          </>
        )}

        {monthly ? (
          <>
            <View style={styles.divider} />
            <ToggleRow
              glyph={RotateCw}
              title="Carry forward"
              description="Last year's unused days roll into this year's balance automatically."
              checked={draft.carryForward}
              disabled={rowsDisabled || busy}
              onChange={carryForward => onChange({ carryForward })}
            />
            <View style={styles.divider} />
            <ToggleRow
              glyph={TrendingUp}
              title="Allow over balance"
              description="Requests may go past the remaining balance."
              checked={draft.allowOverBalance}
              disabled={rowsDisabled || busy}
              onChange={allowOverBalance => onChange({ allowOverBalance })}
            />
          </>
        ) : null}
      </View>

      {error ? <InlineError message={error} /> : null}
      <Button
        variant="primary"
        disabled={
          busy || savingElsewhere || !dirty || !postable || (draft.enabled && rate === true && !validDays)
        }
        loading={busy}
        onPress={onSave}>
        {busy ? 'Saving…' : 'Save Changes'}
      </Button>
      {/* The disabled button's state, spelled out — a pale off-screen-colour
          button explains itself (the review P3; the dirty dot on the chip
          is the other half of the pending-save visibility). An asleep-only
          dirty draft posts nothing (the hold) — the line says so, instead
          of an enabled button that silently does nothing. */}
      {saved && !dirty ? (
        <Text style={styles.savedMark}>Saved.</Text>
      ) : !dirty && !busy ? (
        <Text style={styles.savedMark}>No changes yet</Text>
      ) : dirty && !postable && asleep && !busy ? (
        <Text style={styles.savedMark}>Rule changes hold while the type is off.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    padding: spacing.s4,
    gap: spacing.s3,
    ...shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  headerGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.textStrong,
  },
  headerSub: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  modeChip: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.status.done.fg,
    backgroundColor: colors.status.done.bg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  lockedNote: {
    ...typography.bodySm,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  rows: {
    gap: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowAsleep: {
    opacity: 0.45,
  },
  rowGlyph: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  rowChip: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  rowDesc: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  rowSwitch: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  rateBlock: {
    gap: spacing.s2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 3,
    gap: 3,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: {
    opacity: 0.7,
  },
  stepDisabled: {
    opacity: 0.4,
  },
  stepGlyph: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: 24,
  },
  stepValue: {
    minWidth: 44,
    textAlign: 'center',
    ...typography.heading,
    color: colors.textStrong,
  },
  rateUnit: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  conversion: {
    ...typography.bodySm,
    color: colors.primary,
    fontWeight: '500',
  },
  rateError: {
    ...typography.bodySm,
    color: colors.danger,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.s3,
  },
  hintText: {
    ...typography.bodySm,
    color: colors.textBody,
    flex: 1,
  },
  noRate: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  savedMark: {
    ...typography.bodySm,
    color: colors.status.done.fg,
    textAlign: 'center',
  },
});
