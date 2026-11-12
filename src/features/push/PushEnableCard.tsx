/**
 * PushEnableCard — the one-time "Turn on notifications?" card on the
 * signed-in user's home surface (UX spec, resolved Open Question 1): Home
 * and Jobs for admins, Today for technicians. The inbox card alone is
 * visit-driven — the users push would help most never see it.
 *
 * Rules (frozen per the spec):
 *   - shown ONLY while notifications are actually off (the same
 *     all-Android probe the inbox card uses — RNFB hasPermission maps to
 *     areNotificationsEnabled, so a switched-off-in-Settings phone reads
 *     as off on every Android version);
 *   - "Not now" hides the card for the rest of this app session; it comes
 *     back on the next launch. After two dismissals it stops for good;
 *   - a denied Allow request suppresses the card for good (the OS has made
 *     its own decision, and Settings is the way back);
 *   - the OS prompt fires ONLY from the Allow tap — never at boot;
 *   - a can't-prompt outcome (older Android, don't-ask-again, iOS
 *     already-denied) hands off to the app's Settings, then suppresses —
 *     the user made their choice either way.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BellRing } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, radius, shadow, spacing, typography, weight } from '../../theme';
import { storage } from '../../services/storage';
import PushCardBackdrop from './PushCardBackdrop';
import {
  notificationPermissionState,
  requestNotificationPermission,
} from './notificationPermission';

// Copy constants (UX spec final copy): named, in one place.
/** Bottom space screens reserve for the pinned card (card + its margin). */
export const PUSH_CARD_CLEARANCE = 96;

const CARD_TITLE = 'Enable Alerts';
const CARD_BODY = 'Never miss shifts or check-ins';
const ALLOW_LABEL = 'Allow';
const DISMISS_LABEL = 'Later';

/** MMKV suppression flag — set on a denied Allow; survives app updates (per install). */
const SUPPRESSED_KEY = 'fenzit.push.homeEnableCardSuppressed';
/** How many times "Not now" has been tapped; the card stops at MAX_DISMISSALS. */
const DISMISS_COUNT_KEY = 'fenzit.push.homeEnableCardDismissals';
/** The app session in which the last "Not now" was tapped. */
const DISMISSED_SESSION_KEY = 'fenzit.push.homeEnableCardDismissedSession';
const MAX_DISMISSALS = 2;
/** One id per app launch: a new launch is a new session. */
// Kept on globalThis so a Fast Refresh does not start a new session.
const GLOBAL_SESSION = globalThis as { __fenzitPushSession?: string };
if (!GLOBAL_SESSION.__fenzitPushSession) {
  GLOBAL_SESSION.__fenzitPushSession = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const SESSION_ID = GLOBAL_SESSION.__fenzitPushSession;

export function PushEnableCard({
  onVisibleChange,
}: {
  /** Tells the screen whether the card is on screen, so it can reserve space. */
  onVisibleChange?: (visible: boolean) => void;
} = {}) {
  // 'checking' renders nothing — no flash on a phone where it must not show.
  const [state, setState] = useState<'checking' | 'off' | 'done'>('checking');
  const [asking, setAsking] = useState(false);

  const onVisibleRef = useRef(onVisibleChange);
  onVisibleRef.current = onVisibleChange;
  const visible = state === 'off';
  useEffect(() => {
    onVisibleRef.current?.(visible);
  }, [visible]);
  useEffect(() => () => onVisibleRef.current?.(false), []);

  // Focus-probe (not mount): a grant made elsewhere (Settings, the inbox
  // card) collapses this card on the next look too.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void notificationPermissionState().then(granted => {
        const hidden =
          granted === 'granted' ||
          storage.getBoolean(SUPPRESSED_KEY) === true ||
          (storage.getNumber(DISMISS_COUNT_KEY) ?? 0) >= MAX_DISMISSALS ||
          storage.getString(DISMISSED_SESSION_KEY) === SESSION_ID;
        if (active) setState(hidden ? 'done' : 'off');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const suppress = () => {
    storage.set(SUPPRESSED_KEY, true);
    setState('done');
  };

  // "Not now": hide for this session only, and count it.
  const dismissForNow = () => {
    storage.set(DISMISS_COUNT_KEY, (storage.getNumber(DISMISS_COUNT_KEY) ?? 0) + 1);
    storage.set(DISMISSED_SESSION_KEY, SESSION_ID);
    setState('done');
  };

  const handleAllow = async () => {
    setAsking(true);
    try {
      const result = await requestNotificationPermission();
      if (result === 'never_ask') {
        // The OS will not prompt again: Settings is the only way back.
        await Linking.openSettings();
      }
      const granted = await notificationPermissionState();
      if (granted === 'granted') {
        setState('done');
      } else if (result === 'never_ask') {
        // Blocked for good: the card never returns this install.
        suppress();
      } else {
        // A plain "Don't allow": treated like "Later" (hidden for this
        // session, counted towards the two dismissals).
        dismissForNow();
      }
    } finally {
      setAsking(false);
    }
  };

  if (state !== 'off') return null;

  return (
    <View style={styles.card}>
      <PushCardBackdrop side="start" />
      <PushCardBackdrop side="center" />
      <PushCardBackdrop side="end" />
      <View style={styles.iconWrap}>
        <BellRing size={18} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{CARD_TITLE}</Text>
        <Text style={styles.body} numberOfLines={1}>{CARD_BODY}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="md"
          onPress={dismissForNow}
          disabled={asking}>
          {DISMISS_LABEL}
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={asking}
          accessibilityLabel="Allow Notifications"
          onPress={() => void handleAllow()}>
          {asking ? 'Please wait…' : ALLOW_LABEL}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Attached to the top edge of the tab bar, full width, square corners;
    // screens reserve PUSH_CARD_CLEARANCE below their last row.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    ...shadow.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  textWrap: {
    flex: 1,
    gap: spacing.s1,
  },
  title: {
    ...typography.body,
    fontWeight: weight.semibold,
    color: colors.textStrong,
  },
  body: {
    ...typography.caption,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
});
