/**
 * PushPermissionCard — the inbox's inline permission card. It matches the
 * Home card's banner (PushEnableCard): one row with the icon and text, the
 * sound-wave backdrop, and the buttons on the right.
 *
 * Rendered by NotificationsScreen ABOVE the list while the OS permission
 * is not granted. Two actions:
 *   - Allow: fires the OS prompt in context. Any outcome that cannot prompt
 *     (Android "don't ask again", older Android, iOS already-denied) hands
 *     off to the app's Settings, so Allow is also the way to Settings.

 * The card shows every time this page opens while notifications are off.
 *
 * The probe re-runs on every screen focus, so returning from Settings hides
 * the card the moment the permission is granted.
 */
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BellRing } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, radius, shadow, spacing, typography, weight } from '../../theme';
import PushCardBackdrop from './PushCardBackdrop';
import {
  notificationPermissionState,
  requestNotificationPermission,
} from './notificationPermission';

// Copy: the inbox card's push-facing strings, named, in one place.
const CARD_TITLE = 'Notifications are off';
const CARD_BODY = 'Job and leave alerts, even when the app is closed.';
const ALLOW_LABEL = 'Allow';

export function PushPermissionCard() {
  // 'checking' renders nothing — no flash of a card that's about to hide.
  const [state, setState] = useState<'checking' | 'off' | 'granted'>('checking');
  const [asking, setAsking] = useState(false);

  // Focus (not mount): returning from Settings refreshes the state the
  // card renders from, and a new visit shows the card again.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void notificationPermissionState().then(granted => {
        if (active) setState(granted === 'granted' ? 'granted' : 'off');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const handleAllow = async () => {
    setAsking(true);
    try {
      const result = await requestNotificationPermission();
      // Blocked for good: the OS will not prompt again, so Settings is the way back.
      if (result === 'never_ask') {
        await Linking.openSettings();
      }
      const granted = await notificationPermissionState();
      setState(granted === 'granted' ? 'granted' : 'off');
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s3,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
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
