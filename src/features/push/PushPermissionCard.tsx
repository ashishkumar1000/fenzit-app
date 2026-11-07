/**
 * PushPermissionCard — the inbox's inline permission card (Firebase plan
 * task: NotificationsScreen shows it "while notifications are off",
 * the existing-installs context ask; new installs get the primer row).
 *
 * Rendered by NotificationsScreen ABOVE the list while the OS permission
 * is not granted. Two actions:
 *   - Allow: fires the OS prompt in context. Android's permanently-denied
 *     answer ('never_ask') routes to app Settings directly (the OS will
 *     not re-prompt).
 *   - "Open settings": always available — the manual way back (iOS has no
 *     never-ask signal at all; Android's never-ask users may prefer it).
 *
 * Denial keeps today's in-app-only behaviour: the card is the only thing
 * that changes. The probe re-runs on every screen focus, so returning from
 * Settings collapses the card the moment the permission is granted.
 */
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, Settings2 } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, radius, spacing, typography, weight } from '../../theme';
import {
  notificationPermissionState,
  requestNotificationPermission,
} from './notificationPermission';

// Copy constants (UX pass pending — Sally's spec will revise the wording):
// the inbox card's push-facing strings live here, named, in one place.
const CARD_TITLE = 'Notifications are off';
const CARD_BODY =
  'Turn them on to hear about job assignments, leave decisions and reports — even when the app is closed.';
const ALLOW_LABEL = 'Allow';
const OPEN_SETTINGS_LABEL = 'Open settings';

export function PushPermissionCard() {
  // 'checking' renders nothing — no flash of a card that's about to hide.
  const [state, setState] = useState<'checking' | 'off' | 'granted'>('checking');
  const [asking, setAsking] = useState(false);

  // Focus (not mount): returning from Settings refreshes the state the
  // card renders from. The focus effect returns the cleanup pair the hook
  // contract expects.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void notificationPermissionState().then(granted => {
        if (active) setState(granted ? 'granted' : 'off');
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
      // UX spec: any can't-prompt outcome (older Android, don't-ask-again,
      // iOS already-denied) hands off straight to the app's Settings; the
      // focus probe below collapses the card the moment it is granted.
      if (result !== 'granted') {
        await Linking.openSettings();
      }
      const granted = await notificationPermissionState();
      setState(granted ? 'granted' : 'off');
    } finally {
      setAsking(false);
    }
  };

  const handleOpenSettings = () => {
    void Linking.openSettings();
  };

  if (state !== 'off') return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Bell size={18} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{CARD_TITLE}</Text>
        <Text style={styles.body}>{CARD_BODY}</Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={handleOpenSettings}
          leadingIcon={<Settings2 size={14} color={colors.textMuted} strokeWidth={2} />}>
          {OPEN_SETTINGS_LABEL}
        </Button>
      </View>
      <Button
        variant="primary"
        size="sm"
        disabled={asking}
        accessibilityLabel="Allow Notifications"
        onPress={() => void handleAllow()}>
        {asking ? 'Please wait…' : ALLOW_LABEL}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    margin: spacing.s4,
    marginTop: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
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
});
