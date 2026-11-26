/**
 * LeaveTypesPane — the owner's Config pane (the leave-type catalog; value 'types') (the two-tab Leave redesign,
 * 2026-11; the Stitch "Leave Types" mobile screen). The pane body scrolls
 * vertically (the editor card is taller than most phones — the Save
 * button must stay reachable) and the catalog loads once
 * (listCompanyLeaveTypes) and renders as a horizontal chip row — each chip
 * shows the type's glyph, name and its derived sub-label, with the "N of M
 * configured" line above (the design's own reading, counted over the
 * editable rows only) — and the selected type's editor card below.
 *
 * Drafts are per-type and survive chip switches (the web console's
 * LeaveTypesTab keeps an unsaved edit alive across a card switch; the plan
 * review pinned this parity). Save posts the changed fields only and
 * replaces the row with the server's truth; failures render the server
 * message verbatim above the button with the draft preserved — offline
 * gets the transport line, and a 403/404 refetches the catalog so a
 * vanished type cannot keep a stale card open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlarmClockCheck,
  Heart,
  Umbrella,
  VenetianMask,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Button, EmptyState, InlineError, Skeleton } from '../../../components/ui';
import { colors, radius, shadow, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services/api/apiError';
import { FALLBACK_ERROR_MESSAGE } from '../../../services/api/apiError';
import { attendanceLeaveService, type LeaveTypeView } from '../../../services';
import {
  classifyTypeSaveFailure,
  chipSubLabel,
  configuredCount,
  daysOk,
  draftFromType,
  hasRate,
  orderLeaveTypes,
  patchBody,
  typeDirty,
  type LeaveTypeDraft,
} from './leaveTypesModel';
import { LeaveTypeEditorCard } from './LeaveTypeEditorCard';
import { ScrollFade } from './ScrollFade';

/** The chip + header tile's glyph — web's CODE_GLYPH; the umbrella is the
 *  fallback for a legacy row. */
const CODE_GLYPH: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  earned: Umbrella,
  sick: VenetianMask,
  bereavement: Heart,
  comp_off: AlarmClockCheck,
};

