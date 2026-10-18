/**
 * MapPinPickerScreen — full-screen map pin placement, shared by the office
 * and customer flows (born as Story 15-4's OfficeMapPickerScreen; the
 * customer mode and mode parametrization are SPEC-customer-map-pin-picker).
 *
 * Follows the validated 15-1 spike pattern: the pin is a static React
 * overlay at screen centre and the map pans under it; the settled centre
 * is read from `onRegionChangeComplete` — never a draggable native Marker
 * (spike finding: undiscoverable + janky on Fabric). The geofence Circle
 * redraws LIVE as the radius stepper changes — office mode only; the
 * customer flow has no geofence, so the radius UI never renders there. The
 * map layer itself lives in `PickerMapArea`, the bottom panel in
 * `PickerBottomCard`.
 *
 * Three entry paths per the 15-4 spec: pan-to-place, "Use current
 * location" (fresh fix, permission pre-checked via useLocateMe), and
 * address search (the reused AddressPickerSheet — a resolved place only
 * MOVES the map to a starting point; the final pin position is what Confirm
 * returns). Customer mode additionally enables the sheet's manual-entry
 * fallback (a hand-typed address has no coordinates — acceptable for a
 * customer, never for a geofenced office).
 *
 * `mode` decides the header, the radius UI, and the Confirm return:
 * - office → `popTo('OfficeForm', { pickedLocation })` — coordinates +
 *   radius + GPS provenance (the "GPS Verified" chip), unchanged.
 * - customer → `popTo('AddCustomer', { pickedAddress })` — coordinates plus
 *   the located-address snapshot. When the pin sits on the coordinates of
 *   the last resolved search place, that place's structured fields
 *   (placeId included) are preferred; otherwise the settle-only reverse
 *   geocode fills formattedAddress/pincode/city (all nullable — a point
 *   with no address falls back to the raw coordinates for display). A
 *   reverse geocode still in flight at Confirm contributes nothing rather
 *   than blocking; the form keeps the coordinates either way.
 *
 * Reverse geocoding fires ON SETTLE only — one call per settled centre,
 * latest-wins abort — never per frame while panning — and runs regardless
 * of the services state, so a manually dragged pin keeps its Nearby area
 * label while services are off (manual placement is first-class). On
 * failure or "no address here" the label falls back to the raw
 * coordinates; it never blocks Confirm.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet } from 'react-native';
import MapView, { type Details, type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AddressPickerSheet from '../../addressPicker/AddressPickerSheet';
import type { ManualAddressEntry } from '../../addressPicker';
import { colors } from '../../../theme';
import { getCurrentPosition } from '../../technicianApp/geolocation';
import type { ResolvedPlace } from '../../../services';
import PickerBottomCard from './PickerBottomCard';
import PickerMapArea from './PickerMapArea';
import ScreenHeader from './ScreenHeader';
import { buildCustomerPick, sameCentre } from './buildCustomerPick';
import { usePickerLocate } from './usePickerLocate';
import { pickerAddressLabel, stripPlusCode } from './pickerAddressLabel';
import { useReverseAddress } from './useReverseAddress';
import type { RootStackParamList } from '../../../navigation/types';

/** Bengaluru centre — the India-bounded default when there is no initial
 *  pin and no silent current-location fix. */
const DEFAULT_REGION: LatLng = { latitude: 12.9716, longitude: 77.5946 };

type Props = NativeStackScreenProps<RootStackParamList, 'MapPinPicker'>;

