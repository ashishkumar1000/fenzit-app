/**
 * Step 2 — enter the OTP. The user's design: a back + title header, one card
 * holding the SMS-verification eyebrow, the number with an Edit/Change
 * shortcut, the autofill-ready OtpInput, a resend bar, and the verify CTA —
 * then the "Didn't receive SMS?" help panel below the card.
 *
 * The countdown keeps its three postures (counting → expired → resending)
 * and the Retry-After override; see OtpScreen.test.tsx.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  MessageSquareText,
  Pencil,
  RadioTower,
} from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { OtpInput } from '../components/OtpInput';
import { DIAL_CODE, OTP_LENGTH, RESEND_SECONDS } from '../constants';

type Props = {
  /** Local 10-digit mobile number, for the "Sent to" line. */
  phone: string;
  code: string;
  onChangeCode: (next: string) => void;
  onVerify: () => void;
  /** Fires once per press; the countdown restarts on `done` — called when
   *  the resend POST settles (success or failure), so a slow request never
   *  shows a fresh 45s window it couldn't honour. */
  onResend: (done?: () => void) => void;
  onChangeNumber: () => void;
  verifying?: boolean;
  /** The resend POST is in flight — the link reads "Resending…" and the
   *  countdown neither runs nor restarts (the 20-1 loading sweep). */
  resending?: boolean;
  error?: string;
  /** When set (>0), the resend countdown restarts at exactly this many
   *  seconds — the backend's `Retry-After` after a rate-limited resend, so
   *  the wait shown matches the server's real window remainder (with real
   *  SMS, hitting the 5-sends/10-min cap is a normal user path). */
  rateLimitSeconds?: number;
};

const formatPhone = (digits: string) =>
  `${DIAL_CODE} ${digits.replace(/(\d{5})(\d{5})/, '$1 $2')}`;

const mmss = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function OtpScreen({
  phone,
  code,
  onChangeCode,
  onVerify,
  onResend,
  onChangeNumber,
  verifying = false,
  resending = false,
  error,
  rateLimitSeconds = 0,
}: Props) {
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The 20-1 loading sweep, mirrored for the tick itself: while the resend
  // POST is in flight the countdown neither RUNS nor restarts — the bar
  // shows the same mm:ss for the whole flight. Read through a ref so the
  // interval closure always sees the current prop.
  const resendingRef = useRef(resending);
  resendingRef.current = resending;

  const startTimer = useCallback((from: number = RESEND_SECONDS) => {
    setSeconds(from);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds(prev => {
        if (resendingRef.current) return prev;
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [startTimer]);

  // A rate-limited resend overrides the normal 45s window with the server's
  // Retry-After. Effect on the prop (not inside the resend handler) — the
  // countdown belongs to this screen.
  useEffect(() => {
    if (rateLimitSeconds > 0) {
      startTimer(rateLimitSeconds);
    }
  }, [rateLimitSeconds, startTimer]);

  const handleResend = () => {
    if (seconds > 0 || resending) return;
    // The window restarts only when the POST settles — until then the
    // button stays on "Resending…", so a slow network can't eat the window.
    // (A 429 restarts it again at the server's Retry-After via the prop.)
    onResend(() => startTimer());
  };

  const canResend = seconds === 0 && !resending;
  const complete = code.length === OTP_LENGTH;

  return (
    <AuthScaffold
      header={
        <View style={styles.headerRow}>
          <Pressable
            onPress={onChangeNumber}
            hitSlop={12}
            accessibilityLabel="Back to mobile number">
            <ArrowLeft size={22} color={colors.textStrong} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.headerTitle}>Verify OTP</Text>
        </View>
      }>
      <View style={styles.card}>
        <View style={styles.eyebrowRow}>
          <MessageSquareText
            size={16}
            color={colors.primary}
            strokeWidth={2.4}
          />
          <Text style={styles.eyebrow}>SMS Code</Text>
        </View>
        <Text style={styles.heading}>Enter the code</Text>
        <Text style={styles.sub}>
          We sent a {OTP_LENGTH}-digit code to{' '}
          <Text style={styles.phone}>{formatPhone(phone)}</Text>
        </Text>

        <Pressable
          onPress={onChangeNumber}
          hitSlop={8}
          style={styles.changeRow}>
          <Text style={styles.changeLink}>Change number</Text>
          <Pencil size={14} color={colors.textLink} strokeWidth={2.2} />
        </Pressable>

        <Text style={styles.fieldLabel}>Enter {OTP_LENGTH}-digit code</Text>
        <View style={styles.otp}>
          <OtpInput
            value={code}
            onChange={onChangeCode}
            length={OTP_LENGTH}
            // Nothing pre-selected: the numpad opens only when the person
            // taps a box (their ask) — never on mount.
            autoFocus={false}
            error={Boolean(error)}
            onFilled={onVerify}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.resendBar}>
          <Clock size={16} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.resendTimer}>
            New code in {mmss(seconds)}
          </Text>
          <Pressable onPress={handleResend} disabled={!canResend} hitSlop={8}>
            <Text
              style={[
                styles.resendAction,
                canResend ? styles.resendActionActive : null,
              ]}>
              {resending ? 'Resending…' : 'Resend SMS'}
            </Text>
          </Pressable>
        </View>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!complete || verifying}
          onPress={onVerify}
          trailingIcon={
            verifying ? undefined : (
              <ArrowRight size={20} color={colors.onPrimary} strokeWidth={2.5} />
            )
          }
          style={styles.cta}>
          {verifying ? 'Verifying…' : 'Verify & Continue'}
        </Button>
      </View>

      <View style={styles.helpPanel}>
        <View style={styles.helpIconTile}>
          <RadioTower size={20} color={colors.primary} strokeWidth={2.1} />
        </View>
        <View style={styles.helpText}>
          <Text style={styles.helpTitle}>Didn't receive SMS?</Text>
          <Text style={styles.helpBody}>
            Sometimes the SMS is late. When the timer ends, tap Resend SMS.
          </Text>
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.textMuted,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.s6,
    marginBottom: spacing.s4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.primary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heading: {
    ...typography.title,
    color: colors.textStrong,
    marginTop: spacing.s2,
  },
  sub: {
    ...typography.body,
    color: colors.textBody,
    marginTop: spacing.s2,
    lineHeight: 24,
  },
  phone: {
    color: colors.textStrong,
    fontWeight: '700',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    marginTop: spacing.s1,
  },
  changeLink: {
    ...typography.bodySm,
    color: colors.textLink,
    fontWeight: '600',
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textStrong,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: spacing.s6,
  },
  otp: {
    marginTop: spacing.s3,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s3,
  },
  resendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: spacing.s5,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  resendTimer: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  resendAction: {
    ...typography.caption,
    color: colors.textDisabled,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  resendActionActive: {
    color: colors.textLink,
  },
  cta: {
    marginTop: spacing.s6,
  },
  helpPanel: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.s4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: spacing.s5,
  },
  helpIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    flex: 1,
  },
  helpTitle: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.textStrong,
  },
  helpBody: {
    ...typography.bodySm,
    color: colors.textBody,
    marginTop: 2,
    lineHeight: 21,
  },
});
