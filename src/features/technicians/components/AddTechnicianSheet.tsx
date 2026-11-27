/**
 * AddTechnicianSheet — bottom-sheet form to invite a technician (name +
 * phone, optional skills). Uses the DS `Sheet` (native TrueSheet): the OS handles
 * the keyboard, drag-to-dismiss, and safe areas.
 *
 * The skill list comes from the shared `useSkills` store (loaded on sheet
 * open), NOT a private fetch — the Skills screen and this picker must show
 * the same rows, so a skill added there is selectable here immediately.
 *
 * Local form state (and the submit loading/error state) lives here since
 * it's tied directly to this form's own UX — but persistence itself stays
 * with the parent: `onSubmit` does the actual API call and this sheet only
 * reacts to whether that promise resolves or rejects (close + reset vs.
 * show the error and stay open).
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInputInstance,
} from 'react-native';
import { ChevronRight, Phone, User } from 'lucide-react-native';
import { pickContact } from 'react-native-pick-contact';
import { Button, Input, MultiSelect, PickContactButton, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { membersService } from '../../../services';
import type { ApiError, CompanyMember } from '../../../services';
import { loadSkills, useSkills } from '../../skills';
import { DIAL_CODE, PHONE_LENGTH } from '../constants';
import { toLocalMobile } from '../pickedPhone';
import type { NewTechnicianInput } from '../types';
import { ManagerPickerStage } from './ManagerPickerStage';

/** API caps `skillIds` at 20 per invite — enforced client-side too so the multi-select can't collect a selection the backend will just reject. */
const MAX_SKILLS = 20;

const PHONE_HELPER = 'Type the number, or pick it from your contacts.';
const NOT_MOBILE_COPY = "This number isn't a 10-digit mobile number. Type the number instead.";
const PICK_FAILED_COPY = "Couldn't open your contacts. Type the number instead.";
const FROM_CONTACTS_COPY = 'From your contacts. Change it if needed.';
const SENDING_LOCK_COPY = "You can't change the number while the invite is sent.";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Performs the actual invite API call. Rejects with `ApiError` on failure. */
  onSubmit: (input: NewTechnicianInput) => Promise<void>;
};

/** Turns a failed `invite` call into copy this sheet can show directly. */
function inviteErrorMessage(err: ApiError): string {
  if (err.code === 'ALREADY_IN_TEAM') {
    return 'This person is already in your team.';
  }
  if (err.code === 'DUPLICATE_RESOURCE') {
    return 'This number already belongs to a company.';
  }
  if (err.code === 'PLATFORM_STAFF_NOT_MEMBER') {
    return 'This number belongs to Fenzit staff and cannot join a company.';
  }
  if (err.code === 'VALIDATION_ERROR') {
    return 'Check the phone number and skills — one of them looks invalid.';
  }
  if (err.status === 403) {
    return "You don't have permission to invite employees.";
  }
  // Epic 24 — a refused "Reports to" (the manager assignment is validated in
  // the invite transaction, so the refusal cancels the invite itself). The
  // server's plain-English line is the truth here; the fixed transport line
  // would invite the owner to retry a permanent refusal.
  if (
    err.code === 'MANAGER_NOT_ACTIVE' ||
    err.code === 'MEMBER_IS_ADMIN' ||
    err.code === 'HIERARCHY_CYCLE' ||
    err.code === 'HIERARCHY_DEPTH' ||
    err.code === 'RESOURCE_NOT_FOUND'
  ) {
    // The manager assignment is validated inside the invite transaction, so
    // a refusal cancels the whole invite — say that, never imply a retry
    // sent nothing. Give the server line its full stop when it arrived
    // without one (the ownerLeaveModel precedent).
    const line = (err.message || 'The reporting manager could not be set.').trim();
    return `${/[.!?…]$/.test(line) ? line : `${line}.`} No invite was sent.`;
  }
  return 'Could not send the invite. Try again.';
}