export function LeaveTypesPane() {
  const [types, setTypes] = useState<LeaveTypeView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeaveTypeDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ id: string; message: string } | null>(null);
  const mounted = useRef(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Seat a fresh catalog: order it, seed any missing drafts, keep the
   *  live selection when its type still exists (drafts survive refetches
   *  too — a background reseat must not wipe the owner's typing). */
  const applyCatalog = useCallback((rows: LeaveTypeView[]) => {
    const ordered = orderLeaveTypes(rows);
    setTypes(ordered);
    setDrafts(prev => {
      const next: Record<string, LeaveTypeDraft> = {};
      for (const row of ordered) next[row.id] = prev[row.id] ?? draftFromType(row);
      return next;
    });
    setSelectedId(prev =>
      prev && ordered.some(row => row.id === prev) ? prev : ordered[0]?.id ?? null,
    );
  }, []);

  const loadCatalog = useCallback(() => {
    // One fetch at a time — a double-tapped retry must not stack a second
    // call whose out-of-order resolution could seat a stale catalog (the
    // review's edge-case note, 2026-11-26).
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadError(null);
    attendanceLeaveService
      .listCompanyLeaveTypes()
      .then(rows => {
        if (mounted.current) applyCatalog(rows);
      })
      .catch((err: ApiError) => {
        if (!mounted.current || err.code === 'CANCELLED') return;
        setLoadError(err.message || FALLBACK_ERROR_MESSAGE);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [applyCatalog]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selected = types?.find(row => row.id === selectedId) ?? null;

  const changeDraft = useCallback((id: string, patch: Partial<LeaveTypeDraft>) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setSavedId(prev => (prev === id ? null : prev));
  }, []);

  const save = useCallback(
    (type: LeaveTypeView) => {
      const draft = drafts[type.id];
      if (!draft || savingId != null) return;
      const body = patchBody(type, draft);
      if (Object.keys(body).length === 0) return;
      // An asleep save posts `enabled` only — the drafted rules HOLD and
      // must survive the reseat (the model's hold contract; wiping them
      // here silently discarded the owner's edits — found in the review,
      // 2026-11-26).
      const asleepSave = !draft.enabled;
      setSavingId(type.id);
      setSaveError(prev => (prev?.id === type.id ? null : prev));
      attendanceLeaveService
        .patchLeaveType(type.id, body)
        .then(row => {
          if (!mounted.current) return;
          setTypes(prev =>
            orderLeaveTypes((prev ?? []).map(item => (item.id === row.id ? row : item))),
          );
          setDrafts(prev => {
            const fresh = draftFromType(row);
            if (!asleepSave) return { ...prev, [row.id]: fresh };
            // Keep the held rule drafts; only `enabled` follows the server.
            const prior = prev[row.id];
            return {
              ...prev,
              [row.id]: prior
                ? {
                    days: prior.days,
                    carryForward: prior.carryForward,
                    allowOverBalance: prior.allowOverBalance,
                    paid: prior.paid,
                    enabled: fresh.enabled,
                  }
                : fresh,
            };
          });
          setSavedId(row.id);
          setSavingId(null);
        })
        .catch((err: ApiError) => {
          if (!mounted.current) return;
          setSavingId(null);
          const failure = classifyTypeSaveFailure(err);
          if (failure.kind === 'cancelled') return;
          setSaveError({ id: type.id, message: failure.message });
          if (failure.kind === 'gone') loadCatalog();
        });
    },
    [drafts, savingId, loadCatalog],
  );

  if (types === null && loadError === null) {
    return <Skeleton rows={4} height={72} />;
  }
  if (loadError !== null) {
    return (
      <View style={styles.centerBlock}>
        <InlineError message={loadError} />
        <Button variant="secondary" onPress={loadCatalog}>
          Try again
        </Button>
      </View>
    );
  }
  if (types !== null && types.length === 0) {
    // The catalog is a fixed four-type set seeded by migration — a present-
    // but-empty answer is abnormal data, and the state must not be a dead
    // end: the retry re-asks the wire (the review's empty-catalog note).
    return (
      <View style={styles.centerBlock}>
        <EmptyState
          icon={<Umbrella size={22} color={colors.primary} />}
          title="No leave types yet"
          description="Your leave-type catalog hasn't been set up yet. If this looks wrong, try again."
        />
        <Button variant="secondary" onPress={loadCatalog}>
          Try again
        </Button>
      </View>
    );
  }
  if (types === null || selected === null || drafts[selected.id] === undefined) {
    return null;
  }

  // The pane body scrolls (the editor card is taller than most phones —
  // the Save button must always be reachable); the chip row stays the one
  // horizontal scroll inside it. While the selected draft is dirty (or its
  // save is in flight) a STICKY Save bar pins to the pane's bottom edge —
  // the editor card's own Save scrolls out of view mid-card, and a save
  // the owner can't reach is a save that never happens (the UX review's
  // sticky-save note, 2026-11-26).
  const selectedDraft = drafts[selected.id];
  const selectedDirty = typeDirty(selected, selectedDraft);
  const savingSelected = savingId === selected.id;
  const stickyVisible = selectedDirty || savingSelected;
  // The sticky bar mirrors the card's exact Save gate — one rule, two
  // renders (a bar that would post what the card refuses is a trap).
  const rate = hasRate(selected);
  const validDays = rate && daysOk(selectedDraft.days);
  const postable = Object.keys(patchBody(selected, selectedDraft)).length > 0;
  const stickyDisabled =
    savingId != null || !postable || (selectedDraft.enabled && rate && !validDays);

  return (
    <View style={styles.pane}>
      <ScrollView
        contentContainerStyle={[styles.content, stickyVisible && styles.contentWithBar]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.configuredRow}>
          <Text style={styles.sectionLabel}>Leave categories</Text>
          <Text style={styles.configuredLine}>{configuredCount(types)} configured</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {types.map(type => {
            const active = type.id === selectedId;
            const off = !type.enabled;
            const Glyph = CODE_GLYPH[type.code ?? ''] ?? Umbrella;
            // The unsaved-edit marker: a dirty chip carries the dot so an
            // admin who flips a rule and switches chip/tab can still SEE
            // that a save is pending (the editor's own Save button is below
            // the fold; the review P2). Inactive on a locked remnant.
            const dirty =
              drafts[type.id] != null && typeDirty(type, drafts[type.id]);
            return (
              <Pressable
                key={type.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${type.name}, ${chipSubLabel(type)}${dirty ? ', unsaved changes' : ''}`}
                onPress={() => setSelectedId(type.id)}
                style={({ pressed }) => [
                  styles.chip,
                  active ? styles.chipActive : styles.chipIdle,
                  // A turned-off type's chip reads muted (the design's
                  // inactive cards) — the "· Off" sub-label names it, the
                  // styling agrees.
                  !active && off && styles.chipOff,
                  pressed && styles.chipPressed,
                ]}>
                <Glyph
                  size={15}
                  color={active ? colors.surfaceCard : off ? colors.textMuted : colors.primary}
                />
                <View style={styles.chipTexts}>
                  <Text
                    numberOfLines={1}
                    style={
                      active ? styles.chipNameActive : off ? styles.chipNameOff : styles.chipNameIdle
                    }>
                    {type.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={active ? styles.chipSubActive : styles.chipSubIdle}>
                    {chipSubLabel(type)}
                  </Text>
                </View>
                {dirty ? <View style={active ? styles.chipDotActive : styles.chipDotIdle} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.editorWrap}>
          <LeaveTypeEditorCard
            type={selected}
            draft={selectedDraft}
            busy={savingSelected}
            // Another type's save in flight: THIS Save must not stack a
            // second PATCH (the pane's latch silently swallowed the press —
            // an enabled button that does nothing — found in the review,
            // 2026-11-26). Disabled, so the button explains itself.
            savingElsewhere={savingId != null && savingId !== selected.id}
            saved={savedId === selected.id}
            error={saveError?.id === selected.id ? saveError.message : null}
            onChange={patch => changeDraft(selected.id, patch)}
            onSave={() => save(selected)}
          />
        </View>
      </ScrollView>
      <ScrollFade />
      {stickyVisible ? (
        <SafeAreaView edges={['bottom']} style={styles.stickyBar} pointerEvents="box-none">
          <View style={styles.stickyCard}>
            <View style={styles.stickyTexts}>
              <Text numberOfLines={1} style={styles.stickyName}>
                {selected.name}
              </Text>
              <Text numberOfLines={1} style={styles.stickyHint}>
                {selectedDirty && !postable && !savingSelected
                  ? 'Rule changes hold while the type is off.'
                  : 'Unsaved changes'}
              </Text>
            </View>
            <Button
              variant="primary"
              size="sm"
              loading={savingSelected}
              disabled={stickyDisabled}
              onPress={() => save(selected)}>
              Save
            </Button>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centerBlock: {
    gap: spacing.s3,
    alignItems: 'stretch',
  },
  pane: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.s8,
  },
  // The sticky bar covers the scroll's last ~60px — the content clears it
  // so the card's own Save is never hidden beneath the bar.
  contentWithBar: {
    paddingBottom: spacing.s8 + 68,
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  stickyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s3,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.sm,
  },
  stickyTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  stickyName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  stickyHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  configuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
    paddingHorizontal: spacing.s1,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  configuredLine: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
  chipRow: {
    gap: spacing.s2,
    paddingRight: spacing.s4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipIdle: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.borderSubtle,
  },
  // A turned-off type's chip: sunken, muted glyph and name (the sub-label
  // already reads "· Off").
  chipOff: {
    backgroundColor: colors.surfaceSunken,
  },
  chipNameOff: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipNameActive: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.surfaceCard,
  },
  chipNameIdle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textStrong,
  },
  chipSubActive: {
    ...typography.caption,
    color: colors.surfaceCard,
    opacity: 0.8,
  },
  chipSubIdle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chipTexts: {
    flexShrink: 1,
  },
  chipDotIdle: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  chipDotActive: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
  },
  editorWrap: {
    marginTop: spacing.s3,
  },
});
