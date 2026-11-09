import { useEffect, useRef, useState, type ElementRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Linking,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import { Building2, Calendar, RefreshCw } from 'lucide-react-native';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { colors, radius, spacing, typography } from '../../theme';
import { getMyProfileError, getMyProfileSnapshot, loadMyProfile } from '../profile/useMyProfile';
import { formatExpiryDateIst, isSubscriptionExpired } from './subscriptionDate';
import { ExpiredHeroIcon } from './ExpiredHeroIcon';
import { RoadblockModal } from './RoadblockModal';

interface SubscriptionExpiredScreenProps {
  /** Company validity (UTC ISO string), or null when no date is set. */
  validUntil: string | null;
  /** Support contact from config (`support_email`, `support_phone`). */
  supportEmail: string;
  supportPhone: string;
}

/**
 * Modal roadblock for the company OWNER once the company's validity has
 * passed. Design from the design team (2026-11-09). No data beyond the
 * expiry, no navigation, and no dismiss. The only action that changes state
 * is "Check renewal status", which re-reads the profile. Log out was removed
 * by owner decision. The Call and Email buttons open the dialler and mail
 * app, which the earlier spec ruled out; the owner accepted that.
 */
export function SubscriptionExpiredScreen({
  validUntil,
  supportEmail,
  supportPhone,
}: SubscriptionExpiredScreenProps) {
  const titleRef = useRef<ElementRef<typeof View>>(null);
  const expiryLine = formatExpiryDateIst(validUntil);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'idle' | 'stillExpired' | 'failed'>('idle');
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const tag = findNodeHandle(titleRef.current);
    if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
  }, []);

  // Re-reads the profile. A renewed date lifts this card by itself, because
  // the App gate reads the same profile; this only reports the other outcomes.
  const checkRenewal = async () => {
    setChecking(true);
    setCheckResult('idle');
    try {
      await loadMyProfile({ force: true });
      // The loader stores a failed load in its error state instead of throwing.
      if (getMyProfileError()) {
        setCheckResult('failed');
        return;
      }
      const renewed = getMyProfileSnapshot()?.subscription?.validUntil ?? validUntil;
      if (isSubscriptionExpired(renewed, Date.now())) setCheckResult('stillExpired');
    } catch {
      setCheckResult('failed');
    } finally {
      setChecking(false);
    }
  };

  const callSupport = () => {
    setLinkError(null);
    Linking.openURL(`tel:${supportPhone.replace(/ /g, '')}`).catch(() =>
      setLinkError(`Could not open the phone app. Call ${supportPhone} yourself.`),
    );
  };

  const emailSupport = () => {
    setLinkError(null);
    Linking.openURL(`mailto:${supportEmail}`).catch(() =>
      setLinkError(`Could not open mail. Email ${supportEmail} yourself.`),
    );
  };

  return (
    // Android back does nothing here: there is no way out but renewal.
    <RoadblockModal testID="subscription-expired-screen" onRequestClose={() => undefined}>
      <View style={styles.handle} importantForAccessibility="no" accessible={false} />

      <View style={styles.heroTile} importantForAccessibility="no" accessible={false}>
        <ExpiredHeroIcon size={32} />
        <View style={styles.alertDot}>
          <Text style={styles.alertMark}>!</Text>
        </View>
      </View>

      <Badge status="warning" dot size="md" style={styles.chip}>
        Not active
      </Badge>

      <View ref={titleRef} accessible accessibilityRole="header">
        <Text style={[typography.heading, styles.title]}>Subscription expired</Text>
      </View>
      <Text style={[typography.body, styles.body]}>
        Your plan has ended. You cannot add or change data until you renew it.
      </Text>

      <View style={styles.infoCard}>
        {expiryLine ? (
          <InfoRow icon={<Calendar size={18} color={colors.textMuted} />} label="Ended on">
            <Text style={[typography.bodySm, styles.dangerValue]}>{expiryLine}</Text>
          </InfoRow>
        ) : null}
        <InfoRow icon={<Building2 size={18} color={colors.textMuted} />} label="Account">
          <Text style={[typography.bodySm, styles.strongValue]}>Company</Text>
        </InfoRow>
      </View>

      <Button
        size="lg"
        fullWidth
        onPress={callSupport}
        testID="subscription-call-support"
        accessibilityLabel={`Call support, ${supportPhone}`}
        accessibilityRole="button">
        Call support
      </Button>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onPress={emailSupport}
        testID="subscription-email-support"
        accessibilityLabel={`Email support, ${supportEmail}`}
        accessibilityRole="button">
        Email support
      </Button>
      {linkError ? (
        <Text style={[typography.bodySm, styles.error]} accessibilityRole="alert">
          {linkError}
        </Text>
      ) : null}

      <Text style={[typography.bodySm, styles.muted]}>
        Our team will help you renew and get back to full access.
      </Text>

      <Button
        variant="ghost"
        size="lg"
        fullWidth
        disabled={checking}
        leadingIcon={<RefreshCw size={18} color={colors.textBody} />}
        onPress={checkRenewal}
        testID="subscription-check-renewal"
        accessibilityLabel="Check renewal status"
        accessibilityRole="button">
        {checking ? 'Checking…' : 'Check again'}
      </Button>
      {checkResult === 'stillExpired' ? (
        <Text style={[typography.bodySm, styles.muted]} accessibilityRole="alert">
          Still expired. Try again after you renew.
        </Text>
      ) : null}
      {checkResult === 'failed' ? (
        <Text style={[typography.bodySm, styles.error]} accessibilityRole="alert">
          Could not check. Check your internet and try again.
        </Text>
      ) : null}
    </RoadblockModal>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabel}>
        {icon}
        <Text style={[typography.bodySm, styles.muted]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderSubtle,
  },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.warning.bg,
  },
  alertDot: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  alertMark: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  chip: {
    alignSelf: 'center',
  },
  title: {
    color: colors.textStrong,
    textAlign: 'center',
  },
  body: {
    color: colors.textBody,
    textAlign: 'center',
  },
  muted: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.s4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    gap: spacing.s3,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  strongValue: {
    color: colors.textStrong,
  },
  dangerValue: {
    color: colors.danger,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
