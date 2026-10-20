/**
 * AddTechnicianSheet — bottom-sheet form to invite a technician (name +
 * phone + skills). Uses the DS `Sheet` (native TrueSheet): the OS handles
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
import { StyleSheet, Text, View } from 'react-native';
import { Phone, User } from 'lucide-react-native';
import { Button, Input, MultiSelect, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiError } from '../../../services';
import { loadSkills, useSkills } from '../../skills';
import { DIAL_CODE, PHONE_LENGTH } from '../constants';
import type { NewTechnicianInput } from '../types';

/** API caps `skillIds` at 20 per invite — enforced client-side too so the multi-select can't collect a selection the backend will just reject. */
const MAX_SKILLS = 20;

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
    return "You don't have permission to invite technicians.";
  }
  return err.message;
}

export function AddTechnicianSheet({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  // Same-frame double-tap guard: `submitting` (and the Button's disabled)
  // only take effect after the state commit, so two taps in the same frame
  // would both pass `canSubmit` and fire two invite POSTs. A ref reads
  // synchronously (same pattern as EditNameSheet).
  const inFlightRef = useRef(false);
  const [submitError, setSubmitError] = useState('');

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
    skillIds.length > 0 &&
    skillIds.length <= MAX_SKILLS &&
    !submitting;

  // Why Send invite is greyed out, in the order the fields sit on screen.
  const missingHint = (() => {
    if (submitting || canSubmit) return null;
    if (name.trim().length === 0) return "Enter the person's name to continue";
    if (phone.length !== PHONE_LENGTH) return 'Enter a 10-digit phone number to continue';
    return 'Pick at least one skill to continue';
  })();

  const reset = () => {
    setName('');
    setPhone('');
    setSkillIds([]);
    setSubmitError('');
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
    setName(text);
  };

  const handlePhoneChange = (text: string) => {
    markEdited();
    setPhone(text.replace(/[^0-9]/g, '').slice(0, PHONE_LENGTH));
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
      await onSubmit({ name: name.trim(), phone, skillIds });
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

  const skillOptions = skills.map(s => ({ value: s.id, label: s.name }));
  const skillsHelper =
    skillsError ||
    (!loadingSkills && skills.length === 0
      ? 'No skills set up yet — add one from the Skills screen (More tab).'
      : skillIds.length >= MAX_SKILLS
        ? `Maximum ${MAX_SKILLS} skills per technician.`
        : '');

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      // While the invite POST is in flight, drag-down and Android back are
      // blocked at the native level — `handleClose`'s veto alone fires too
      // late (the native sheet has already dismissed, leaving the parent
      // stuck). A mid-flight dismissal would also skip the reset, so a
      // reopen would show stale form values.
      dismissible={!submitting}
      title="Add technician"
      subtitle="They'll get an SMS invite to download the Fenzit app and come online.">
      <View style={styles.form}>
        <Input
          label="Name"
          value={name}
          onChangeText={handleNameChange}
          placeholder="e.g. Suresh Kumar"
          autoCapitalize="words"
          leadingIcon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
        />
        <Input
          label="Phone number"
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
        <MultiSelect
          label="Skills"
          value={skillIds}
          onChange={handleSkillsChange}
          options={skillOptions}
          placeholder={loadingSkills ? 'Loading skills…' : 'Select skills'}
          helper={skillsHelper}
          disabled={loadingSkills || skills.length === 0}
        />
      </View>

      {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
      {!submitError && missingHint ? (
        <Text style={styles.missingHint} accessibilityLiveRegion="polite">{missingHint}</Text>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        onPress={handleSubmit}>
        {submitting ? 'Sending…' : 'Send invite'}
      </Button>
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
  submitError: {
    ...typography.bodySm,
    color: colors.danger,
    marginTop: -spacing.s2,
  },
  missingHint: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: -spacing.s2,
    textAlign: 'center',
  },
});