export default function MapPinPickerScreen({ navigation, route }: Props) {
  // Typed against the route's own params (no ad-hoc re-declaration of the
  // mode union); `mode` is required in the params and defaults to office
  // only to keep the original flow behavior-safe if the params object is
  // ever absent.
  const { initialLatitude, initialLongitude, radiusM: initialRadiusM, mode = 'office' } =
    (route.params ?? {}) as NonNullable<RootStackParamList['MapPinPicker']>;
  const isCustomer = mode === 'customer';
  const mapRef = useRef<MapView | null>(null);

  const [pin, setPin] = useState<LatLng>(
    initialLatitude != null && initialLongitude != null
      ? { latitude: initialLatitude, longitude: initialLongitude }
      : DEFAULT_REGION,
  );
  // The settled coordinate reverse geocode fires for (latest-wins).
  const [settled, setSettled] = useState<LatLng>(pin);
  const [radiusM, setRadiusM] = useState(initialRadiusM ?? 100);
  const [isPanning, setIsPanning] = useState(false);
  // Provenance for the form's "GPS Verified" chip (office mode): true only
  // while the pin is the device's own fix. A search result clears it, and so
  // does a finger gesture that moves the pin away from the fix. The map tags
  // each settle with `isGesture`, so programmatic moves (animateToRegion
  // after a fix or a search) never read as a manual pan, whatever order the
  // map's events arrive in.
  const [gpsVerified, setGpsVerified] = useState(false);
  const lastFixRef = useRef<LatLng | null>(null);
  // The pin counts as placed once it comes from a saved office, a device fix,
  // a search result or the owner's own pan. Until then it is only the
  // India default centre, which must not be saved as the office location.
  const [placed, setPlaced] = useState(initialLatitude != null && initialLongitude != null);
  const [placeHint, setPlaceHint] = useState(false);

  const { addressText, addressLoading, reverseResult } = useReverseAddress(settled);
  // The last resolved search place and where it moved the pin — a Confirm
  // still on those coordinates returns the place's structured fields
  // (placeId included) instead of a reverse geocode of the same point.
  const resolvedRef = useRef<{ centre: LatLng; place: ResolvedPlace } | null>(null);

  // "Map unavailable" detection: react-native-maps 1.29.8 exposes no error
  // event, so a failed tile load is detected as "onMapLoaded never fired"
  // within the deadline — a hung/failed map then swaps to the fallback
  // panel, while locate-me and address search keep working over it.
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  useEffect(() => {
    if (mapLoaded) return;
    const timer = setTimeout(() => setMapFailed(true), 10_000);
    return () => clearTimeout(timer);
  }, [mapLoaded]);

  // Retry re-mounts the map and restarts the load deadline — a slow (not
  // failed) map gets a second chance instead of a terminal fallback panel.
  const retryMap = useCallback(() => {
    setMapLoaded(false);
    setMapFailed(false);
  }, []);

  const [searchVisible, setSearchVisible] = useState(false);

  // Moves the pin to a device fix. Pin state is set directly too, so Confirm
  // still works if the map failed to render (the "Map unavailable" fallback
  // keeps search and locate functional).
  const applyFix = useCallback((loc: LatLng) => {
    setPin(loc);
    setSettled(loc);
    setGpsVerified(true);
    setPlaced(true);
    setPlaceHint(false);
    lastFixRef.current = loc;
    mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, []);

  const {
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
  } = usePickerLocate({ applyFix, searchVisible, setSearchVisible });

  // Silent initial fix — NO prompt: the map opens on the India default and
  // only owners who already granted location get centred on their area
  // (the locate button handles the prompting path). Only Android can check
  // permission without prompting; the whole fix is Android-only — on iOS
  // even a check-then-fix pair triggers the CoreLocation prompt at map
  // open, exactly what this path documents against.
  useEffect(() => {
    if (Platform.OS !== 'android' || initialLatitude != null) return;
    const load = async () => {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (!granted) return;
        const pos = await getCurrentPosition();
        applyFix({ latitude: pos.latitude, longitude: pos.longitude });
      } catch {
        // Silent — the default region is a fine starting point.
      }
    };
    void load();
    // Params are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRegionChange = useCallback((region: Region) => {
    setIsPanning(true);
    setPin({ latitude: region.latitude, longitude: region.longitude });
  }, []);

  const onRegionChangeComplete = useCallback((region: Region, details?: Details) => {
    const centre: LatLng = { latitude: region.latitude, longitude: region.longitude };
    setPin(centre);
    setSettled(centre);
    setIsPanning(false);
    // Only the owner's own gesture changes provenance. A pinch-zoom about
    // the fix leaves the pin where it was, so it stays verified.
    if (details?.isGesture) {
      setPlaced(true);
      setPlaceHint(false);
      const fix = lastFixRef.current;
      if (!fix || !sameCentre(fix, centre)) setGpsVerified(false);
    }
  }, []);

  const handleResolvedPlace = useCallback(
    (place: ResolvedPlace) => {
      const loc = { latitude: place.latitude, longitude: place.longitude };
      discardPendingFix();
      setPin(loc);
      setSettled(loc);
      setGpsVerified(false);
      setPlaced(true);
      setPlaceHint(false);
      lastFixRef.current = null;
      setSearchVisible(false);
      resolvedRef.current = { centre: loc, place };
      mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    },
    [discardPendingFix],
  );

  const handleConfirm = useCallback(() => {
    // While a pan is in flight `settled` still holds the PREVIOUS centre —
    // the visible pin is at `pin` (updated per region event), so confirm
    // that instead. After the settle the two are identical.
    const centre = isPanning ? pin : settled;

    // Office mode: never save the untouched default centre as the office.
    // Manual placement stays open — one pan or a search is enough.
    if (!isCustomer && !placed) {
      setPlaceHint(true);
      return;
    }

    if (!isCustomer) {
      // Display-only street address (a stale lookup for an earlier centre is
      // ignored by buildCustomerPick's centre match); none → form shows coordinates.
      const formatted =
        buildCustomerPick(centre, resolvedRef.current, reverseResult).snapshot.formattedAddress;
      const address = formatted ? stripPlusCode(formatted) || null : null;
      navigation.popTo(
        'OfficeForm',
        {
          pickedLocation: {
            latitude: centre.latitude,
            longitude: centre.longitude,
            radiusM,
            gpsVerified,
            address: address ?? undefined,
          },
        },
        { merge: true },
      );
      return;
    }

    // One reverse geocode still in flight contributes nothing rather than
    // blocking — the form keeps the coordinates either way.
    navigation.popTo(
      'AddCustomer',
      { pickedAddress: buildCustomerPick(centre, resolvedRef.current, reverseResult) },
      { merge: true },
    );
  }, [navigation, settled, pin, isPanning, radiusM, gpsVerified, isCustomer, placed, reverseResult]);

  // Customer mode only — a hand-typed address returns with a null snapshot
  // (no coordinates), exactly like the form's own manual path.
  const handleManualAddress = useCallback(
    (entry: ManualAddressEntry) => {
      discardPendingFix();
      setSearchVisible(false);
      navigation.popTo(
        'AddCustomer',
        {
          pickedAddress: {
            addressLine: entry.addressLine,
            city: entry.city ?? '',
            snapshot: null,
          },
        },
        { merge: true },
      );
    },
    [navigation, discardPendingFix],
  );

  // The card shows a spinner while a reverse geocode is in flight; before
  // the first answer arrives (or if none ever does) the raw coordinates are
  // the label — never an error state.
  const { label: addressLabel, fromSearch } = pickerAddressLabel(
    pin,
    resolvedRef.current,
    addressText,
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={isCustomer ? 'Set customer location' : 'Place office pin'}
        onBack={() => navigation.goBack()}
      />

      <PickerMapArea
        mapRef={mapRef}
        pin={pin}
        radiusM={isCustomer ? undefined : radiusM}
        isPanning={isPanning}
        mapFailed={mapFailed}
        locating={locating}
        servicesOff={servicesOff}
        pinPlaced={placed}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapLoaded={() => setMapLoaded(true)}
        onRetry={retryMap}
        onOpenSearch={() => setSearchVisible(true)}
        onLocate={() => void handleLocate()}
      />

      <PickerBottomCard
        addressText={addressLabel}
        addressLoading={addressLoading && !fromSearch}
        locateError={locateError}
        canOpenSettings={canOpenSettings}
        onOpenSettings={openSettings}
        servicesOff={servicesOff}
        onEnableServices={() => void handleEnableServices()}
        onOpenSearch={() => setSearchVisible(true)}
        radiusM={isCustomer ? undefined : radiusM}
        onRadiusChange={isCustomer ? undefined : setRadiusM}
        onConfirm={handleConfirm}
        notice={placeHint ? 'Move the map or search for an address to place the pin.' : undefined}
      />

      <AddressPickerSheet
        visible={searchVisible}
        onClose={handleCloseSearch}
        onResolved={handleResolvedPlace}
        locationOff={servicesOff}
        onTurnOnLocation={() => void handleTurnOnFromSearch()}
        onManualAddress={isCustomer ? handleManualAddress : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
});
