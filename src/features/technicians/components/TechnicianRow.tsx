/**
 * TechnicianRow — a single technician in the list: avatar, name, phone and a
 * status badge (Active / Offline). Composes Card + Avatar + Badge. The
 * employee code (EMP-004) prefixes the phone line when known — freshly
 * invited rows hydrate it later, so it renders fail-hidden.
 */
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import { Avatar, Badge, Card, IconButton } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { Technician } from '../types';
import { membershipUserIdOf } from '../inviteSms';
import { InviteSmsNotice } from './InviteSmsNotice';

type Props = {
  technician: Technician;
  onPress?: (technician: Technician) => void;
  /** Company admin only: shows the invite SMS status and the Resend action. */
  canResend?: boolean;
};

/** Indian mobile numbers are 10 digits; anything else is dialled as typed. */
function dialNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : digits;
}

export function TechnicianRow({ technician, onPress, canResend = false }: Props) {
  const isActive = technician.status === 'active';

  return (
    <Card
      padding="md"
      interactive={Boolean(onPress)}
      onPress={onPress ? () => onPress(technician) : undefined}
      style={isActive ? undefined : styles.inactiveCard}>
      <View style={styles.row}>
        <Avatar name={technician.name} uri={technician.avatarUrl ?? null} size="lg" />

        <View style={styles.info}>
          <Text style={[styles.name, !isActive && styles.inactiveName]} numberOfLines={1}>
            {technician.name}
          </Text>
          <View style={styles.meta}>
            {technician.employeeCode ? (
              <Badge status="neutral">{technician.employeeCode}</Badge>
            ) : null}
            <Text style={styles.phone} numberOfLines={1}>
              {technician.phone}
            </Text>
            <Badge status={isActive ? 'done' : 'neutral'} dot>
              {isActive ? 'Active' : 'Offline'}
            </Badge>
          </View>
        </View>

        <IconButton
          label={`Call ${technician.name}`}
          variant="ghost"
          size="md"
          onPress={() => void Linking.openURL(`tel:${dialNumber(technician.phone)}`)}>
          <Phone size={18} color={colors.primary} strokeWidth={2} />
        </IconButton>
      </View>

      {canResend ? (
        <View style={styles.actionArea}>
          <InviteSmsNotice
            membershipUserId={membershipUserIdOf(technician.id)}
            smsStatus={technician.smsStatus ?? null}
            isInvited={!isActive}
            canResend={canResend}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  actionArea: {
    marginTop: spacing.s2,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  // Not active yet: the whole card reads grey, so the owner can tell at a glance.
  inactiveCard: {
    backgroundColor: colors.surfaceSunken,
  },
  inactiveName: {
    color: colors.textMuted,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.s2,
  },
  name: {
    ...typography.heading,
    fontSize: 16,
    color: colors.textStrong,
  },
  phone: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
