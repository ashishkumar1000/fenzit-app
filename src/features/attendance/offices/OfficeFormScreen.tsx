/**
 * OfficeFormScreen — add/edit an attendance office (Story 15-4).
 *
 * Add mode posts the full create payload; edit mode PATCHes only what
 * changed — profile fields (name/pin/radius) apply immediately, the rules
 * fields travel as the complete five-field set through the effective-dated
 * RPC (partial set is a 400 server-side) and carry the "tomorrow" copy.
 *
 * The pin comes from the map picker: the location row opens
 * `MapPinPicker` (mode `office`), which returns the FINAL pin position via
 * navigate-back-with-params (`pickedLocation`) — a search result only ever
 * moved the map.
 *
 * Documented failures: 409 name-taken → inline name error; 404 on load
 * (unknown/archived office) → notice + back to list; archive 409 → the
 * inline blocking-employee count (no dead-end error; the Employees-list
 * shortcut lands in 15-9).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Archive, Building2, Check } from 'lucide-react-native';
import { Badge, Button, ConfirmDialog, InlineError, Input } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { officesService } from '../../../services';
import type { ApiError } from '../../../services';
import type { OfficeDetail } from '../../../types/office';
import {
  buildCreateRequest,
  buildUpdatePatch,
  emptyOfficeForm,
  formFromDetail,
  hasErrors,
  isAddressChanged,
  isFormDirty,
  validateOfficeForm,
  type OfficeFormErrors,
  type OfficeFormState,
} from './officeFormModel';
import OfficeLocationCard from './OfficeLocationCard';
import OfficeRuleFields from './OfficeRuleFields';
import ScreenHeader from './ScreenHeader';
import { useScrollFieldIntoView } from './useScrollFieldIntoView';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import type { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OfficeForm'>;

/** Fields whose validation compares against another field's value. */
const DEPENDENT_ERROR: Partial<Record<keyof OfficeFormState, keyof OfficeFormErrors>> = {
  startTime: 'endTime',
  fullDayHours: 'halfDayHours',
};

