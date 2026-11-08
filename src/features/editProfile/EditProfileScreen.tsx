/**
 * EditProfileScreen — the owner's "Edit profile" page, opened from the More
 * tab's account card. Holds the person's name and photo (everyone can change
 * their own), and the company's GST number and business types (owner only).
 *
 * Saving sends only what changed: `PATCH /users/me` for the name, then
 * `PATCH /company` for the company details. A photo saves as soon as it is
 * picked, since it has its own upload step.
 */
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { Button, Card, IconButton, Input, InlineError } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { companyApi, usersApi, type ApiError, type MyProfile } from '../../services';
import { currentResetEpoch } from '../../services/resetRegistry';
import { loadMyProfile, setProfileFromServer, useMyProfile } from '../profile';
import { useCanWrite } from '../auth';
import { CompanyDetailsFields } from './components/CompanyDetailsFields';
import { ProfilePhotoField } from './components/ProfilePhotoField';
import { SelfieCamera } from './components/SelfieCamera';
import { useAvatarUpload } from './useAvatarUpload';
import { useBusinessTypeOptions } from './useBusinessTypeOptions';
import {
  buildCompanyPatch,
  businessTypesError,
  gstinError,
  nameError,
  sameCodes,
} from './profileDraft';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;

/** A server message (422, 403) is shown as-is; anything else gets plain copy. */
function saveErrorMessage(err: unknown): string {
  const apiError = err as Partial<ApiError> | null;
  if (apiError?.status === 403) return 'Only the company owner can change these details.';
  if (apiError?.status === 422 && apiError.message) return apiError.message;
  return 'Could not save. Check your connection and try again.';
}

export function EditProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const { profile, error } = useMyProfile();
  const canEdit = useCanWrite();
  const goBack = () => navigation.goBack();

  if (!profile) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={goBack} />
        <View style={styles.center}>
          {error ? (
            <>
              <InlineError message={error} />
              <Button variant="secondary" size="md" onPress={() => void loadMyProfile({ force: true })}>
                Try again
              </Button>
            </>
          ) : (
            <ActivityIndicator size="large" color={colors.textMuted} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return <EditProfileForm profile={profile} canEdit={canEdit} onDone={goBack} />;
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton label="Back" size="md" onPress={onBack}>
        <ArrowLeft size={22} color={colors.textStrong} strokeWidth={2} />
      </IconButton>
      <Text style={styles.title}>Edit profile</Text>
    </View>
  );
}

type FormProps = { profile: MyProfile; canEdit: boolean; onDone: () => void };

function EditProfileForm({ profile, canEdit, onDone }: FormProps) {
  // The saved values are read from the store every render, so after a save
  // the store's new values become the baseline and nothing reads as changed.
  const savedName = profile.name ?? '';
  const savedGstin = profile.tenant.gstin;
  const savedTypes = profile.tenant.businessTypes ?? [];
  const savedCodes = savedTypes.map((t) => t.code);

  const [name, setName] = useState(savedName);
  const [gstin, setGstin] = useState(savedGstin ?? '');
  const [codes, setCodes] = useState<string[]>(savedCodes);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const photo = useAvatarUpload();
  const options = useBusinessTypeOptions();

  const nameChanged = name.trim() !== savedName;
  const nameErr = nameChanged ? nameError(name) : null;

  // Company fields are only sent (and only validated) by the owner.
  const companyPatch = canEdit
    ? buildCompanyPatch({ savedGstin, draftGstin: gstin, savedCodes, draftCodes: codes })
    : null;
  const typesChanged = canEdit && !sameCodes(savedCodes, codes);
  const gstErr = canEdit ? gstinError(gstin) : null;
  const typesErr = typesChanged ? businessTypesError(codes) : null;

  const dirty = nameChanged || companyPatch !== null;
  const hasErrors = nameErr !== null || gstErr !== null || typesErr !== null;
  const canSave = dirty && !hasErrors && !saving;
  const saveHint = saving
    ? null
    : !dirty
      ? 'Change something to save'
      : hasErrors
        ? 'Fix the highlighted fields to save'
        : null;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    const epochAtStart = currentResetEpoch();
    let nameSaved = false;
    try {
      if (nameChanged) {
        const next = await usersApi.updateMe({ name: name.trim() });
        if (currentResetEpoch() !== epochAtStart) return;
        setProfileFromServer(next);
        nameSaved = true;
      }
      if (companyPatch) {
        await companyApi.updateCompany(companyPatch);
        if (currentResetEpoch() !== epochAtStart) return;
        // The save already went through: a failed refresh must not read as
        // "Could not save" (the user would resubmit). The next profile load
        // catches the screen up.
        try {
          await loadMyProfile({ force: true });
        } catch {
          // Intentionally ignored — see above.
        }
      }
      onDone();
    } catch (err) {
      const message = saveErrorMessage(err);
      setSaveError(
        nameSaved ? `Your name was saved, but the company details were not. ${message}` : message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={onDone} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Card padding="none" style={styles.section}>
          <View style={styles.sectionBody}>
            <Text style={styles.sectionTitle}>About you</Text>
            <ProfilePhotoField
              name={profile.name}
              uri={profile.avatarUrl ?? null}
              busy={photo.busy}
              error={photo.error}
              onChangePhoto={photo.changePhoto}
            />
            <Input
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ravi Kumar"
              autoCapitalize="words"
              error={nameErr ?? undefined}
            />
          </View>
        </Card>

        <Card padding="none" style={styles.section}>
          <View style={styles.sectionBody}>
            <Text style={styles.sectionTitle}>Company</Text>
            <CompanyDetailsFields
              canEdit={canEdit}
              gstin={gstin}
              onChangeGstin={setGstin}
              gstinError={gstErr}
              selectedCodes={codes}
              onChangeCodes={setCodes}
              typesError={typesErr}
              savedTypes={savedTypes}
              options={options}
            />
          </View>
        </Card>

        {saveError ? <InlineError message={saveError} /> : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSave}
          loading={saving}
          onPress={() => void save()}>
          Save changes
        </Button>
        {saveHint ? <Text style={styles.hint}>{saveHint}</Text> : null}
      </ScrollView>
      <SelfieCamera
        visible={photo.cameraOpen}
        onClose={photo.closeCamera}
        onCaptured={photo.onCaptured}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s6,
    gap: spacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
    paddingBottom: spacing.s10,
  },
  section: {
    backgroundColor: colors.surfaceCard,
  },
  sectionBody: {
    padding: spacing.s5,
    gap: spacing.s5,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
