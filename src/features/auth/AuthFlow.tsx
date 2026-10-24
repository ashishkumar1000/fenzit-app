/**
 * AuthFlow — orchestrates first-time account setup: phone → otp → profile.
 *
 * Owns the shared state (number, code, business profile) and the current step
 * and renders the matching screen. All three steps — send OTP, verify OTP,
 * and company setup — are wired to the real backend via `authApi`. On
 * success, it calls `onComplete`, and the app gate (useAuth) flips to the
 * main app.
 */
import { useCallback, useState } from 'react';
import { DIAL_CODE, OTP_LENGTH, RESEND_SECONDS } from './constants';
import type { AuthResult, AuthStep, BusinessProfile } from './types';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NotOnTeamScreen } from './screens/NotOnTeamScreen';
import { clearSessionExpired, isReturningUser, useSessionExpired } from './useAuth';
import { authApi, setAuthToken } from '../../services';
import type { ApiError, VerifiedUser } from '../../services';
import { isUserRole } from './roles';
import { NO_COMPANY_MESSAGE } from './noAccessCopy';

type Props = {
  onComplete: (result: AuthResult) => void;
  /**
   * The "How will you use Fenzit?" answer from the pre-login stage. An
   * INTENT only — the phone number decides the real role at verify time
   * (routeAfterVerify). `null`/undefined = skipped, fully neutral path.
   */
  intent?: 'owner' | 'staff' | null;
};

const EMPTY_PROFILE: BusinessProfile = {
  businessName: '',
  ownerName: '',
  businessTypes: [],
  city: '',
  stateCode: '',
  gstNumber: '',
};