export default function OfficeFormScreen({ navigation, route }: Props) {
  const officeId = route.params?.officeId;
  const isEdit = Boolean(officeId);

  const { scrollRef, onScroll, onFieldFocus } = useScrollFieldIntoView();
  const [form, setForm] = useState<OfficeFormState>(emptyOfficeForm);
  // True only while the pin is the device's own fix (map picker locate-me).
  // An edit-loaded office has unknown provenance — the chip stays hidden.
  const [gpsVerified, setGpsVerified] = useState(false);
  // Address of the pin — display text, saved with the office. Starts from the
  // saved office; replaced by the picker's address when the pin is re-picked.
  const [pinAddress, setPinAddress] = useState<string | null>(null);
  const [errors, setErrors] = useState<OfficeFormErrors>({});
  const [detail, setDetail] = useState<OfficeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  // Archive asks through the shared ConfirmDialog instead of a system Alert
  // (the 20-1 modal ask) — same wording, in-app styling.
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  // Leaving with unsaved edits asks first; save/archive step past the ask.
  const leaveGuard = useUnsavedChangesGuard(
    navigation,
    isFormDirty(form, detail) || isAddressChanged(detail, pinAddress),
  );

  // Editing a field clears its own error straight away (including a server
  // "name taken"), plus the error of the field that is validated against it.
  const onChange = useCallback((patch: Partial<OfficeFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof OfficeFormState)[]) {
        if (key in next) delete next[key as keyof OfficeFormErrors];
        const dependent = DEPENDENT_ERROR[key];
        if (dependent) delete next[dependent];
      }
      return next;
    });
  }, []);

  // Edit mode: pre-fill from the office's rules history. A 404 (unknown or
  // archived) shows the notice instead of a broken form.
  useEffect(() => {
    if (!officeId) return;
    let active = true;
    officesService
      .get(officeId)
      .then((loaded) => {
        if (!active) return;
        setDetail(loaded);
        setForm(formFromDetail(loaded));
        setPinAddress(loaded.formattedAddress ?? null);
        setIsLoading(false);
      })
      .catch((err: ApiError) => {
        if (!active) return;
        if (err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError('Could not load this office. Check your connection and try again.');
        }
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [officeId]);

  // The map picker's confirmed pin arrives via navigate-back-with-params.
  // Re-applies are idempotent (same values), so no param clear is needed.
  useEffect(() => {
    const picked = route.params?.pickedLocation;
    if (!picked) return;
    setForm((prev) => ({
      ...prev,
      latitude: picked.latitude,
      longitude: picked.longitude,
      radiusM: picked.radiusM,
    }));
    setGpsVerified(Boolean(picked.gpsVerified));
    // No address found for the new pin: keep the saved one only when the pin
    // did not move (a failed lookup must not wipe a good address); otherwise
    // the old address would name a different place.
    const samePin =
      detail !== null &&
      picked.latitude === detail.latitude &&
      picked.longitude === detail.longitude;
    setPinAddress((prev) => picked.address ?? (samePin ? prev : null));
    setErrors((prev) => ({ ...prev, location: undefined }));
  }, [route.params?.pickedLocation, detail]);

  const handleSave = useCallback(async () => {
    const validation = validateOfficeForm(form);
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaveError(null);
    setSaving(true);
    try {
      if (!isEdit) {
        await officesService.create(buildCreateRequest(form, pinAddress));
      } else if (detail) {
        const patch = buildUpdatePatch(form, detail, pinAddress);
        if (Object.keys(patch).length > 0) {
          await officesService.update(officeId as string, patch);
        }
      } else {
        // Edit mode with no loaded detail (the non-404 load-error path):
        // there is nothing to diff the PATCH against — fail loud instead of
        // a silent no-op that reads as a successful save.
        setSaveError('This office could not be loaded. Check your connection and try again.');
        return;
      }
      leaveGuard.allowLeave();
      navigation.goBack();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'ATTENDANCE_OFFICE_NAME_TAKEN') {
        setErrors((prev) => ({
          ...prev,
          name: 'That name is already used by another office',
        }));
      } else {
        setSaveError(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, pinAddress, isEdit, detail, officeId, navigation, leaveGuard.allowLeave]);

  const handleArchive = useCallback(() => {
    if (!officeId) return;
    setArchiveConfirmOpen(true);
  }, [officeId]);

  const confirmArchive = useCallback(() => {
    setArchiveConfirmOpen(false);
    setArchiving(true);
    setArchiveError(null);
    // The dialog names the SAVED office (detail), not the unsaved form
    // value — renaming without saving must not show the new name while
    // archiving the old one.
    officesService
      .archive(officeId as string)
      .then(() => {
        leaveGuard.allowLeave();
        navigation.goBack();
      })
      .catch((err: ApiError) => {
        if (err.code === 'ATTENDANCE_OFFICE_ARCHIVE_BLOCKED') {
          const blockers =
            (err.details as { blockers?: unknown[] } | undefined)?.blockers ?? [];
          // A missing/empty blockers array still means "blocked" —
          // never render the nonsense "0 employees are still assigned".
          setArchiveError(
            blockers.length === 0
              ? 'Employees are still assigned here — reassign them first'
              : `${blockers.length} employee${blockers.length === 1 ? ' is' : 's are'} still assigned here — reassign them first`,
          );
        } else {
          setArchiveError(err.message);
        }
      })
      .finally(() => setArchiving(false));
  }, [officeId, navigation, leaveGuard.allowLeave]);

  if (notFound) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Office" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <InlineError message="This office is no longer available. It may have been archived." />
          <Button variant="secondary" onPress={() => navigation.goBack()}>
            Back to offices
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={isEdit ? 'Edit office' : 'Add office'}
        onBack={() => navigation.goBack()}
        right={
          isEdit ? (
            // Not a job state — the DS 'done' green is its positive/active
            // colour; the job-state 'progress' variant is a different token.
            <Badge status="done" dot>
              Active
            </Badge>
          ) : undefined
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        // Pad on BOTH platforms: Android 15+ enforces edge-to-edge, so the
        // manifest's adjustResize never resizes the window and the keyboard
        // would cover the lower fields (Late after, Full/Half-day hours).
        behavior="padding">
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {loadError ? <InlineError message={loadError} /> : null}
          <Input
            label="Office name"
            value={form.name}
            onChangeText={(text) => onChange({ name: text })}
            placeholder="e.g. Andheri branch"
            error={errors.name}
            maxLength={80}
            autoCorrect={false}
            required
            leadingIcon={<Building2 size={18} color={colors.textMuted} strokeWidth={2} />}
          />

          <OfficeLocationCard
            form={form}
            errors={errors}
            gpsVerified={gpsVerified}
            address={pinAddress}
            onOpenPicker={() =>
              navigation.navigate('MapPinPicker', {
                mode: 'office',
                initialLatitude: form.latitude ?? undefined,
                initialLongitude: form.longitude ?? undefined,
                radiusM: form.radiusM,
              })
            }
          />

          <OfficeRuleFields
            state={form}
            errors={errors}
            onChange={onChange}
            onFieldFocus={onFieldFocus}
            isEdit={isEdit}
          />

          {saveError ? <InlineError message={saveError} /> : null}
          <Button
            fullWidth
            loading={saving}
            leadingIcon={
              saving ? undefined : <Check size={18} color={colors.textOnColor} strokeWidth={2.5} />
            }
            onPress={() => void handleSave()}>
            {isEdit ? 'Save changes' : 'Create office'}
          </Button>

          {isEdit ? (
            <View style={styles.dangerBlock}>
              {archiveError ? <InlineError message={archiveError} /> : null}
              <Button
                variant="ghost"
                fullWidth
                loading={archiving}
                labelColor={colors.danger}
                leadingIcon={
                  archiving ? undefined : <Archive size={16} color={colors.danger} strokeWidth={2} />
                }
                onPress={handleArchive}>
                Archive office
              </Button>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={archiveConfirmOpen}
        title="Archive office"
        message={
          <Text>
            <Text style={styles.messageStrong}>{detail?.name ?? form.name.trim()}</Text>{' '}
            will stop tracking attendance and cannot be restored. It can only be archived once no employees are assigned to it.
          </Text>
        }
        confirmLabel="Archive office"
        confirmVariant="danger"
        icon={<Archive size={20} color={colors.danger} strokeWidth={2} />}
        cancelLabel="Cancel"
        submitting={archiving}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveConfirmOpen(false)}
      />

      <ConfirmDialog
        visible={leaveGuard.askOpen}
        title="Discard changes?"
        message="Your changes to this office haven't been saved."
        confirmLabel="Discard"
        confirmVariant="danger"
        cancelLabel="Keep editing"
        onConfirm={leaveGuard.discard}
        onCancel={leaveGuard.keepEditing}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  dangerBlock: {
    gap: spacing.s2,
  },
  messageStrong: {
    ...typography.heading,
    fontSize: 15,
    color: colors.textStrong,
  },
});
