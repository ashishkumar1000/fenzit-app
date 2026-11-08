/**
 * ProfileScreen — the technician's "Profile" tab. First cut is deliberately
 * just identity + Log out: no Jobs done / Rating stat cards (no backend to
 * compute them yet). Notifications live behind the Today header bell
 * (Story 14-3) rather than a row here. Add the stat cards back once the
 * profile API exists — the API contract for it isn't available yet.
 *
 * Name and phone come from `GET /users/me` via `useMyProfile`, not from the
 * auth session — the session holds gating fields only.
 *
 * The name carries the same "Edit name" pencil affordance as the admin's
 * More tab account card (story 5.2): both open the shared `EditNameSheet`,
 * whose successful save updates this screen instantly via the shared
 * profile store.
 *
 * The legal rows and the Delete account row (2026-11) are the technician
 * surface of the Play User Data policy path — the policy must be reachable
 * in-app and deletion must be startable in-app for EVERY role, so this
 * screen mirrors the More tab rows through the same shared components
 * (`openWebPage`, `DeleteAccountConfirm` — the employee role gets the
 * personal-data consequences copy).
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, LogOut, Pencil, Phone, ScrollText, ShieldCheck, Trash2 } from 'lucide-react-native';
import { Avatar, Card, ConfirmDialog, IconButton, InlineError } from '../../components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../../config';
import { colors, spacing, typography } from '../../theme';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { openWebPage } from '../../utils/linking';
import { useAuth } from '../auth';
import { EditNameSheet, formatPhone, formatRole, useMyProfile } from '../profile';
import { DeleteAccountConfirm } from '../more/components/DeleteAccountConfirm';
import { useAvatarUpload } from '../editProfile/useAvatarUpload';
import { SelfieCamera } from '../editProfile/components/SelfieCamera';

export default function ProfileScreen() {
  const { reset } = useAuth();
  const { profile, isLoading } = useMyProfile();
  const [editNameOpen, setEditNameOpen] = useState(false);
  // The technician's own photo: same picker, upload and store update as the
  // owner's Edit profile page.
  const photo = useAvatarUpload();
  // Log out asks through the shared ConfirmDialog instead of a system Alert
  // (the 20-1 modal ask) — same wording, in-app styling.
  const [logOutOpen, setLogOutOpen] = useState(false);
  // Delete account raises its own role-specific guard (the Play-mandated
  // in-app deletion path) before it files the reviewed deletion request.
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleLogOut = () => setLogOutOpen(true);

  // Shared by manual logout and post-deletion sign-out: the registry owns
  // the store list (technician jobs included), and the token must go too —
  // a manual logout used to leave the JWT attached.
  const signOutNow = useCallback(() => {
    clearAuthToken();
    runAllResets();
    reset();
  }, [reset]);

  const confirmLogOut = () => {
    setLogOutOpen(false);
    signOutNow();
  };

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={styles.loadingRoot} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const name = profile.name;
  const phone = formatPhone(profile);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Avatar name={name ?? undefined} uri={profile.avatarUrl ?? null} size="xl" />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <IconButton
            label="Edit name"
            size="md"
            onPress={() => setEditNameOpen(true)}>
            <Pencil size={18} color={colors.textMuted} strokeWidth={2} />
          </IconButton>
        </View>
        <Text style={styles.role}>{formatRole(profile.role)}</Text>
      </View>

      <EditNameSheet
        visible={editNameOpen}
        currentName={profile.name}
        onClose={() => setEditNameOpen(false)}
      />

      <ConfirmDialog
        visible={logOutOpen}
        title="Log out"
        message="You will need to verify your number again to sign back in."
        confirmLabel="Log out"
        confirmVariant="danger"
        icon={<LogOut size={20} color={colors.danger} strokeWidth={2} />}
        cancelLabel="Cancel"
        onConfirm={confirmLogOut}
        onCancel={() => setLogOutOpen(false)}
      />

      <DeleteAccountConfirm
        visible={deleteOpen}
        role={profile.role}
        onRequestFiled={signOutNow}
        onClose={() => setDeleteOpen(false)}
      />

      <View style={styles.content}>
        <Card padding="none" style={styles.card}>
          {phone ? (
            <>
              <View style={styles.row}>
                <Phone size={18} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.rowText}>{phone}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={photo.changePhoto}
            disabled={photo.busy}
            accessibilityRole="button"
            accessibilityState={{ busy: photo.busy, disabled: photo.busy }}
            accessibilityLabel={profile.avatarUrl ? 'Change photo' : 'Add photo'}
            style={styles.actionRow}>
            <Camera size={18} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.actionText}>
              {profile.avatarUrl ? 'Change photo' : 'Add photo'}
            </Text>
            {photo.busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </Card>
          {photo.error ? (
            <View style={styles.photoError}>
              <InlineError message={photo.error} />
            </View>
          ) : null}
          <View style={styles.divider} />

          {/* Play User Data policy — the privacy policy must be reachable
              inside the app from every role's settings surface, not only the
              owner's More tab. Both rows open fenzit.com in the browser. */}
          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={() => void openWebPage(PRIVACY_POLICY_URL)}
            style={styles.actionRow}>
            <ShieldCheck size={18} color={colors.status.done.solid} strokeWidth={2} />
            <Text style={styles.actionText}>Privacy policy</Text>
          </Card>
          <View style={styles.divider} />

          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={() => void openWebPage(TERMS_URL)}
            style={styles.actionRow}>
            <ScrollText size={18} color={colors.status.progress.solid} strokeWidth={2} />
            <Text style={styles.actionText}>Terms of service</Text>
          </Card>
          <View style={styles.divider} />

          {/* The Play-mandated in-app deletion path: the dialog names the
              consequences per role — for a technician, the personal-data
              copy — and consent signs the person out. */}
          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={() => setDeleteOpen(true)}
            style={styles.logoutRow}>
            <Trash2 size={18} color={colors.danger} strokeWidth={2} />
            <Text style={styles.logoutText}>Delete account</Text>
          </Card>
          <View style={styles.divider} />

          <Card
            padding="md"
            interactive
            elevated={false}
            onPress={handleLogOut}
            style={styles.logoutRow}>
            <LogOut size={18} color={colors.danger} strokeWidth={2} />
            <Text style={styles.logoutText}>Log out</Text>
          </Card>
        </Card>
      </View>
      <SelfieCamera
        visible={photo.cameraOpen}
        onClose={photo.closeCamera}
        onCaptured={photo.onCaptured}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.surfacePage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.s6,
    paddingBottom: spacing.s5,
    gap: spacing.s2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  name: {
    ...typography.title,
    fontSize: 20,
    color: colors.textStrong,
  },
  role: {
    ...typography.body,
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: spacing.s4,
  },
  card: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  rowText: {
    ...typography.body,
    color: colors.textStrong,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: 0,
  },
  logoutText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: 0,
  },
  photoError: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  actionText: {
    ...typography.body,
    color: colors.textStrong,
  },
});
