import { Pressable, StyleSheet, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { colors, palette, radius, spacing } from '../theme';

export interface NotificationBellProps {
  /**
   * Live unread-notification count — drives the red dot.
   * `null` until the first count lands: no dot yet, never a fake "read".
   */
  unreadCount: number | null;
  /** Bell tap → the Notifications screen. */
  onPress: () => void;
  /**
   * Where the bell sits. `onBrand` is the white-on-blue header; `onPage` is
   * the light page background of the first-run Home.
   */
  variant?: 'onBrand' | 'onPage';
}

/**
 * The Home bell (Story 3.4). Shared by the established Home header and the
 * first-run Home header so the entry point to notifications is never missing.
 * The label carries the unread state (the dot is visual only).
 */
export default function NotificationBell({
  unreadCount,
  onPress,
  variant = 'onBrand',
}: NotificationBellProps) {
  const hasUnread = unreadCount !== null && unreadCount > 0;
  const onPage = variant === 'onPage';
  return (
    <Pressable
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      accessibilityHint="Opens your notifications"
      onPress={onPress}>
      <View style={[styles.badge, onPage ? styles.badgeOnPage : styles.badgeOnBrand]}>
        <Bell
          color={onPage ? colors.textStrong : colors.surfaceCard}
          size={24}
          strokeWidth={1.5}
        />
        {hasUnread ? <View style={styles.dot} importantForAccessibility="no" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: spacing.s2,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeOnBrand: {
    backgroundColor: colors.onPrimarySoft,
  },
  badgeOnPage: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.red500,
  },
});
