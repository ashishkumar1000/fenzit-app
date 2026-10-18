/**
 * useScrollFieldIntoView — when a typed field gets focus, scroll the form so
 * the whole field sits clear of the keyboard. Android's own auto-scroll only
 * reveals the field's top edge, which leaves the box half under the keys.
 *
 * Wire `scrollRef` + `onScroll` (scrollEventThrottle) onto the ScrollView and
 * pass `onFieldFocus` as the field's onFocus.
 */
import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  TextInputFocusEvent,
} from 'react-native';

/** Breathing room kept above the focused field, in dp. */
const TOP_GAP = 120;
/** The keyboard opens (and the viewport shrinks) just after focus fires. */
const SETTLE_MS = 150;

export function useScrollFieldIntoView() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending scroll must not fire after the screen is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onFieldFocus = useCallback((e: TextInputFocusEvent) => {
    const field = e.currentTarget;
    if (typeof field === 'number') return;
    // Quick field-to-field focus changes: only the latest scroll runs.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const scroll = scrollRef.current;
      if (!scroll || !field) return;
      scroll.measureInWindow((_x, scrollTop) => {
        field.measureInWindow((_fx, fieldTop) => {
          const fieldInContent = fieldTop - scrollTop + scrollY.current;
          scroll.scrollTo({ y: Math.max(0, fieldInContent - TOP_GAP), animated: true });
        });
      });
    }, SETTLE_MS);
  }, []);

  return { scrollRef, onScroll, onFieldFocus };
}
