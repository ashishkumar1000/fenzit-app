/**
 * Step 1 — collect the mobile number and send an OTP.
 *
 * The user's design stacks white cards on the page: intro, the number form
 * (a fixed +91 pill beside the field), then the "Unified Portal Access"
 * explainer, with the terms line as the page footer. The dial-code pill is
 * static — India is the only country the backend sends SMS to, so there is
 * no picker to fake with a chevron.
 */
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { ArrowLeftRight, ArrowRight, Check } from 'lucide-react-native';
import { Button, InlineError } from '../../../components/ui';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { DIAL_CODE, PHONE_LENGTH } from '../constants';

/** Hand-drawn India tricolour — saffron/white/green with the chakra as a
 *  navy ring + hub (spokes vanish at 22px). */
function IndiaFlag({ width = 22 }: { width?: number }) {
  const height = Math.round(width * 0.68);
  return (
    <Svg width={width} height={height} viewBox="0 0 33 22" fill="none">
      <Rect width={33} height={7.34} fill="#FF9933" />
      <Rect y={7.34} width={33} height={7.32} fill="#FFFFFF" />
      <Rect y={14.66} width={33} height={7.34} fill="#138808" />
      <Circle cx={16.5} cy={11} r={2.9} stroke="#054187" strokeWidth={0.9} />
      <Circle cx={16.5} cy={11} r={0.8} fill="#054187" />
    </Svg>
  );
}

/** Hand-drawn 3×3 dial-pad dots — the decorative glyph at the field's end. */
function DialPadArt({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G fill={palette.gray400}>
        {[4, 12, 20].map(y =>
          [4, 12, 20].map(x => <Circle key={`${x}-${y}`} cx={x} cy={y} r={2.1} />),
        )}
      </G>
    </Svg>
  );
}

type Props = {
  value: string;
  onChangePhone: (digits: string) => void;
  onContinue: () => void;
  sending?: boolean;
  /**
   * Error from the `sendOtp` API call (validation or rate-limit), distinct
   * from the local format validation below — kept separate so a fresh server
   * error isn't wiped out by the local `setError('')` on every keystroke,
   * and vice versa.
   */
  serverError?: string;
  /**
   * True right after a forced 401 logout (story 5.3) — shows the "Session
   * expired" banner above the form, so the person knows why they're back
   * at step 1. Cleared on dismiss, or on the next successful login.
   */
  sessionExpired?: boolean;
  onDismissSessionExpired?: () => void;
  /** This device has completed a login before — greet with "Welcome back"
   *  and sign-in copy instead of the neutral "Login/Signup". */
  returningUser?: boolean;
};

const UNIFIED_PANEL = [
  'Staff & technicians — attendance and job updates',
  'Owners — assign jobs and track work',
] as const;

export function PhoneScreen({
  value,
  onChangePhone,
  onContinue,
  sending = false,
  serverError = '',
  sessionExpired = false,
  onDismissSessionExpired,
  returningUser = false,
}: Props) {
  const [error, setError] = useState('');
  const [fieldFocused, setFieldFocused] = useState(false);

  const handleChange = (text: string) => {
    setError('');
    onChangePhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH));
  };

  const handleSubmit = () => {
    if (value.length !== PHONE_LENGTH) {
      setError(`Enter your ${PHONE_LENGTH}-digit mobile number.`);
      return;
    }
    onContinue();
  };

  return (
    <AuthScaffold>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>
          {returningUser ? 'Welcome back' : 'Login/Signup'}
        </Text>
        <Text style={styles.introSub}>
          {returningUser
            ? 'Enter your mobile number to login.'
            : 'Enter your mobile number to get started.'}
        </Text>
      </View>

      {sessionExpired ? (
        <View style={styles.notice}>
          <InlineError
            message="Session expired — please log in again."
            onDismiss={onDismissSessionExpired}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Mobile number</Text>
        <View style={styles.numberRow}>
          <View style={styles.dialPill}>
            <IndiaFlag />
            <Text style={styles.dialCode}>{DIAL_CODE}</Text>
          </View>
          <View
            style={[
              styles.numberField,
              fieldFocused ? styles.numberFieldFocus : null,
              error || serverError ? styles.numberFieldError : null,
            ]}>
            <TextInput
              value={value}
              onChangeText={handleChange}
              placeholder="98765 43210"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={PHONE_LENGTH}
              style={styles.numberInput}
              onFocus={() => setFieldFocused(true)}
              onBlur={() => setFieldFocused(false)}
              accessibilityLabel="Mobile number"
            />
            <DialPadArt />
          </View>
        </View>
        {error || serverError ? (
          <Text style={styles.numberError}>{error || serverError}</Text>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={sending}
          onPress={handleSubmit}
          trailingIcon={
            sending ? undefined : (
              <ArrowRight size={20} color={colors.onPrimary} strokeWidth={2.5} />
            )
          }
          style={styles.cta}>
          {sending ? 'Sending…' : 'Get OTP'}
        </Button>

        <Text style={styles.terms}>
          By continuing, you agree to Fenzit's{' '}
          <Text style={styles.termsEm}>Terms of Service</Text> and{' '}
          <Text style={styles.termsEm}>Privacy Policy</Text>.
        </Text>
      </View>

      {/* The explainer lives at the bottom of the page — the spacer eats the
          free space above it (minHeight keeps a gap on short screens). */}
      <View style={styles.push} />

      <View style={styles.card}>
        <View style={styles.panelHead}>
          <View style={styles.panelBadge}>
            <ArrowLeftRight size={18} color={colors.primary} strokeWidth={2.2} />
          </View>
          <Text style={styles.panelTitle}>One app for everyone</Text>
        </View>
        {UNIFIED_PANEL.map(line => (
          <View key={line} style={styles.bullet}>
            <View style={styles.bulletCheck}>
              <Check size={13} color={colors.onPrimary} strokeWidth={3.2} />
            </View>
            <Text style={styles.bulletLine}>{line}</Text>
          </View>
        ))}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.s6,
    marginBottom: spacing.s4,
  },
  intro: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing.s5,
  },
  introTitle: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: colors.textStrong,
    textAlign: 'center',
  },
  introSub: {
    ...typography.body,
    color: colors.textBody,
    marginTop: spacing.s3,
    lineHeight: 24,
    textAlign: 'center',
  },
  notice: {
    marginBottom: spacing.s4,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textStrong,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  numberRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'stretch',
    marginTop: spacing.s3,
  },
  dialPill: {
    height: 60,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  dialCode: {
    ...typography.body,
    fontSize: 18,
    color: colors.textStrong,
    fontWeight: '700',
  },
  numberField: {
    flex: 1,
    height: 60,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingLeft: spacing.s4,
    paddingRight: spacing.s3,
  },
  numberFieldFocus: {
    borderColor: colors.borderFocus,
  },
  numberFieldError: {
    borderColor: colors.danger,
  },
  numberInput: {
    flex: 1,
    fontSize: 18,
    color: colors.textStrong,
    padding: 0,
  },
  numberError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s2,
  },
  cta: {
    marginTop: spacing.s5,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  panelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    ...typography.heading,
    fontSize: typography.heading.fontSize + 2,
    color: colors.textStrong,
    flex: 1,
  },
  push: {
    flex: 1,
    minHeight: spacing.s6,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  bulletCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletLine: {
    ...typography.bodySm,
    color: colors.textBody,
    flex: 1,
  },
  terms: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s4,
    lineHeight: 21,
  },
  termsEm: {
    fontWeight: '600',
    color: colors.textStrong,
  },
});
