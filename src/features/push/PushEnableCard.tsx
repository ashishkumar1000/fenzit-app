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
 *   - once per install: a "Not now" dismissal OR a denied Allow request
 *     sets the MMKV suppression flag and the card never returns;
 *   - the OS prompt fires ONLY from the Allow tap — never at boot;
 *   - a can't-prompt outcome (older Android, don't-ask-again, iOS
 *     already-denied) hands off to the app's Settings, then suppresses —
 *     the user made their choice either way.
 */
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BellRing } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, radius, shadow, spacing, typography, weight } from '../../theme';
import { storage } from '../../services/storage';
import {
  notificationPermissionState,
  requestNotificationPermission,
} from './notificationPermission';

// Copy constants (UX spec final copy): named, in one place.
const CARD_TITLE = 'Turn on notifications?';
const CARD_BODY =
  'Job assignments, attendance and leave updates — even when the app is closed.';
const ALLOW_LABEL = 'Allow';
const DISMISS_LABEL = 'Not now';

/** MMKV suppression flag — set on dismissal or denial; survives app updates (per install). */
const SUPPRESSED_KEY = 'fenzit.push.homeEnableCardSuppressed';

export function PushEnableCard() {
  // 'checking' renders nothing — no flash on a phone where it must not show.
  const [state, setState] = useState<'checking' | 'off' | 'done'>('checking');
  const [asking, setAsking] = useState(false);

  // Focus-probe (not mount): a grant made elsewhere (Settings, the inbox
  // card) collapses this card on the next look too.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void notificationPermissionState().then(granted => {
        if (active) setState(granted || storage.getBoolean(SUPPRESSED_KEY) === true ? 'done' : 'off');
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

  const handleAllow = async () => {
    setAsking(true);
    try {
      const result = await requestNotificationPermission();
      if (result !== 'granted') {
        await Linking.openSettings();
      }
      const granted = await notificationPermissionState();
      if (granted) {
        setState('done');
      } else {
        // A denial (prompt said no, Settings left off, never-ask) — the
        // user decided; the card never returns this install.
        suppress();
      }
    } finally {
      setAsking(false);
    }
  };

  if (state !== 'off') return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <BellRing size={18} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{CARD_TITLE}</Text>
        <Text style={styles.body}>{CARD_BODY}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          disabled={asking}
          accessibilityLabel="Allow Notifications"
          onPress={() => void handleAllow()}>
          {asking ? 'Please wait…' : ALLOW_LABEL}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={suppress}
          disabled={asking}>
          {DISMISS_LABEL}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    ...shadow.xs,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
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
