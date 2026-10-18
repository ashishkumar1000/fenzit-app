/**
 * useUnsavedChangesGuard — asks before a screen with unsaved edits is left
 * (header back, device back, swipe). React Navigation's `beforeRemove` fires
 * for all of them; the leave is held, the owner is asked, and "Discard"
 * replays the held action. Saving or archiving calls `allowLeave()` first so
 * their own `goBack()` is never intercepted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigationAction, NavigationProp, ParamListBase } from '@react-navigation/native';

export function useUnsavedChangesGuard(
  navigation: Pick<NavigationProp<ParamListBase>, 'addListener' | 'dispatch'>,
  dirty: boolean,
) {
  const [askOpen, setAskOpen] = useState(false);
  const heldAction = useRef<NavigationAction | null>(null);
  const allowed = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || allowed.current) return;
      e.preventDefault();
      heldAction.current = e.data.action;
      setAskOpen(true);
    });
  }, [navigation, dirty]);

  const allowLeave = useCallback(() => {
    allowed.current = true;
  }, []);

  const keepEditing = useCallback(() => {
    heldAction.current = null;
    setAskOpen(false);
  }, []);

  const discard = useCallback(() => {
    const action = heldAction.current;
    heldAction.current = null;
    allowed.current = true;
    setAskOpen(false);
    if (action) navigation.dispatch(action);
  }, [navigation]);

  return { askOpen, keepEditing, discard, allowLeave };
}
