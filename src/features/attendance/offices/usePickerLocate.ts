/**
 * usePickerLocate — the picker's locate / services-off handling: the
 * services probe, the locate pill, [Turn on location], and the search
 * sheet's [Turn on] banner.
 *
 * The banner keeps the sheet OPEN (the banner just disappears) so the user
 * can keep searching. The fix is captured quietly and the pin moves only
 * when the sheet closes — unless the user picks an address first, which
 * always wins (the epoch bumps on every address pick and voids an older
 * in-flight fix).
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { LatLng } from 'react-native-maps';
import { useLocateMe } from './useLocateMe';

type Args = {
  /** Moves the pin to a device fix. */
  applyFix: (loc: LatLng) => void;
  searchVisible: boolean;
  setSearchVisible: (visible: boolean) => void;
};

export function usePickerLocate({ applyFix, searchVisible, setSearchVisible }: Args) {
  const {
    locate,
    locating,
    errorMessage: locateError,
    errorKind,
    canOpenSettings,
    clearError,
    openSettings,
    enableServices,
    refreshServices,
  } = useLocateMe();

  // ONE services-off flag drives BOTH surfaces (the map's pin style + state
  // chip and the sheet's layout), so they can never disagree.
  const servicesOff = errorKind === 'servicesOff';

  // Services probe on mount and every foreground return (the useCheckInOut
  // probe idiom): a user coming back from the OS location panel must never
  // stay stuck on the services-off state. AppState 'active' is the return
  // signal — focus events don't fire for OS-level app switches. The probe
  // never prompts; with services healthy it changes nothing on screen.
  useEffect(() => {
    void refreshServices();
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') void refreshServices();
    });
    return () => {
      // Some environments (jest's RN preset) return no subscription.
      sub?.remove();
    };
  }, [refreshServices]);

  const searchVisibleRef = useRef(false);
  searchVisibleRef.current = searchVisible;
  const addressPickEpochRef = useRef(0);
  const pendingFixRef = useRef<LatLng | null>(null);

  const handleLocate = useCallback(async () => {
    clearError();
    const loc = await locate();
    if (!loc) return;
    applyFix(loc);
  }, [locate, clearError, applyFix]);

  // [Turn on location]: the Android dialog success auto re-locates without
  // a second tap (one-tap recovery); the settings rungs rely on the
  // foreground re-probe above — Confirm/hand-pan stay available meanwhile.
  const handleEnableServices = useCallback(async () => {
    const enabled = await enableServices();
    if (enabled) await handleLocate();
  }, [enableServices, handleLocate]);

  const handleTurnOnFromSearch = useCallback(async () => {
    const enabled = await enableServices();
    if (!enabled) return;
    clearError();
    const epoch = addressPickEpochRef.current;
    const loc = await locate();
    if (!loc || epoch !== addressPickEpochRef.current) return;
    if (searchVisibleRef.current) pendingFixRef.current = loc;
    else applyFix(loc); // sheet already closed while the fix was in flight
  }, [enableServices, clearError, locate, applyFix]);

  const handleCloseSearch = useCallback(() => {
    setSearchVisible(false);
    const fix = pendingFixRef.current;
    pendingFixRef.current = null;
    if (fix) applyFix(fix);
  }, [applyFix, setSearchVisible]);

  /** An address was picked — it wins over any quiet or in-flight fix. */
  const discardPendingFix = useCallback(() => {
    addressPickEpochRef.current += 1;
    pendingFixRef.current = null;
  }, []);

  return {
    locating,
    locateError,
    canOpenSettings,
    openSettings,
    servicesOff,
    handleLocate,
    handleEnableServices,
    handleTurnOnFromSearch,
    handleCloseSearch,
    discardPendingFix,
  };
}
