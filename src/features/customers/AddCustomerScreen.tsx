/**
 * AddCustomerScreen — full-page route for adding and editing a customer.
 * Design v2 as tuned by hand: the contact fields (name + phone) sit bare at
 * the top of the form, and the "Customer address" section keeps its
 * FormSectionCard (icon chip + Required* badge) over a single Save action.
 *
 * The service-location card is the CAP-5 surface: the resolved address lives
 * in a read-only preview box (with a Change button that opens the shared
 * `MapPinPicker`, mode `customer` — the pick returns via
 * navigate-back-with-params, read once then cleared), while the user's OWN
 * text is captured in always-visible fields that map 1:1 onto the customers
 * columns:
 * - "Flat / House no., Building & Wing" → `addressDetails`
 * - "Street, Landmark or Locality"      → free-text `address`
 * - "Area / Pincode"                    → `area` (requestMapping merges it
 *   into the address line, as it always has)
 * A pin/search pick NO LONGER copies the resolved line into the free-text
 * address — the preview box and `formattedAddress` carry it (the jobs embed
 * and the technician row read `formattedAddress`, falling back to the free
 * text for manual-entry customers). A manual entry prefills Street with its
 * line instead, because a manual customer has no snapshot to carry it.
 *
 * "Required *" on the location card is enforced: Save needs a location
 * signal (a picked location, or any of street/city/area filled) on top of
 * name + phone.
 *
 * Edit mode (SPEC-edit-customer) is the same route with a `customerId`
 * param — the OfficeFormScreen single-route precedent: load-and-seed via
 * `getById` (list rows lack the coordinates), the phone renders read-only
 * (immutable in v1), and Save PATCHes only what changed against the seeded
 * baseline (`buildCustomerUpdatePatch`) — an untouched form pops without a
 * request. The picker opens centred on the current snapshot (CAP-2), and a
 * new pick replaces the location block as a unit.
 *
 * The submit chain lives in `useCreateCustomer`; `returnRouteName` decides
 * post-save navigation — see the contract in `useCreateCustomer.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Compass,
  ChevronRight,
  Info,
  MapPin,
  Phone,
  User,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ConfirmDialog, InlineError, Input } from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { customerService } from '../../services';
import type { ApiError } from '../../services';
import {
  buildCustomerUpdatePatch,
  toCreateCustomerRequest,
  toCustomerFormSeed,
  type CustomerUpdateBaseline,
} from './requestMapping';
import type {
  NewCustomerInput,
  PickedAddress,
  PickedAddressSnapshot,
} from './types';
import type { RootStackParamList } from '../../navigation/types';
import { FormSectionCard } from './components/FormSectionCard';
import { useCreateCustomer } from './useCreateCustomer';
import { DIAL_CODE, PHONE_LENGTH } from './constants';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCustomer'>;

export default function AddCustomerScreen({ navigation, route }: Props) {
  // `returnRouteName` is always supplied by real callers; the default only
  // type-placates the MapPinPicker merge-return, which carries just
  // `pickedAddress` (the NewJob convention of all-optional merge params).
  const {
    returnRouteName = 'Customers',
    pickedAddress: pickedAddressParam,
    customerId,
  } = route.params ?? {};
  // Presence of `customerId` = edit mode (see navigation/types.ts).
  const isEdit = Boolean(customerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  // Street, Landmark or Locality — the user's own navigational text; the
  // free-text `address` column. The resolved line is never copied here.
  const [street, setStreet] = useState('');
  // The user's extra location detail (flat/building/wing — CAP-5).
  const [addressDetails, setAddressDetails] = useState('');
  // Structured snapshot from a located pick — independent of the free text
  // above (a hand-edit never clears it; additive backend columns).
  const [snapshot, setSnapshot] = useState<PickedAddressSnapshot | null>(null);
  // What the preview box shows: the last pick's display line (resolved
  // formattedAddress / coordinate fallback, or a manual entry's line).
  const [previewLine, setPreviewLine] = useState('');
  // Discard guard (CAP-6): leaving with unsaved input asks first.
  const [discardVisible, setDiscardVisible] = useState(false);
  // Edit mode only (OfficeFormScreen precedent): load-and-seed from the
  // detail endpoint, with the same three load states — spinner, 404 notice,
  // inline load error over the (unseeded, unsavable) form.
  const [isLoading, setIsLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The seeded baseline — the diff anchor for both Save and the discard
  // guard. Null until the seed lands (and always in add mode).
  const [baseline, setBaseline] = useState<CustomerUpdateBaseline | null>(null);
  const removeActionRef = useRef<{ data: { action: { type: string } } } | null>(
    null,
  );

  const { submitting, submitError, clearSubmitError, handleSubmit } =
    useCreateCustomer({
    navigation,
    returnRouteName,
    customerId,
  });

  /**
   * Any edit clears a previous submit error — the user is most likely fixing
   * exactly what the server complained about, so a stale 422 shouldn't sit
   * under the form while they do.
   */
  const editField = (setter: (value: string) => void) => (text: string) => {
    if (submitError) clearSubmitError();
    setter(text);
  };

  const handlePhoneChange = editField(text =>
    setPhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH)),
  );

  const handlePick = (picked: PickedAddress) => {
    setPreviewLine(picked.addressLine);
    // An entry without a city must not wipe one the user already typed in
    // the City field above.
    if (picked.city) setCity(picked.city);
    setSnapshot(picked.snapshot);
    // A manual entry has NO snapshot to carry its line — prefill Street with
    // it (keeping anything the user already typed) so it reaches the payload.
    if (!picked.snapshot) {
      setStreet(prev => (prev ? prev : picked.addressLine));
    }
  };

  // Edit mode: load-and-seed from `getById` — a list row lacks the
  // coordinates the map prefill needs. A 404 (removed / cross-tenant) or a
  // 403 shows the dedicated notice instead of a broken form.
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    customerService
      .getById(customerId)
      .then(detail => {
        if (!active) return;
        const seed = toCustomerFormSeed(detail);
        setName(seed.name);
        setPhone(seed.phone);
        setCity(seed.city);
        setArea(seed.area);
        setStreet(seed.street);
        setAddressDetails(seed.addressDetails);
        setSnapshot(seed.snapshot);
        setPreviewLine(seed.previewLine);
        setBaseline(seed.baseline);
        setIsLoading(false);
      })
      .catch((err: ApiError) => {
        if (!active) return;
        // 403 groups with 404 (technician JWT / cross-tenant) — the same
        // notFound grouping CustomerDetailScreen renders for this endpoint.
        if (err.status === 404 || err.status === 403) {
          setNotFound(true);
        } else {
          setLoadError(
            'Could not load this customer. Go back and try again.',
          );
        }
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  // MapPinPicker's return channel (navigate-back-with-params, read once on
  // arrival then cleared — a stale pick must not re-fire on re-focus).
  useEffect(() => {
    if (!pickedAddressParam) return;
    handlePick(pickedAddressParam);
    navigation.setParams({ pickedAddress: undefined });
    // Params are read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedAddressParam]);

  // Discard guard — beforeRemove fires for the hardware/gesture back AND
  // the header arrow (goBack dispatches it too); it does NOT fire when the
  // picker pushes on top of this screen, so a location pick can't trigger
  // it. While a save is in flight the submit hook's own guard blocks
  // leaving and this one stays out of the way.
  useEffect(() => {
    return navigation.addListener('beforeRemove', e => {
      if (submittingRef.current) return;
      if (!isDirtyRef.current) return;
      e.preventDefault();
      removeActionRef.current = e;
      setDiscardVisible(true);
    });
  }, [navigation]);

  const handleDiscard = () => {
    const e = removeActionRef.current;
    setDiscardVisible(false);
    removeActionRef.current = null;
    if (e) navigation.dispatch(e.data.action);
  };

  const handleKeepEditing = () => {
    setDiscardVisible(false);
    removeActionRef.current = null;
  };

  // "Required *" on the location card: a location signal is any of a picked
  // location, Street, City or Area. Edit keeps the same rule over the same
  // fields — the seed lives in them, so a customer with any saved location
  // passes without extra state.
  const hasLocation =
    snapshot !== null ||
    street.trim().length > 0 ||
    city.trim().length > 0 ||
    area.trim().length > 0;

  // Whether the SEEDED customer had a location at all — its snapshot or any
  // saved line/city text (the merged line lives in the baseline's
  // `address`; there is no separate area). Edit drops the Required* term
  // for a customer with none (a job-created name+phone row): an unrelated
  // fix can't be dead-ended by a rule about a field the customer never had.
  const baselineHadLocation =
    baseline !== null &&
    (baseline.snapshot !== null ||
      (baseline.address ?? '').length > 0 ||
      baseline.city.length > 0);

  // The live form values in the patch builder's shape — the dirty check and
  // the Save patch must read the exact same snapshot of the state.
  const formValues = () => ({ name, street, city, area, addressDetails, snapshot });

  // "The user has filled something" (add) / "changed something" (edit):
  // add reads entered fields or a picked location; edit diffs against the
  // seeded baseline through the SAME builder Save uses, so the discard
  // guard and the PATCH can never disagree (an untouched seeded form is
  // leaveable without the dialog and saves as a no-op). Read through refs
  // by the beforeRemove listener so the listener never needs to re-arm
  // (event-time truthiness is what matters).
  const isDirty = isEdit
    ? baseline !== null &&
      Object.keys(buildCustomerUpdatePatch(formValues(), baseline)).length > 0
    : name.trim().length > 0 ||
      phone.length > 0 ||
      addressDetails.trim().length > 0 ||
      hasLocation;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  // The phone gate is add-only: edit seeds the server's digits into a
  // read-only field, so a legacy short row must not dead-end Save with no
  // hint.
  const phoneOk = isEdit || phone.length === PHONE_LENGTH;

  const canSubmit =
    name.trim().length > 0 &&
    phoneOk &&
    (isEdit ? !baselineHadLocation || hasLocation : hasLocation) &&
    !submitting;

  // Why Save is greyed out, in the order the fields sit on screen. Shown under
  // the button so a disabled Save never leaves the person guessing.
  const missingHint = (() => {
    if (submitting || canSubmit) return null;
    if (name.trim().length === 0) return "Enter the customer's name to continue";
    if (!phoneOk) return 'Enter a 10-digit phone number to continue';
    return "Add the customer's location to continue";
  })();

  const buildRequest = (): NewCustomerInput => ({
    name: name.trim(),
    phone,
    city: city.trim(),
    area: area.trim(),
    // Street only — the resolved line travels as `formattedAddress` below.
    address: street.trim(),
    ...(addressDetails.trim() ? { addressDetails: addressDetails.trim() } : {}),
    // The snapshot only ever exists together as a whole — its presence is
    // the signal that a located pick exists at all. Within it, `pincode`
    // and (on a pin drop) `formattedAddress`/`placeId` can legitimately be
    // absent — coordinates are the only guaranteed fields, so they're what
    // gates the structured block; each text field is gated on its own.
    ...(snapshot
      ? {
          ...(snapshot.formattedAddress
            ? { formattedAddress: snapshot.formattedAddress }
            : {}),
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          ...(snapshot.placeId ? { placeId: snapshot.placeId } : {}),
          ...(snapshot.pincode ? { pincode: snapshot.pincode } : {}),
        }
      : {}),
  });

  const onSubmit = () => {
    if (!canSubmit) return;
    // The baseline can't be null on a save press (the form only renders
    // after the seed, and the load-error form has nothing seeded to save) —
    // the guard is a belt for a state the form can't reach, not a
    // user-facing failure path.
    if (isEdit) {
      if (!baseline || !customerId) return;
      const patch = buildCustomerUpdatePatch(formValues(), baseline);
      // Empty diff → no request at all (a bare body is a 400 "Nothing to
      // update" server-side): an untouched save just pops back, exactly
      // like the office form's.
      if (Object.keys(patch).length === 0) {
        navigation.goBack();
        return;
      }
      void handleSubmit(patch);
      return;
    }
    void handleSubmit(toCreateCustomerRequest(buildRequest()));
  };

  // Edit-mode load states (OfficeFormScreen precedent): a spinner while the
  // seed is in flight, a dedicated notice for a removed/cross-tenant
  // customer. Add mode never enters either (isLoading starts false).
  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
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
          <Text style={styles.title}>Edit customer</Text>
        </View>
        <View style={styles.center}>
          <InlineError message="This customer is no longer available. It may have been removed." />
          <Button variant="secondary" size="md" onPress={() => navigation.goBack()}>
            Go back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={submitting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{isEdit ? 'Edit customer' : 'Add customer'}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        // Pad on BOTH platforms: Android 15+ enforces edge-to-edge, so the
        // manifest's adjustResize never resizes the window and the keyboard
        // would cover the lower fields (Flat/Street/City) entirely.
        behavior="padding">
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* A non-404 load failure leaves the form unseeded — say so instead
              of a silent blank edit form (the office-form placement). */}
          {loadError ? <InlineError message={loadError} /> : null}

          <Input
            label="Customer name"
            required
            value={name}
            onChangeText={editField(setName)}
            placeholder="e.g. Ramesh Kumar"
            autoCapitalize="words"
            leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
          />

          {/* The phone is the identity key — immutable in v1
              (SPEC-edit-customer), so edit mode renders it read-only:
              `editable={false}` blocks the keyboard, `disabled` carries the
              grayed "not yours to change" styling. */}
          <Input
            label="Phone number"
            required
            value={phone}
            onChangeText={handlePhoneChange}
            placeholder="98765 43210"
            keyboardType="phone-pad"
            maxLength={PHONE_LENGTH}
            editable={!isEdit}
            disabled={isEdit}
            helper={isEdit ? "Phone numbers can't be changed" : undefined}
            leadingIcon={
              <View style={styles.dialRow}>
                <Phone size={18} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.dial}>{DIAL_CODE}</Text>
              </View>
            }
          />

          <FormSectionCard
            icon={<MapPin size={18} color={colors.primary} strokeWidth={2} />}
            title="Customer address"
            subtitle="Where your technician will visit"
            required>
            {/* Resolved-address preview: read-only box + Change — the whole
                box opens the map picker. Empty until a pick lands. */}
            <Pressable
              onPress={() =>
                navigation.navigate('MapPinPicker', {
                  mode: 'customer',
                  // CAP-2 prefill: the CURRENT snapshot (seeded or freshly
                  // picked) centres the picker; a manual-entry customer
                  // opens cold, exactly as add mode always has.
                  ...(snapshot
                    ? {
                        initialLatitude: snapshot.latitude,
                        initialLongitude: snapshot.longitude,
                      }
                    : {}),
                })
              }
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Open the map to set the customer's location"
              style={styles.previewBox}>
              {previewLine ? (
                <Text style={styles.previewText}>{previewLine}</Text>
              ) : (
                <Text style={styles.previewPlaceholder}>
                  Tap to add the location on a map
                </Text>
              )}
              <View style={styles.changeButton}>
                <Text style={styles.changeButtonText}>
                  {previewLine ? 'Change' : 'Set location'}
                </Text>
                <ChevronRight size={14} color={colors.primary} strokeWidth={2.5} />
              </View>
            </Pressable>

            <Input
              label="Flat / House no., Building & Wing"
              value={addressDetails}
              onChangeText={editField(setAddressDetails)}
              placeholder="e.g. Flat 402, Sunshine Towers"
              autoCapitalize="sentences"
              leadingIcon={
                <Building2 size={18} color={colors.textMuted} strokeWidth={2} />
              }
              style={styles.fieldAfterPreview}
            />

            <Input
              label="Street, Landmark or Locality"
              value={street}
              onChangeText={editField(setStreet)}
              placeholder="e.g. Opposite Metro Station"
              autoCapitalize="sentences"
              leadingIcon={
                <Compass size={18} color={colors.textMuted} strokeWidth={2} />
              }
              style={styles.fieldAfterField}
            />

            <View style={styles.row}>
              <Input
                label="City"
                value={city}
                onChangeText={editField(setCity)}
                placeholder="Mumbai"
                autoCapitalize="words"
                style={styles.rowItem}
              />
              <Input
                label="Area / Pincode"
                value={area}
                onChangeText={editField(setArea)}
                placeholder="Andheri West"
                autoCapitalize="words"
                style={styles.rowItem}
              />
            </View>

            <View style={styles.infoRow}>
              <Info size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.infoText}>
                Your technician will use this address and the map pin to reach
                the customer.
              </Text>
            </View>
          </FormSectionCard>
        </ScrollView>

        {/* Footer sits outside the ScrollView so Save is always reachable
            without scrolling to the bottom. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
          {!submitError && missingHint ? (
            <Text
            style={styles.missingHint}
            accessibilityLiveRegion="polite">
            {missingHint}
          </Text>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={onSubmit}
            leadingIcon={
              submitting ? undefined : (
                <CheckCircle2 size={20} color={colors.onPrimary} strokeWidth={2.5} />
              )
            }>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save customer'}
          </Button>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={discardVisible}
        title="Leave without saving?"
        message={
          isEdit
            ? "Your changes haven't been saved yet."
            : "The details you entered haven't been saved yet."
        }
        confirmLabel="Don't save"
        confirmVariant="danger"
        cancelLabel="Keep editing"
        icon={<AlertTriangle size={18} color={colors.primary} strokeWidth={2} />}
        onConfirm={handleDiscard}
        onCancel={handleKeepEditing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  flex: {
    flex: 1,
  },
  // Edit-mode load views (spinner / 404 notice) — same centered treatment
  // as CustomerDetailScreen's, with the error views' breathing room.
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s4,
    gap: spacing.s2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    // Icon-only control — an explicit touch.min box with the icon centred;
    // the 24px icon plus hitSlop alone came to ~40px, under the design
    // system's ≥44px minimum.
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
  form: {
    padding: spacing.s4,
    paddingBottom: spacing.s6,
    gap: spacing.s4,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: `${colors.primary}55`,
    borderRadius: 12,
    backgroundColor: `${colors.primary}0D`,
    padding: spacing.s3,
    gap: spacing.s3,
    marginBottom: spacing.s4,
  },
  previewText: {
    ...typography.body,
    color: colors.textStrong,
  },
  previewPlaceholder: {
    ...typography.body,
    color: colors.textMuted,
  },
  changeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  changeButtonText: {
    ...typography.bodySm,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginTop: spacing.s5,
  },
  rowItem: {
    flex: 1,
  },
  fieldAfterPreview: {
    // Token stand-ins for the hand-tuned 10px: design-system values only.
    marginTop: spacing.s3,
  },
  fieldAfterField: {
    marginTop: spacing.s5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    marginTop: spacing.s4,
  },
  infoText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Icon-to-text gap — the `spacing.s1` convention used by other
    // icon + text rows (see `Input`'s leading icon, AttachmentGrid).
    gap: spacing.s1,
  },
  dial: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
  },
  missingHint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
