/**
 * useWeeklyOffDefaultForm — the tenant-default form state of
 * `WeeklyOffScreen` (Story 15-6, FR-18): the working day set, the effective
 * date, the dirty/save gating, the submit latch and the post-save re-seed.
 *
 * Extracted so `WeeklyOffScreen.tsx` stays within the ~300-line file limit
 * (15-6 review iteration 1 — the screen had outgrown the limit while three
 * extracted files' docblocks still claimed it was under it). The hook owns
 * state and rules; the screen owns layout, banners and navigation.
 *
 * Rules pinned by the 15-6 reviews and carried over verbatim:
 *  - The working copy seeds ONCE, on the false→true `hasLoaded` edge, from
 *    the canonical days (Sunday shown when never configured, visual only —
 *    `hasTouched` stays false so an untouched Save never PUTs `[7]`).
 *  - The effective date seeds ONLY from the scheduled future edit
 *    (`nextView.validFrom`, review P3) — never from the active default's
 *    own past start, and never from a payload the picker's floor would have
 *    blocked.
 *  - An EMPTY day set saves (the BE treats `days: []` as clearing the
 *    rule); the all-7-days selection blocks (FR-18's mirror).
 *  - Save latches in a ref (review iteration 1): `isSaving` is async state,
 *    so a second press in the window before re-render would fire two PUTs —
 *    the sheets already latched; the default block did not.
 *  - After a successful save the form re-seeds from the returned canonical
 *    (review P4): the BE stamps today on a blank effectiveFrom, so without
 *    the re-seed `hasTouched` stayed lit and an unchanged form re-PUT.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IsoWeekday,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
  WeeklyOffView,
} from '../../../services';
import {
  isWeeklyOffDirty,
  isWeeklyOffSaveDisabled,
  isValidIsoDate,
  SUNDAY,
  viewDays,
} from './weeklyOffModel';

export interface UseWeeklyOffDefaultFormOptions {
  defaultView: WeeklyOffDefaultResponse['default'];
  nextView: WeeklyOffDefaultResponse['next'];
  /** The full ascending range list — the strictly-future rows feed the panel. */
  history: WeeklyOffView[];
  /** BE flag: owner has saved the everyone rule before (R-11). */
  configured: boolean | undefined;
  hasLoaded: boolean;
  isSaving: boolean;
  today: string;
  saveDefault: (
    input: SetWeeklyOffRequest,
  ) => Promise<WeeklyOffDefaultResponse>;
  /** Transient success banner, flashed after a confirmed save. */
  onSaved: (message: string) => void;
}