/** Turns a failed `sendOtp` call into copy the phone/otp screens can show directly. */
function sendOtpErrorMessage(err: ApiError): string {

  if (err.code === 'VALIDATION_ERROR') {
    return 'That mobile number doesn\u2019t look right.';
  }
  if (err.code === 'RATE_LIMIT_EXCEEDED') {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  // The SMS gateway failed (502 OTP_SEND_FAILED) — retryable by contract:
  // the session is gone and a resend starts a fresh one.
  if (err.code === 'OTP_SEND_FAILED') {
    return 'Couldn\u2019t send the code. Please try again.';
  }
  return err.message;
}

/**
 * Decides where a verified login goes next. Returns `'setup'` for a brand-new
 * person (no company AND no role) — unless they said they work in the field
 * (`intent: 'staff'`), who gets `'notOnTeam'` instead of an owner company
 * they never asked for. Otherwise the session to store:
 *
 *   - Fenzit staff           -> no company screens, a plain message
 *   - company role + company -> the matching side of the app
 *   - anything else          -> a plain "not part of a company" message (a
 *     removed person, or half-filled data that must never open company data)
 */
export function routeAfterVerify(
  user: VerifiedUser,
  intent?: 'owner' | 'staff' | null,
):
  | 'setup'
  | 'notOnTeam'
  | Pick<AuthResult, 'role' | 'tenantId' | 'platformAdmin'> {
  if (user.platformAdmin || user.role === 'platform_admin') {
    return { role: null, tenantId: null, platformAdmin: true };
  }
  if (user.tenantId === null && user.role === null) {
    // A removed person is not new: they get the plain message, not setup.
    if (user.formerMember) {
      return { role: null, tenantId: null, platformAdmin: false };
    }
    return intent === 'staff' ? 'notOnTeam' : 'setup';
  }
  if (user.tenantId !== null && isUserRole(user.role)) {
    return { role: user.role, tenantId: user.tenantId, platformAdmin: false };
  }
  return { role: null, tenantId: null, platformAdmin: false };
}

/** Turns a failed `setupCompany` call into a copy the profile screen can show directly. */
function setupCompanyErrorMessage(err: ApiError): string {
  if (err.code === 'VALIDATION_ERROR') {
    return 'Check your GST number and state — one of them looks wrong.';
  }
  if (err.status === 403) {
    return 'This account cannot set up a company. Please talk to your company owner.';
  }
  // 409: the person already belongs to (or is invited to) a company.
  if (err.status === 409) {
    return NO_COMPANY_MESSAGE;
  }
  return err.message;
}

export default function AuthFlow({ onComplete, intent = null }: Props) {
  const [step, setStep] = useState<AuthStep>('phone');
  // True right after a forced 401 logout (story 5.3) — PhoneScreen shows a
  // "Session expired" banner until the person dismisses it or logs in again
  // (useAuth's `complete` clears the flag).
  const sessionExpired = useSessionExpired();
  // Read once at mount: this device's login history decides whether the
  // Login screen greets with "Welcome back" or the neutral "Login/Signup".
  const [returningUser] = useState(isReturningUser);
  const [phone, setPhone] = useState('');

  const [code, setCode] = useState('');
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);

  // Returned by `sendOtp` — `otpSessionId` is what step 2 (verify) needs to
  // send back, per the backend contract (not the phone number).
  const [otpSessionId, setOtpSessionId] = useState('');

  // Seconds the OTP screen's resend countdown should restart with when a
  // resend hits the backend's 429 — the `Retry-After` header, so the wait
  // shown matches the server's actual window remainder (real delivery makes
  // 429 a normal user path: resend-until-arrival reaches the 5/10-min cap).
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [profileError, setProfileError] = useState('');

  const changePhone = useCallback((digits: string) => {
    setPhone(digits);
    setPhoneError('');
  }, []);

  // --- Step 1: request an OTP -------------------------------------------
  const requestOtp = useCallback(async () => {
    const res = await authApi.sendOtp({ countryCode: DIAL_CODE, phoneNumber: phone });
    setOtpSessionId(res.otp_session_id);
  }, [phone]);

  const sendOtp = useCallback(async () => {
    setSending(true);
    setCode('');
    setOtpError('');
    setPhoneError('');
    try {
      await requestOtp();
      setStep('otp');
    } catch (err) {
      setPhoneError(sendOtpErrorMessage(err as ApiError));
    } finally {
      setSending(false);
    }
  }, [requestOtp]);

  // The resend POST runs on its own (it can't close the screen) and its
  // only feedback is the link's state — so its `done` callback fires when
  // the request settles, NOT on tap: the countdown lied before this
  // (showing a fresh 90s window while the POST was still airborne), and
  // "Resending…" covers the round trip itself.
  const resendOtp = useCallback(async (done?: () => void) => {
    setCode('');
    setOtpError('');
    setResending(true);
    try {
      await requestOtp();
      setRateLimitSeconds(0);
    } catch (err) {
      const apiError = err as ApiError;
      // Surface on the OTP screen — the person is already past step 1.
      setOtpError(sendOtpErrorMessage(apiError));
      // A 429 restarts the countdown at the server's window remainder (the
      // header is authoritative; without it, fall back to the normal 90s).
      if (apiError.code === 'RATE_LIMIT_EXCEEDED') {
        setRateLimitSeconds(apiError.retryAfterSeconds ?? RESEND_SECONDS);
      }
    } finally {
      setResending(false);
      done?.();
    }
  }, [requestOtp]);

  // --- Step 2: verify the OTP -------------------------------------------
  const verifyOtp = useCallback(async () => {
    if (code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setOtpError('');
    try {
      const res = await authApi.verifyOtp({ otpSessionId, otpCode: code });
      setAuthToken(res.token);

      const decision = routeAfterVerify(res.user, intent);
      if (decision === 'setup') {
        // Brand-new person with no company and no role — company setup
        // (step 3) is next.
        setStep('profile');
      } else if (decision === 'notOnTeam') {
        // Said they work in the field, but this number belongs to no
        // company: help them get invited instead of creating a company.
        setStep('notOnTeam');
      } else {
        onComplete({
          phone: `${DIAL_CODE}${phone}`,
          profile,
          ...decision,
          name: res.user.name,
        });
      }
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.code === 'OTP_EXPIRED' || apiError.code === 'OTP_SESSION_LOCKED') {
        // Per the backend docs, the only recovery here is requesting a
        // fresh OTP — send the person back to step 1 rather than leaving
        // them stuck retrying a code that can never succeed.
        setCode('');
        setStep('phone');
        setPhoneError(
          apiError.code === 'OTP_SESSION_LOCKED'
            ? 'Too many wrong codes. Please ask for a new one.'
            : 'That code has expired. Please ask for a new one.',
        );
        return;
      }

      if (apiError.code === 'INVALID_OTP') {
        setOtpError('Wrong code. Try again.');
        setCode('');
        return;
      }

      // VALIDATION_ERROR or anything else unexpected.
      setOtpError(apiError.message);
      setCode('');
    } finally {
      setVerifying(false);
    }
  }, [code, otpSessionId, phone, profile, onComplete, verifying, intent]);

  // --- Step 3: finish setup ----------------------------------------------
  const finish = useCallback(async () => {
    // Belt-and-braces: the profile screen already requires a name and at
    // least one business type before calling this, but guard here too in
    // case that validation is ever bypassed or this function is called from
    // somewhere else in the future.
    if (!profile.ownerName.trim()) {
      setProfileError('Enter your name.');
      return;
    }
    if (profile.businessTypes.length === 0) {
      setProfileError('Select at least one business type.');
      return;
    }

    setSubmitting(true);
    setProfileError('');
    try {
      const res = await authApi.setupCompany({
        name: profile.ownerName.trim(),
        companyName: profile.businessName,
        stateCode: profile.stateCode,
        gstin: profile.gstNumber || undefined,
        address: profile.city || undefined,
      });
      // CRITICAL: this token replaces the one from verifyOtp — it now has
      // tenantId populated. The old one would keep failing tenant-scoped
      // endpoints. See the doc's "Token behavior" section.
      setAuthToken(res.token);
      // Only a person with no company reaches step 3, and setting one up
      // makes them its admin — role is fixed here rather than threaded
      // through from verifyOtp's response.
      onComplete({
        phone: `${DIAL_CODE}${phone}`,
        profile,
        role: 'company_admin',
        platformAdmin: false,
        // The name the admin just entered — the backend saved it on their
        // users row, and GET /users/me returns it from now on.
        name: profile.ownerName.trim(),
        tenantId: res.tenant.id,
      });
    } catch (err) {
      setProfileError(setupCompanyErrorMessage(err as ApiError));
    } finally {
      setSubmitting(false);
    }
  }, [phone, profile, onComplete]);

  const patchProfile = useCallback(
    (patch: Partial<BusinessProfile>) => setProfile(p => ({ ...p, ...patch })),
    [],
  );

  if (step === 'phone') {
    return (
      <PhoneScreen
        value={phone}
        onChangePhone={changePhone}
        onContinue={sendOtp}
        sending={sending}
        serverError={phoneError}
        sessionExpired={sessionExpired}
        onDismissSessionExpired={clearSessionExpired}
        returningUser={returningUser}
      />
    );
  }

  if (step === 'otp') {
    return (
      <OtpScreen
        phone={phone}
        code={code}
        onChangeCode={setCode}
        onVerify={verifyOtp}
        onResend={resendOtp}
        onChangeNumber={() => setStep('phone')}
        verifying={verifying}
        resending={resending}
        error={otpError}
        rateLimitSeconds={rateLimitSeconds}
      />
    );
  }

  if (step === 'notOnTeam') {
    return (
      <NotOnTeamScreen
        phone={phone}
        onSetUpInstead={() => setStep('profile')}
        onUseAnotherNumber={() => setStep('phone')}
      />
    );
  }

  return (
    <ProfileScreen
      profile={profile}
      onChange={patchProfile}
      onFinish={finish}
      submitting={submitting}
      serverError={profileError}
    />
  );
}
