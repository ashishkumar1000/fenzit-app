/**
 * ProfileScreen — the technician's "Profile" tab (the 2026-11 redesign,
 * scrollable): an identity card (avatar with the change-photo pencil badge,
 * name with the Edit-name pencil, account-status pill, phone) and the "My
 * jobs" summary card (Epic 22 — `GET /job-reports/employee`), then the
 * grouped action rows. Notifications live behind the Today header bell
 * (Story 14-3) rather than a row here.
 *
 * Name and phone come from `GET /users/me` via `useMyProfile`, not from the
 * auth session — the session holds gating fields only. Two pencil
 * affordances, one per edit target: the badge on the avatar changes the
 * photo (the owner's Edit-profile picker and upload); the pencil after the
 * name opens the shared `EditNameSheet` (story 5.2's affordance), whose
 * save updates this screen instantly via the shared profile store.
 *
 * The legal rows and the Delete account row (2026-11) are the technician
 * surface of the Play User Data policy path — the policy must be reachable
 * in-app and deletion must be startable in-app for EVERY role, so this
 * screen mirrors the More tab rows through the same shared components
 * (`openWebPage`, `DeleteAccountConfirm` — the employee role gets the
 * personal-data consequences copy).
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LogOut,
  Pencil,
  Phone,
  ScrollText,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { Avatar, Card, ConfirmDialog, InlineError } from '../../components/ui';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../../config';
import { colors, radius, spacing, typography } from '../../theme';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { openWebPage } from '../../utils/linking';
import { useAuth } from '../auth';
import { EditNameSheet, formatPhone, useMyProfile } from '../profile';
import { DeleteAccountConfirm } from '../more/components/DeleteAccountConfirm';
import { useAvatarUpload } from '../editProfile/useAvatarUpload';
import MyJobsSummaryCard from './components/MyJobsSummaryCard';
import { ProfileActionRow } from './components/ProfileActionRow';

/** The account-status pill's words and pairing. A server that omits the
 *  field (an older backend) reads as active — the common case. */
function statusPill(status: string | undefined): { label: string; danger: boolean } {
  const s = status ?? 'active';
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return { label, danger: s !== 'active' };
}

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
  const pill = statusPill(profile.status);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Identity card. Two pencil affordances, one per target: the badge
            on the avatar changes the photo (spinner while the upload runs);
            the pencil after the name opens the Edit-name sheet. No chevron —
            no profile-detail screen exists for it to open. */}
        <Card padding="md">
          <View style={styles.identityRow}>
            <View>
              <Avatar name={name ?? undefined} uri={profile.avatarUrl ?? null} size="xl" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={profile.avatarUrl ? 'Change photo' : 'Add photo'}
                accessibilityState={{ busy: photo.busy }}
                onPress={photo.changePhoto}
                disabled={photo.busy}
                // 28px visual, 44px target — it overlaps the avatar edge, so
                // the slack goes where the finger lands (below-right).
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
                style={({ pressed }) => [styles.pencilBadge, pressed && styles.pencilPressed]}>
                {photo.busy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Pencil size={13} color={colors.textStrong} strokeWidth={2} />
                )}
              </Pressable>
            </View>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit name"
                  onPress={() => setEditNameOpen(true)}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 14 }}
                  style={({ pressed }) => [pressed && styles.pencilPressed]}>
                  <Pencil size={16} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              </View>
              <View
                style={[
                  styles.statusPill,
                  pill.danger ? styles.statusPillDanger : null,
                ]}>
                <View
                  style={[
                    styles.statusDot,
                    pill.danger ? styles.statusDotDanger : null,
                  ]}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    pill.danger ? styles.statusPillTextDanger : null,
                  ]}>
                  {pill.label}
                </Text>
              </View>
              {phone ? (
                <View style={styles.phoneRow}>
                  <Phone size={16} color={colors.textMuted} strokeWidth={2} />
                  <Text style={styles.phoneText}>{phone}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {photo.error ? (
            <View style={styles.photoError}>
              <InlineError message={photo.error} />
            </View>
          ) : null}
        </Card>

        {/* Epic 22 — the employee's own job numbers (created / approved /
            rejected / pending, approval rate, rejections) from
            GET /job-reports/employee. Sits above the account rows so the
            record is the first thing under the identity card. */}
        <MyJobsSummaryCard />

        {/* Play User Data policy — the privacy policy must be reachable
            inside the app from every role's settings surface, not only the
            owner's More tab. Both rows open fenzit.com in the browser. */}
        <Card padding="none" style={styles.group}>
          <ProfileActionRow
            icon={<ShieldCheck size={18} color={colors.textMuted} strokeWidth={2} />}
            label="Privacy policy"
            onPress={() => void openWebPage(PRIVACY_POLICY_URL)}
          />
          <View style={styles.divider} />
          <ProfileActionRow
            icon={<ScrollText size={18} color={colors.textMuted} strokeWidth={2} />}
            label="Terms of service"
            onPress={() => void openWebPage(TERMS_URL)}
          />
        </Card>

        {/* The Play-mandated in-app deletion path: the dialog names the
            consequences per role — for a technician, the personal-data
            copy — and consent signs the person out. */}
        <Card padding="none" style={styles.group}>
          <ProfileActionRow
            icon={<Trash2 size={18} color={colors.danger} strokeWidth={2} />}
            label="Delete account"
            danger
            onPress={() => setDeleteOpen(true)}
          />
          <View style={styles.divider} />
          <ProfileActionRow
            icon={<LogOut size={18} color={colors.danger} strokeWidth={2} />}
            label="Log out"
            danger
            onPress={handleLogOut}
          />
        </Card>
      </ScrollView>

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
  content: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s6,
    gap: spacing.s3,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
  },
  identityText: {
    flex: 1,
    gap: spacing.s1,
  },
  pencilBadge: {
    position: 'absolute',
    left: -4,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilPressed: {
    opacity: 0.7,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    ...typography.title,
    fontSize: 20,
    color: colors.textStrong,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    backgroundColor: colors.status.done.bg,
    borderWidth: 1,
    borderColor: colors.status.done.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  statusPillDanger: {
    backgroundColor: colors.status.neutral.bg,
    borderColor: colors.status.neutral.border,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.status.done.solid,
  },
  statusDotDanger: {
    backgroundColor: colors.status.neutral.solid,
  },
  statusPillText: {
    ...typography.caption,
    color: colors.status.done.fg,
    fontWeight: '600',
  },
  statusPillTextDanger: {
    color: colors.textMuted,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  phoneText: {
    ...typography.body,
    color: colors.textMuted,
  },
  group: {
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  photoError: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
});