export function AddTechnicianSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);

  // Epic 24 — the optional "Reports to". The directory is fetched when the
  // picker first opens (not on every sheet mount); the chosen member's id
  // rides the invite POST, and an absent choice omits the key.
  const [stage, setStage] = useState<'form' | 'manager'>('form');
  const [manager, setManager] = useState<CompanyMember | null>(null);
  const [pickedManager, setPickedManager] = useState<CompanyMember | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersLoaded, setMembersLoaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  // Same-frame double-tap guard: `submitting` (and the Button's disabled)
  // only take effect after the state commit, so two taps in the same frame
  // would both pass `canSubmit` and fire two invite POSTs. A ref reads
  // synchronously (same pattern as EditNameSheet).
  const inFlightRef = useRef(false);
  const [submitError, setSubmitError] = useState('');

  // Phone-book picker state. `pickingRef` is the same-frame double-tap guard
  // (as with `inFlightRef`), so two taps cannot open two pickers.
  const [pickError, setPickError] = useState('');
  const [nameFromPick, setNameFromPick] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const phoneRef = useRef<TextInputInstance>(null);

  // Shared skill store — the same rows the Skills screen manages. `autoLoad:
  // false` because this sheet stays mounted while hidden — without it,
  // rendering TechniciansScreen would fire the GET on the hook's first-mount
  // effect. The open effect below loads on sheet open instead (force: false
  // — the store dedupes in-flight requests and throttles repeats), so the
  // multi-select offers skills that exist right now; it doesn't create new
  // ones.
  const { skills, isLoading: loadingSkills, error: skillsError } =
    useSkills({ autoLoad: false });

  useEffect(() => {
    if (!visible) return;
    void loadSkills();
  }, [visible]);

  const canSubmit =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    skillIds.length <= MAX_SKILLS &&
    !submitting;

  const reset = () => {
    setName('');
    setPhone('');
    setSkillIds([]);
    setSubmitError('');
    setPickError('');
    setNameFromPick(false);
    setStage('form');
    setManager(null);
    setPickedManager(null);
    setMembersLoaded(false);
    setMembers([]);
    setMembersError(null);
  };

  const loadMembers = () => {
    setMembersLoading(true);
    setMembersError(null);
    membersService
      .listMembers()
      .then(rows => {
        setMembers(rows);
        setMembersLoaded(true);
      })
      .catch((err: ApiError) => {
        setMembersError(err?.message || "Couldn't load your team.");
      })
      .finally(() => setMembersLoading(false));
  };

  const openManagerPicker = () => {
    if (submitting) return;
    setPickedManager(manager);
    setStage('manager');
    if (!membersLoaded && !membersLoading) loadMembers();
  };

  const handleClose = () => {
    // Don't let a backdrop tap or the Android back button dismiss the sheet
    // mid-request: the invite call is already in flight and can't be
    // cancelled, and closing now would let its eventual `catch` write
    // `submitError` into a sheet the user no longer sees, surfacing as a
    // stale error banner the next time they open it.
    if (submitting) return;
    reset();
    onClose();
  };

  // Every field edit clears a stale server error, so the reason Send invite is
  // off shows again once the owner starts fixing the form.
  // Counts edits. An invite that fails after the owner has changed the form
  // must not show its error, since the error describes the old form.
  const editCount = useRef(0);
  const markEdited = () => {
    editCount.current += 1;
    setSubmitError('');
  };

  const handleNameChange = (text: string) => {
    markEdited();
    setNameFromPick(false);
    setName(text);
  };

  const handlePhoneChange = (text: string) => {
    markEdited();
    setPickError('');
    setPhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH));
  };

  const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

  // Opens the phone's own contacts screen. The library asks for no permission
  // and returns only the contact the owner taps. A cancel changes nothing. A
  // number that is not a 10-digit mobile leaves the form as it was.
  const handlePickContact = async () => {
    if (pickingRef.current || submitting) return;
    pickingRef.current = true;
    setPicking(true);
    setPickError('');
    try {
      const contact = await pickContact();
      if (!contact) return;
      const local = toLocalMobile(contact.phone);
      if (local === null) {
        setPickError(NOT_MOBILE_COPY);
        announce(NOT_MOBILE_COPY);
        return;
      }
      markEdited();
      const pickedName = contact.name.trim();
      if (pickedName) {
        setName(pickedName);
        setNameFromPick(true);
      }
      setPhone(local);
      announce('Filled in from your contacts.');
    } catch {
      setPickError(PICK_FAILED_COPY);
      announce(PICK_FAILED_COPY);
    } finally {
      pickingRef.current = false;
      setPicking(false);
      phoneRef.current?.focus();
    }
  };

  const handleSkillsChange = (ids: string[]) => {
    markEdited();
    setSkillIds(ids);
  };

  const handleSubmit = async () => {
    if (!canSubmit || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    const editsAtSubmit = editCount.current;
    try {
      await onSubmit({
        name: name.trim(),
        phone,
        skillIds,
        ...(manager ? { managerId: manager.userId } : {}),
      });
      reset();
      onClose();
    } catch (err) {
      if (editCount.current === editsAtSubmit) {
        setSubmitError(inviteErrorMessage(err as ApiError));
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const skillOptions = skills.map(s => ({ value: s.id, label: s.name, pinned: s.is_fallback === true }));
  const skillsHelper =
    skillsError ||
    (!loadingSkills && skills.length === 0
      ? "Skills aren't available right now. You can still send the invite."
      : skillIds.length >= MAX_SKILLS
        ? `Maximum ${MAX_SKILLS} skills per employee.`
        : 'Optional. Skills decide which jobs they are matched to.');

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      dismissible={!submitting && stage === 'form'}
      title={stage === 'manager' ? 'Reports to' : 'Add employee'}
      subtitle={
        stage === 'manager'
          ? 'Who this person reports to'
          : "They'll get an SMS invite to download the Fenzit app and come online."
      }>
      {stage === 'manager' ? (
        <ManagerPickerStage
          members={members}
          loading={membersLoading}
          loadError={membersError}
          onRetry={loadMembers}
          memberId={null}
          selected={pickedManager}
          onSelect={setPickedManager}
          saving={false}
          saveError={null}
          onSave={() => {
            setManager(pickedManager);
            setStage('form');
          }}
          onCancel={() => setStage('form')}
        />
      ) : (
        <>
      <View style={styles.form}>
        <Input
          label="Name"
          floatingLabel
          helper={nameFromPick ? FROM_CONTACTS_COPY : ''}
          value={name}
          onChangeText={handleNameChange}
          placeholder="e.g. Suresh Kumar"
          autoCapitalize="words"
          leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
          clearable
        />
        <Input
          ref={phoneRef}
          label="Phone number"
          floatingLabel
          helper={PHONE_HELPER}
          error={pickError}
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
          trailingAdornment={
            <PickContactButton onPress={handlePickContact} disabled={submitting || picking} />
          }
        />
        {submitting ? <Text style={styles.lockCaption}>{SENDING_LOCK_COPY}</Text> : null}
        <MultiSelect
          label="Skills (optional)"
          value={skillIds}
          onChange={handleSkillsChange}
          options={skillOptions}
          placeholder={loadingSkills ? 'Loading skills…' : 'Choose skills'}
          helper={skillsHelper}
          disabled={loadingSkills || skills.length === 0}
          searchable
        />

        {/* Epic 24 — optional "Reports to". Opens the picker as a stage in
            this same sheet; the chosen id rides the invite POST only when
            set. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reports to ${manager?.name ?? 'not set'}`}
          onPress={openManagerPicker}
          style={({ pressed }) => [styles.managerRow, pressed ? styles.managerRowPressed : null]}>
          <View style={styles.managerTexts}>
            <Text style={styles.managerLabel}>Reports to</Text>
            <Text style={styles.managerValue} numberOfLines={1}>
              {manager?.name?.trim() || 'Not set'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <Text style={styles.managerHelper}>Optional. You can change this later.</Text>
      </View>

      {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        onPress={handleSubmit}>
        {submitting ? 'Sending…' : 'Send invite'}
      </Button>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.s4,
  },
  dialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dial: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '700',
  },
  lockCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
    marginTop: -spacing.s2,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: spacing.s3,
    backgroundColor: colors.surfaceCard,
  },
  managerRowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  managerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  managerLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  managerValue: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  managerHelper: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.s2,
  },
});
