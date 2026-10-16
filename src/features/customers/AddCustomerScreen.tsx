/**
 * AddCustomerScreen — full-page route for adding a customer (name + phone,
 * plus optional city, area and address).
 *
 * Previously (Story 1.5) this form lived in `AddCustomerSheet`, a native
 * bottom-sheet modal, with the address picker (`AddressPickerScreen`) pushed
 * as a full-screen route on top of it. On a physical device that combination
 * silently dismissed the open sheet — pushing a stack screen over a
 * presented native modal closes the modal on the native side even though its
 * JS `visible` state doesn't change. Making this a full page removes the
 * conflict: the address is picked on the `MapPinPicker` screen (mode
 * `customer` — exact pin on a map, with address search and the manual-entry
 * fallback inside it; SPEC-customer-map-pin-picker), which returns the pick
 * via navigate-back-with-params.
 *
 * The address field and its populate pulse are one self-contained control
 * (`components/AddressPickerField`) — presentational only: this screen owns
 * navigation, form state, and the returned-pick application. The POST submit
 * chain lives in `useCreateCustomer`. This screen keeps the form state, the
 * payload assembly, and the post-save navigation contract:
 *
 * `returnRouteName` decides what happens after a successful save:
 * - `'Customers'`/`'Home'`: the shared `useCustomers` store already reflects
 *   the new row (via `upsertCustomer`), so a plain `goBack()` is enough — no
 *   data needs to travel back through navigation params. (`Home` is the
 *   quick-action entry; the list the user sees next reads the same store.)
 * - `'NewJob'`: the caller needs to *select* the new customer, so it travels
 *   back as `createdCustomerId` (this screen is a sibling of `NewJob` on the
 *   root stack, so `popTo('NewJob', …, { merge: true })` pops back to it —
 *   plain `navigate` pushes a duplicate in React Navigation 7; `Customers`
 *   is nested inside `MainTabs` and just takes the store update).
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
import { ArrowLeft, Phone, User, UserPlus } from 'lucide-react-native';
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
import { AddressPickerField } from './components/AddressPickerField';
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
  const [address, setAddress] = useState('');

  // Structured snapshot from a located pick (search resolve or pin drop) —
  // kept separate from `address`/`city` above so a later hand-edit of the
  // free text never clears or re-syncs it (additive backend columns; free
  // text and structured snapshot are independent fields end to end). `null`
  // after a manual entry (and before any pick).
  const [snapshot, setSnapshot] = useState<PickedAddressSnapshot | null>(null);

  // Bumped each time a returned pick is applied — drives the address
  // field's populate pulse (the pick itself arrives via route params).
  const [pickSignal, setPickSignal] = useState(0);

  const { submitting, submitError, clearSubmitError, handleSubmit } =
    useCreateCustomer({
    navigation,
    returnRouteName,
  });

  const canSubmit =
    name.trim().length > 0 && phone.length === PHONE_LENGTH && !submitting;

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
    setAddress(picked.addressLine);
    // An entry without a city must not wipe one the user already typed in
    // the City field above.
    if (picked.city) setCity(picked.city);
    setSnapshot(picked.snapshot);
    setPickSignal(n => n + 1);
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

  const buildRequest = (): NewCustomerInput => ({
    name: name.trim(),
    phone,
    city: city.trim(),
    area: area.trim(),
    address: address.trim(),
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
              label="Area"
              value={area}
              onChangeText={editField(setArea)}
              placeholder="Andheri West"
              autoCapitalize="words"
              style={styles.rowItem}
            />
          </View>

          <AddressPickerField
            value={address}
            disabled={submitting}
            pickSignal={pickSignal}
            onPress={() =>
              navigation.navigate('MapPinPicker', { mode: 'customer' })
            }
          />
        </ScrollView>

        {/* Footer sits outside the ScrollView so "Add customer" is always
            reachable without scrolling to the bottom. */}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={onSubmit}
            leadingIcon={
              <UserPlus size={20} color={colors.onPrimary} strokeWidth={2.5} />
            }>
            {submitting ? 'Saving…' : 'Add customer'}
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
  row: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  rowItem: {
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