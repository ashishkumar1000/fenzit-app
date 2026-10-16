/**
 * AddCustomerScreen — full-page route for adding a customer, in the design-v2
 * layout: two section cards ("Contact details" and "Service location &
 * address") over a single "Save customer" action.
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
 * The POST submit chain lives in `useCreateCustomer`; `returnRouteName`
 * decides post-save navigation — see the contract in `useCreateCustomer.ts`.
 */
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
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
import { Button, Input } from '../../components/ui';
import { colors, spacing, touch, typography } from '../../theme';
import { toCreateCustomerRequest } from './requestMapping';
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
  const { returnRouteName = 'Customers', pickedAddress: pickedAddressParam } =
    route.params ?? {};

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

  const { submitting, submitError, clearSubmitError, handleSubmit } =
    useCreateCustomer({
    navigation,
    returnRouteName,
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

  // MapPinPicker's return channel (navigate-back-with-params, read once on
  // arrival then cleared — a stale pick must not re-fire on re-focus).
  useEffect(() => {
    if (!pickedAddressParam) return;
    handlePick(pickedAddressParam);
    navigation.setParams({ pickedAddress: undefined });
    // Params are read once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedAddressParam]);

  // "Required *" on the location card: a location signal is any of a picked
  // location, Street, City or Area.
  const hasLocation =
    snapshot !== null ||
    street.trim().length > 0 ||
    city.trim().length > 0 ||
    area.trim().length > 0;

  const canSubmit =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    hasLocation &&
    !submitting;

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
    void handleSubmit(toCreateCustomerRequest(buildRequest()));
  };

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
        <Text style={styles.title}>Add customer</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <FormSectionCard
            icon={<User size={18} color={colors.primary} strokeWidth={2} />}
            title="Contact details"
            subtitle="Customer identification & phone">
            <Input
              label="Customer name"
              required
              value={name}
              onChangeText={editField(setName)}
              placeholder="e.g. Ramesh Kumar"
              autoCapitalize="words"
              leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
            />

            <Input
              label="Phone number"
              required
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              maxLength={PHONE_LENGTH}
              leadingIcon={
                <View style={styles.dialRow}>
                  <Phone size={18} color={colors.textMuted} strokeWidth={2} />
                  <Text style={styles.dial}>{DIAL_CODE}</Text>
                </View>
              }
            />
          </FormSectionCard>

          <FormSectionCard
            icon={<MapPin size={18} color={colors.primary} strokeWidth={2} />}
            title="Service location & address"
            subtitle="Where technicians will arrive"
            required>
            {/* Resolved-address preview: read-only box + Change — the whole
                box opens the map picker. Empty until a pick lands. */}
            <Pressable
              onPress={() =>
                navigation.navigate('MapPinPicker', { mode: 'customer' })
              }
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Open the map to set the service location"
              style={styles.previewBox}>
              {previewLine ? (
                <Text style={styles.previewText}>{previewLine}</Text>
              ) : (
                <Text style={styles.previewPlaceholder}>
                  Tap to set the service location on a map
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
              placeholder="e.g. Flat 402, Sunshine Towers, Wing B"
              autoCapitalize="sentences"
              leadingIcon={
                <Building2 size={18} color={colors.textMuted} strokeWidth={2} />
              }
            />

            <Input
              label="Street, Landmark or Locality"
              value={street}
              onChangeText={editField(setStreet)}
              placeholder="e.g. Opposite Metro Station, Link Road"
              autoCapitalize="sentences"
              leadingIcon={
                <Compass size={18} color={colors.textMuted} strokeWidth={2} />
              }
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
                Technicians will navigate directly to this address and
                coordinates.
              </Text>
            </View>
          </FormSectionCard>
        </ScrollView>

        {/* Footer sits outside the ScrollView so Save is always reachable
            without scrolling to the bottom. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
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
            {submitting ? 'Saving…' : 'Save customer'}
          </Button>
        </SafeAreaView>
      </KeyboardAvoidingView>
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
  },
  rowItem: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    marginTop: spacing.s1,
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
});
