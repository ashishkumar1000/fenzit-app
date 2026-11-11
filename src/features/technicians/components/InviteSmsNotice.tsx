/**
 * InviteSmsNotice — the owner's view of an invite SMS: a status line when the
 * text did not go out, and a Resend button for a company admin.
 *
 * Used under an invited employee's row and under New Job's employee picker.
 * Renders nothing when there is nothing to say (an invite whose SMS was sent).
 *
 * Rules (spec-invite-sms-download-link, story 21-4):
 *   - failed → line + Resend; not_configured → line only;
 *   - refused_cap (from the invite) → cap line, no button;
 *   - 429 from Resend → cap line, button disabled;
 *   - Resend is for company admins only (the server checks again).
 */
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Button, InlineNotice } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { INVITE_SMS_CAP_COPY, inviteSmsStatusLine } from '../inviteSms';
import { useResendInviteSms } from '../useResendInviteSms';
import type { InviteSmsStatus } from '../types';

type Props = {
  /** The invited membership's user id (the resend endpoint's path id). */
  membershipUserId: string;
  smsStatus: InviteSmsStatus | null;
  /** Invited and not yet joined. Lets the admin resend from the row later. */
  isInvited: boolean;
  /** Company admin only. */
  canResend: boolean;
  /** Called after a successful Resend with the new status (the row persists it). */
  onStatus?: (status: InviteSmsStatus) => void;
};

export function InviteSmsNotice({
  membershipUserId,
  smsStatus,
  isInvited,
  canResend,
  onStatus,
}: Props) {
  const r = useResendInviteSms(membershipUserId, smsStatus, onStatus);

  const lineCopy = r.capReached ? INVITE_SMS_CAP_COPY : inviteSmsStatusLine(r.smsStatus);
  // refused_cap from the invite: the reason replaces the button.
  const capFromInvite = r.smsStatus === 'refused_cap' && !r.capReached;
  // Resend belongs to invited people only. Once the employee is active, it is hidden.
  const showResend =
    canResend &&
    isInvited &&
    !r.forbidden &&
    !r.gone &&
    !capFromInvite &&
    r.smsStatus !== 'not_configured';

  // The line appears after an async result, so it is announced directly.
  useEffect(() => {
    if (lineCopy) AccessibilityInfo.announceForAccessibility(lineCopy);
  }, [lineCopy]);

  if (!lineCopy && !showResend && !r.errorCopy) return null;

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {lineCopy ? (
        <InlineNotice
          message={lineCopy}
          tone={r.smsStatus === 'not_configured' ? 'neutral' : 'warning'}
        />
      ) : null}
      {showResend ? (
        <Button
          variant="primary"
          size="md"
          fullWidth
          loading={r.inFlight}
          disabled={r.capReached}
          onPress={r.resend}
          accessibilityRole="button"
          accessibilityLabel="Resend SMS">
          Resend SMS
        </Button>
      ) : null}
      {r.errorCopy ? <Text style={styles.error}>{r.errorCopy}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  error: {
    ...typography.bodySm,
    color: colors.danger,
  },
});
