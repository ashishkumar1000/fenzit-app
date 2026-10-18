import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { jobService, type ApiError } from '../../services';
import { getCurrentPosition, requestLocationPermission } from './geolocation';
import {
  classifyCaptureFailure,
  enableDeviceLocation,
  hasLocationPermission,
  isServicesEnabled,
} from '../../services/location/deviceLocation';
import { generateIdempotencyKey } from '../../utils/idempotency';
import type { TechnicianRootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'LocationCapture'>;

/**
 * The verify-location step's phased contract (user decisions 1a/2a,
 * 2026-10-17): probe BEFORE any capture; a user-fixable device state
 * (services off, permission denied) BLOCKS the screen and never fires the
 * advance RPC — each blocked state carries its own remediation and
 * re-probes on foreground return (probe-only — no re-prompt loops). A
 * healthy probe captures with retry; after 2 failed capture attempts an
 * explicit [Continue without location] posts the null-coordinate advance,
 * visibly labeled — never a silent null.
 */
type Phase =
  | 'probing' // the pre-capture probe (mount / foreground return)
  | 'blockedServices' // master switch off — remediation, never advances
  | 'blockedPermission' // permission denied — re-request/settings, never advances
  | 'capturing' // GPS fix in flight
  | 'failed' // transient capture failure (attempt count drives Continue)
  | 'advancing' // the advance POST in flight
  | 'advanceFailed'; // the POST failed — retry the same submit, or cancel

interface AdvanceLocationPayload {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

// Blocked-state copy is contractual (I/O matrix): a device state names its
// cause, never a bare "couldn't get location".
const BLOCKED_SERVICES_OFF_MESSAGE =
  "We couldn't verify your location because location services are off on this device.";
const BLOCKED_PERMISSION_MESSAGE = 'Fenzit needs location access to verify this step.';
const CAPTURE_TIMEOUT_MESSAGE = 'Getting your location took too long. Try again.';
const CAPTURE_FAILED_MESSAGE = 'Could not get your location. Try again.';
const CONTINUE_WITHOUT_NOTE = 'This step will be recorded without a location.';

const NULL_PAYLOAD: AdvanceLocationPayload = {
  latitude: null,
  longitude: null,
  accuracy: null,
};

export function LocationCaptureScreen({ navigation, route }: Props) {
  const { jobId, stepKey } = route.params;
  const [phase, setPhase] = useState<Phase>('probing');
  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const [advanceErrorMessage, setAdvanceErrorMessage] = useState<string | null>(null);
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const [permissionDenials, setPermissionDenials] = useState(0);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);
  const lastPayloadRef = useRef<AdvanceLocationPayload>(NULL_PAYLOAD);
  const isMountedRef = useRef(true);
  // The AppState listener closes over this ref, not the state — the effect
  // subscribes once at mount.
  const phaseRef = useRef<Phase>('probing');
  phaseRef.current = phase;
  // Synchronous re-entrancy guard: phaseRef only updates on render, so two
  // rapid 'active' events could start overlapping probe/capture runs before
  // React commits — the second must be a no-op.
  const probingRef = useRef(false);

  async function probeAndCapture(withEntryAsk: boolean) {
    if (probingRef.current) return;
    probingRef.current = true;
    try {
      await probeAndCaptureInner(withEntryAsk);
    } finally {
      probingRef.current = false;
    }
  }

  async function probeAndCaptureInner(withEntryAsk: boolean) {
    setPhase('probing');
    // Services first — with the master switch off, a permission prompt is
    // noise and the capture is doomed: name the real problem instead.
    if (!(await isServicesEnabled())) {
      if (isMountedRef.current) setPhase('blockedServices');
      return;
    }
    if (await hasLocationPermission()) {
      await runCapture();
      return;
    }
    // Not granted. The ONE entry ask is today's behavior (screen opens →
    // the OS prompt); every later probe/re-probe is check-only — the
    // [Allow location] button is the only other path that may prompt.
    if (withEntryAsk) {
      try {
        const outcome = await requestLocationPermission();
        if (!isMountedRef.current) return;
        if (outcome.status === 'granted') {
          await runCapture();
          return;
        }
      } catch (err) {
        console.error('[location-capture] permission error:', err);
        if (!isMountedRef.current) return;
      }
    }
    setPermissionDenials(denials => denials + 1);
    if (isMountedRef.current) setPhase('blockedPermission');
  }

  async function runCapture() {
    setPhase('capturing');
    try {
      const position = await getCurrentPosition(15000);
      // A back-out mid-capture is a cancel — never a surprise advance.
      if (!isMountedRef.current) return;
      await advance({
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      });
    } catch (caught) {
      console.error('[location-capture] capture failed:', caught);
      if (!isMountedRef.current) return;
      // Codes 2/4/5 re-probe services (classifyCaptureFailure): a
      // mid-capture services flip lands in its blocked state, never as a
      // generic transient.
      const kind = await classifyCaptureFailure(caught);
      if (!isMountedRef.current) return;
      if (kind === 'servicesOff') {
        setPhase('blockedServices');
        return;
      }
      if (kind === 'permission') {
        setPermissionDenials(denials => denials + 1);
        setPhase('blockedPermission');
        return;
      }
      setCaptureAttempts(attempts => attempts + 1);
      setTransientMessage(
        kind === 'timeout' ? CAPTURE_TIMEOUT_MESSAGE : CAPTURE_FAILED_MESSAGE,
      );
      setPhase('failed');
    }
  }

  /** The one advance path — the idempotency key is minted once and reused
   *  until the server answers, so every retry is the same submit. */
  async function advance(payload: AdvanceLocationPayload) {
    lastPayloadRef.current = payload;
    setPhase('advancing');
    try {
      const key = (keyRef.current ??= generateIdempotencyKey());
      await jobService.advanceWorkflow(jobId, stepKey, key, payload);
      keyRef.current = null;
      // A back-out during the POST unmounted the screen — goBack would pop
      // the screen beneath the verify step.
      if (!isMountedRef.current) return;
      navigation.goBack();
    } catch (caught) {
      const err = caught as Error | ApiError;
      const msg = 'message' in err ? err.message : String(caught);
      console.error('[location-capture] advance failed:', msg);
      if (!isMountedRef.current) return;
      setAdvanceErrorMessage(msg);
      setPhase('advanceFailed');
    }
  }

  // [Turn on location] — the enable ladder. Dialog success goes straight
  // back to the capture (one-tap recovery); the settings rungs leave the
  // screen blocked and the foreground re-probe below finishes the recovery.
  async function enableAndResume() {
    setBusy(true);
    try {
      const enabled = await enableDeviceLocation();
      if (!isMountedRef.current) return;
      if (enabled) await runCapture();
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  }

  // [Allow location] — the explicit re-request. Still-denied means the OS
  // may never prompt again: the settings route opens up (denials >= 2).
  async function requestPermissionAndResume() {
    setBusy(true);
    try {
      const outcome = await requestLocationPermission();
      if (!isMountedRef.current) return;
      if (outcome.status === 'granted') {
        await runCapture();
        return;
      }
    } catch (err) {
      console.error('[location-capture] permission request failed:', err);
      if (!isMountedRef.current) return;
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
    setPermissionDenials(denials => denials + 1);
    setPhase('blockedPermission');
  }

  useEffect(() => {
    void probeAndCapture(true);
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foreground return (the Settings round-trip): a blocked screen re-probes
  // check-only — never a second prompt. Focus events don't fire for
  // OS-level app switches; AppState 'active' is the return signal.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (
        appState === 'active' &&
        (phaseRef.current === 'blockedServices' ||
          phaseRef.current === 'blockedPermission')
      ) {
        void probeAndCapture(false);
      }
    });
    return () => {
      // Some environments (jest's RN preset) return no subscription.
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Verify location</Text>
      </View>

      <View style={styles.content}>
        {phase === 'probing' || phase === 'capturing' || phase === 'advancing' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.message}>Getting your location...</Text>
          </>
        ) : phase === 'blockedServices' ? (
          <>
            <Text style={styles.errorMessage}>{BLOCKED_SERVICES_OFF_MESSAGE}</Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => void enableAndResume()}>
              Turn on location
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={() => navigation.goBack()}>
              Cancel
            </Button>
          </>
        ) : phase === 'blockedPermission' ? (
          <>
            <Text style={styles.errorMessage}>{BLOCKED_PERMISSION_MESSAGE}</Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => void requestPermissionAndResume()}>
              Allow location
            </Button>
            {permissionDenials >= 2 ? (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => void Linking.openSettings()}>
                Open settings
              </Button>
            ) : null}
            <Button variant="ghost" size="lg" fullWidth onPress={() => navigation.goBack()}>
              Cancel
            </Button>
          </>
        ) : phase === 'failed' ? (
          <>
            <Text style={styles.errorMessage}>{transientMessage}</Text>
            {captureAttempts >= 2 ? (
              <Text style={styles.skipNote}>{CONTINUE_WITHOUT_NOTE}</Text>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void runCapture().finally(() => {
                  if (isMountedRef.current) setBusy(false);
                });
              }}>
              {busy ? 'Retrying…' : 'Try again'}
            </Button>
            {captureAttempts >= 2 ? (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => void advance(NULL_PAYLOAD)}>
                Continue without location
              </Button>
            ) : null}
            <Button variant="ghost" size="lg" fullWidth onPress={() => navigation.goBack()}>
              Cancel
            </Button>
          </>
        ) : (
          // advanceFailed — the advance POST itself failed; the retry is
          // the same payload and the same idempotency key.
          <>
            <Text style={styles.errorMessage}>{advanceErrorMessage}</Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void advance(lastPayloadRef.current).finally(() => {
                  if (isMountedRef.current) setBusy(false);
                });
              }}>
              {busy ? 'Retrying…' : 'Try again'}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={() => navigation.goBack()}>
              Cancel
            </Button>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.s1,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s4,
  },
  message: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  errorMessage: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  skipNote: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