export function useWeeklyOffDefaultForm({
  defaultView,
  nextView,
  history,
  configured,
  hasLoaded,
  isSaving,
  today,
  saveDefault,
  onSaved,
}: UseWeeklyOffDefaultFormOptions) {
  const [selectedDays, setSelectedDays] = useState<IsoWeekday[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [hasTouched, setHasTouched] = useState(false);
  const submitLatchRef = useRef(false);
  // A queued date already in the past is stale data, never a date to seed:
  // the picker's floor would block it and a Save would reschedule into the
  // past. Treated as "no queued date" for the seed AND the dirty baseline.
  const futureFrom = useCallback(
    (v: WeeklyOffView | null): string =>
      v && v.validFrom >= today ? v.validFrom : '',
    [today],
  );

  const canonicalDays = useMemo<IsoWeekday[]>(
    () => viewDays(defaultView),
    [defaultView],
  );
  // "Never configured" is `canonical.length === 0` AFTER the first load
  // — before the load we can't know yet, so we default to false and let
  // the helper copy show the configured copy until the data arrives.
  // R-11: the BE returns `default: null` both for a company that never
  // configured a rule AND for one whose rule was cleared ("everyone works
  // all 7 days"). The BE `configured` flag tells them apart; an older BE
  // without it falls back to inferring from `history`, and `hasSaved`
  // covers the current session regardless.
  const [hasSaved, setHasSaved] = useState(false);
  const neverConfigured =
    hasLoaded &&
    !hasSaved &&
    nextView === null && // a queued change means a rule was set, whatever the flag says
    (configured !== undefined
      ? !configured
      : canonicalDays.length === 0 &&
        nextView === null &&
        history.length === 0);
  // The form's target = what the owner is working towards: the queued
  // change when there is one (R-07), else the current rule. Same source
  // for the seed AND the dirty baseline, so undo returns to a clean form.
  const targetDays = useMemo<IsoWeekday[]>(
    () => (nextView && futureFrom(nextView) ? nextView.days : canonicalDays),
    [nextView, canonicalDays, futureFrom],
  );

  // Seed the working copy when the data first arrives, and RE-seed when the
  // server rule (the seed target: queued change else current rule, plus the
  // queued date) changes underneath us — pull-to-refresh or a focus refetch
  // after another device edited it (R-22). Unsaved edits are never
  // overwritten: while the working copy differs from what we last seeded the
  // owner is mid-edit, so we wait; once they undo back to the seed (or save)
  // the new server rule is applied. Each remount (push/pop) also re-seeds.
  // `seededRef` holds what the form was last set to (null = never seeded).
  const seededRef = useRef<{ days: string; from: string } | null>(null);
  useEffect(() => {
    if (!hasLoaded) return;
    const nextFrom = futureFrom(nextView);
    // Sunday is suggested (visual only) ONLY when never configured; a
    // cleared rule shows no day off (R-11).
    const seedDays =
      targetDays.length > 0 ? targetDays : neverConfigured ? [SUNDAY] : [];
    // The key is built from what is actually SEEDED (not the raw target), so
    // the never-configured Sunday suggestion matches `seededRef` and the
    // effect settles instead of re-seeding on every render.
    const key = {
      days: [...seedDays].sort((a, b) => a - b).join(','),
      from: nextFrom,
    };
    const seeded = seededRef.current;
    if (seeded !== null) {
      if (seeded.days === key.days && seeded.from === key.from) return;
      const edited =
        hasTouched &&
        (seeded.days !== [...selectedDays].sort((a, b) => a - b).join(',') ||
          seeded.from !== effectiveFrom);
      if (edited) return;
    }
    seededRef.current = key;
    setSelectedDays(seedDays);
    // Seed ONLY from the scheduled future edit (`nextView.validFrom`) —
    // never from the active default's own start (15-6 review P3), which
    // is typically in the past and would make the very first Save a
    // reschedule to that past date (silently clamped per AD-8). Empty
    // stays as "use today" for the save call — the BE treats absence as
    // today (AD-8).
    setEffectiveFrom(nextFrom);
    setHasTouched(false);
  }, [
    hasLoaded,
    targetDays,
    neverConfigured,
    nextView,
    futureFrom,
    hasTouched,
    selectedDays,
    effectiveFrom,
  ]);

  const workingDays = useMemo(
    () => [...selectedDays].sort((a, b) => a - b),
    [selectedDays],
  );
  const canonicalSorted = useMemo(
    () => [...targetDays].sort((a, b) => a - b),
    [targetDays],
  );

  const sevenSelected = workingDays.length === 7;
  const noWorkingDays = workingDays.length === 0;
  // The field is a `DatePickerField` (Pressable + inline calendar) — it can
  // only emit a real `YYYY-MM-DD`, never hand-typed text (Spec Change Log 1
  // replaced the original text input). The calendar check still guards the
  // wire: "2026-02-31" matches the shape but is not a date (review P11).
  const dateValid = effectiveFrom === '' || isValidIsoDate(effectiveFrom);

  // Dirty iff the user touched something AND the working copy diverges
  // from the canonical — see `isWeeklyOffDirty`. `effectiveCanonicalFrom`
  // mirrors the seed's `nextView`-only rule, so a fresh mount after a
  // save-with-future-effectiveFrom doesn't spuriously light up Save.
  const effectiveCanonicalFrom = futureFrom(nextView) || null;
  const effectiveDateChanged =
    effectiveCanonicalFrom !== null && effectiveFrom !== effectiveCanonicalFrom;
  // No rule in effect (never configured, or cleared): nothing is saved yet,
  // so the owner's first touch is the choice to save — including "no day
  // off", which the screen copy spells out. An untouched form stays off.
  const noRuleInEffect = hasLoaded && defaultView === null && nextView === null;
  const dirty = noRuleInEffect
    ? hasTouched
    : isWeeklyOffDirty({
        hasTouched,
        effectiveDateChanged,
        workingDays,
        canonicalDays: canonicalSorted,
      });

  const saveDisabled = isWeeklyOffSaveDisabled({
    dirty,
    workingDays,
    dateValid,
    isSaving,
  });

  // Future rows for the "Upcoming changes" panel. `history` is the full
  // ascending effective-dated list; anything strictly after today is future
  // (past rows never appear in the panel — the list screen owns history).
  const upcoming = useMemo(
    () => (hasLoaded ? history.filter((h) => h.validFrom > today) : []),
    [hasLoaded, history, today],
  );

  const onDayToggle = useCallback((next: IsoWeekday[]) => {
    setHasTouched(true);
    setSelectedDays(next);
  }, []);

  const onEffectiveFromChange = useCallback((v: string) => {
    setHasTouched(true);
    setEffectiveFrom(v);
  }, []);

  const onSave = useCallback(async () => {
    if (saveDisabled || submitLatchRef.current) return;
    submitLatchRef.current = true;
    try {
      // saveDefault returns the re-fetched GET (canonical), falling back
      // to the PUT echo only if that re-fetch failed.
      const fresh = await saveDefault({
        days: workingDays,
        effectiveFrom: effectiveFrom || undefined,
      });
      onSaved('Weekly off saved');
      // Re-seed the working copy from the canonical response (15-6
      // review P4): the BE stamps today on a blank effectiveFrom, so
      // without this `hasTouched` stayed lit, the form read dirty and a
      // second tap re-PUT the same change. Resetting `hasTouched` alone
      // is not enough when the server merged/normalised the range —
      // re-seed so the form shows the server's truth.
      // Seed from the same target rule as the first load: the queued
      // change if any (R-07), else the current rule; an empty saved rule
      // stays empty (R-11 — `hasSaved` stops the Sunday suggestion).
      setHasSaved(true);
      setHasTouched(false);
      const freshDays = futureFrom(fresh.next)
        ? fresh.next!.days
        : viewDays(fresh.default);
      seededRef.current = {
        days: [...freshDays].sort((a, b) => a - b).join(','),
        from: futureFrom(fresh.next),
      };
      setSelectedDays(freshDays);
      setEffectiveFrom(futureFrom(fresh.next));
    } catch {
      // saveError is surfaced in the banner area; form stays populated so
      // the user can retry without re-entering.
    } finally {
      submitLatchRef.current = false;
    }
  }, [saveDisabled, saveDefault, workingDays, effectiveFrom, onSaved, futureFrom]);

  return {
    neverConfigured,
    selectedDays,
    effectiveFrom,
    sevenSelected,
    noWorkingDays,
    saveDisabled,
    upcoming,
    onDayToggle,
    onEffectiveFromChange,
    onSave,
  };
}
