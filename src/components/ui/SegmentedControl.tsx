/**
 * SegmentedControl — the Design System's single-select segmented control: a
 * sunken track holding equal-width segments, exactly one active. For 2–5
 * short, mutually exclusive options that switch a view instantly (the Apple
 * HIG / Material 3 "segmented button" use case).
 *
 * Not a filter: changing a segment changes *which view you're looking at*
 * (e.g. the Jobs tab's timeline scopes). For filtering a result set, use a
 * filter chip bar (e.g. `StatusFilterBar`) — its soft-tint active state reads
 * as "filter", while this control's raised-card active segment reads as
 * "you are here".
 *
 * Options are caller-supplied `{ value, label }` pairs (plus an optional
 * count `badge` and leading `icon`), so the control stays
 * vocabulary-free — it renders whatever enum the caller owns. `value`s must
 * be unique (they're React keys and the selection identity); 2–5 options.
 *
 * Each segment is a `Pressable` carrying `accessibilityRole="button"` and
 * `accessibilityState.selected` (the same contract as the chip primitives),
 * so screen readers announce the active segment — the raised-card styling
 * alone doesn't. Pressing the already-active segment is a no-op (no
 * redundant `onChange`).
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, shadow, spacing, touch, weight } from '../../theme';

export type SegmentOption<V extends string> = {
  value: V;
  label: string;
  badge?: number;
  /** Optional leading glyph (the attendance page's calendar glyphs) —
   *  rendered before the label, in caller-chosen colors. */
  icon?: ReactNode;
};

type Props<V extends string> = {
  options: ReadonlyArray<SegmentOption<V>>;
  value: V;
  onChange: (next: V) => void;
  /**
   * How segments get their width. `equal` (default) — the M3 look: every
   * segment shares the track equally. `content` — each segment wraps its
   * label (the track scrolls horizontally if the labels overflow, e.g. five
   * long scopes on a small phone); use it when equal slots would truncate
   * the labels. The visual language (sunken track, raised active pill) is
   * the same either way.
   */
  sizing?: 'equal' | 'content';
};

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  sizing = 'equal',
}: Props<V>) {
  const track = (
    <View style={styles.track}>
      {options.map((option, index) => {
        const active = option.value === value;
        // iOS-style hairline divider between adjacent inactive segments —
        // inactive segments have no pill of their own, so the divider is
        // what makes the boundary readable. Neither side of an active
        // segment needs one (the raised card already separates it).
        const prevActive = index > 0 && options[index - 1].value === value;
        return (
          <Fragment key={option.value}>
            {index > 0 && !active && !prevActive ? <View style={styles.divider} /> : null}
            <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            // No-op on the already-active segment: a view switch control
            // shouldn't re-announce a view you're already on (and callers
            // shouldn't get a redundant onChange/refetch).
            onPress={() => {
              if (!active) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              sizing === 'equal' ? styles.segmentEqual : styles.segmentContent,
              active ? styles.segmentActive : null,
              pressed ? styles.segmentPressed : null,
            ]}>
            <View style={styles.labelContainer}>
              {option.icon}
              <Text
                numberOfLines={1}
                style={[styles.label, active ? styles.labelActive : null]}>
                {option.label}
              </Text>
              {option.badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{option.badge}</Text>
                </View>
              )}
            </View>
          </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
  if (sizing === 'equal') return track;
  // Content mode: a horizontally scrollable track so an overflowing label
  // set degrades to a swipe, never to truncation. No scroll indicator — the
  // cut-off pill edge at the viewport border already signals scrollability.
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contentTrackScroll}>
      {track}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.s1,
    gap: spacing.s2,
  },
  segment: {
    // touch.min per segment: each one is an independent tap target and the DS
    // floor for those is 44px (the track is therefore 44 + 2 × s1 = 52 tall).
    height: touch.min,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    // Reserved edge space: inactive segments have no pill of their own, so
    // when labels run long the centring slack can shrink to zero and
    // neighbouring words read as one sentence. The padding guarantees every
    // label keeps air on both sides; a label that still can't fit ellipsises
    // (numberOfLines={1}) rather than colliding.
    paddingHorizontal: spacing.s3,
  },
  // Equal mode — the M3 look: every segment shares the track equally.
  segmentEqual: {
    flex: 1,
    // Narrower edge padding than content mode: equal mode always has few,
    // short labels, and the room goes to keeping them whole (four scopes
    // with a badge truncate at the content-mode padding).
    paddingHorizontal: spacing.s2,
  },
  // Content mode — each segment wraps its label (minimum width so a very
  // short label still holds a comfortable tap target); the track scrolls.
  segmentContent: {
    minWidth: 64,
  },
  contentTrackScroll: {
    // The ScrollView's content container grows with the track; the track
    // itself must not stretch to the viewport (or 'content' would behave
    // exactly like 'equal' on wide-enough screens).
    alignSelf: 'flex-start',
  },
  divider: {
    width: 1,
    alignSelf: 'center',
    height: spacing.s5,
    backgroundColor: colors.borderDefault,
  },
  segmentActive: {
    backgroundColor: colors.surfaceCard,
    ...shadow.sm,
  },
  segmentPressed: {
    opacity: 0.8,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: colors.textBody,
  },
  labelActive: {
    color: colors.textStrong,
  },
  badge: {
    minWidth: spacing.s5,
    height: spacing.s5,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s1,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: weight.bold,
    color: colors.textOnColor,
  },
});
