/**
 * TodayHeader — the Today tab's header (the approved redesign): the
 * initials avatar (the DS Avatar's onColor variant, squared to the
 * mockup's chip) with the connectivity dot, the time-of-day greeting,
 * and the notifications bell on a card chip. The dot is REAL state, not
 * decoration — green when NetInfo reports a connection, gray when not,
 * hidden until the first read so it never lies on launch.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Avatar, IconButton } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { greetingForNow } from '../../../utils';
import { bellBadgeLabel } from '../../notifications/bellBadge';

type Props = {
  name: string | null;
  /** NetInfo connectivity; null until the first read (dot hidden, not gray). */
  online: boolean | null;
  unreadCount: number | null;
  onPressBell: () => void;
};

export function TodayHeader({ name, online, unreadCount, onPressBell }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.avatarWrap}>
        <Avatar
          name={name ?? undefined}
          size="lg"
          variant="onColor"
          style={styles.avatar}
        />
        {online !== null ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: online ? colors.success : colors.textMuted },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.titles}>
        <Text style={styles.greeting} numberOfLines={1}>
          {name ? `${greetingForNow()}, ${name}` : greetingForNow()}
        </Text>
      </View>

      <IconButton
        variant="ghost"
        size="md"
        label="Notifications"
        onPress={onPressBell}
        style={styles.bellChip}>
        <Bell size={20} color={colors.textStrong} strokeWidth={2} />
        {unreadCount !== null && unreadCount > 0 ? (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{bellBadgeLabel(unreadCount)}</Text>
          </View>
        ) : null}
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  avatarWrap: {
    // Room for the dot's overhang without clipping.
    padding: 3,
  },
  avatar: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.surfacePage,
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  greeting: {
    ...typography.title,
    fontSize: 21,
    color: colors.textStrong,
  },
  bellChip: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    ...typography.captionStrong,
    color: colors.onPrimary,
  },
});
