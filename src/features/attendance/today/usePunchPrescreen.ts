/**
 * usePunchPrescreen — the Today-tab geofence's fix supplier (story 20-3).
 *
 * 2026-11-10 simplification (owner decision): PULL, not push. The live
 * watchPosition stream and the 30 s cadence are gone — a snapshot capture
 * runs when the tab focuses and on every foreground return, and that fix
 * drives the status card's verdict + "checked N min ago" caption. There is
 * NO background watcher, ever (NFR-11), and no continuous location work:
 * the punch PRESS still does its own strict capture at the moment of
 * truth (nothing here changes what the server re-judges).
 *
 * The prescreen never nags: a failed capture is silent (the card simply
 * keeps its last verdict / explains no fix yet), and an employee without
 * attendance access captures NOTHING (enabled=false ⇒ zero location work).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { captureAttendanceLocation } from '../../../services/location/attendanceLocation';
import type { PunchFixSample } from './attendanceTodayModel';

export function usePunchPrescreen(input: { enabled: boolean }): {
  fix: PunchFixSample | null;
  /** Post-punch settle re-probe (the fresh record may change the verdict). */
  recapture: () => void;
  /** Adopt a fix the press flow already captured (see the docblock). */
  adoptFix: (f: { latitude: number; longitude: number }) => void;
} {
  const { enabled } = input;
  const [fix, setFix] = useState<PunchFixSample | null>(null);
  const [focused, setFocused] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** One-shot capture — the focus probe, the foreground probe and the
   *  post-punch re-probe all land here. */
  const capture = useCallback(async () => {
    if (!enabledRef.current || !focusedRef.current || inFlight.current) return;
    inFlight.current = true;
    try {
      // A capture can outlive the tab (15 s timeout) — only the mounted +
      // focused winner adopts the fix; a stale adopter would render a
      // fence verdict on a tab the user has left.
      const f = await captureAttendanceLocation();
      if (
        mounted.current &&
        focusedRef.current &&
        Number.isFinite(f.latitude) &&
        Number.isFinite(f.longitude)
      ) {
        // capturedAt back-dates to the FIX, not the adoption — the capture's
        // latency (up to the 15 s timeout) must not be gifted to the age.
        setFix({
          latitude: f.latitude,
          longitude: f.longitude,
          capturedAt: Date.now() - f.fixAgeMs,
        });
      }
    } catch {
      // Silent by design — the card keeps its last verdict and its age
      // caption tells the truth about how old it is.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Foreground return: a snapshot re-probe — the Settings round-trip and
  // the overnight return both land here.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') void capture();
    });
    return () => sub?.remove();
  }, [capture]);

  // Focus gates the whole cycle (a tab screen stays mounted across tab
  // switches — a left tab must never capture). The ref flips BEFORE the
  // capture: setFocused is async to the render, and with the fallback
  // cadence gone this focus probe is the only one — the old ref race used
  // to be masked by the 30 s retry.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFocused(true);
      void capture();
      return () => {
        focusedRef.current = false;
        setFocused(false);
      };
    }, [capture]),
  );

  const recapture = useCallback(() => {
    void capture();
  }, [capture]);

  /** Adopt a fix the press flow already captured — the freshest fix the
   *  device ever held. Without this, a server-rejected too-far press left
   *  the card on its old verdict even though the fence verdict was
   *  re-judged at press time: the card must speak with the press's fix,
   *  not wait for the next probe. */
  const adoptFix = useCallback(
    (f: { latitude: number; longitude: number }) => {
      if (!enabledRef.current) return;
      setFix({ latitude: f.latitude, longitude: f.longitude, capturedAt: Date.now() });
    },
    [],
  );

  return { fix, recapture, adoptFix };
}
