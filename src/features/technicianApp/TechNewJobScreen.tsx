/**
 * TechNewJobScreen — the employee's create-job form (Epic 22, CAP-2).
 *
 * Pushed from the Jobs tab's "Add job" button (fail-hidden: the button
 * renders only while the profile's `canCreateJobs` is true) — and `POST
 * /jobs` re-checks that flag server-side, so this screen is a form, not a
 * guard: a job arriving here with the flag off still sees the plain-English
 * blocked view (the API would refuse with its own reason).
 *
 * Differences from the owner's NewJobScreen, by design:
 *   - No employee picker — the assignee is the creator themselves
 *     (`technicianId = profile.id`; CAP-2's no-assigning-others rule).
 *   - The customer section is the owner's shape — saved tiles plus one
 *     "Customer not in list? Add new" line that opens the full AddCustomer
 *     screen (map pin, structured address, phone-book pick), dual-
 *     registered on this stack in DRAFT mode: it never POSTs (an employee
 *     JWT lacks `customer.write`) — it pops back with a `newCustomerDraft`
 *     whose fields ride `POST /jobs`'s `newCustomer` payload (find-or-
 *     create by phone, server-side). A captured draft IS the selection:
 *     it replaces the picker until removed.
 *   - An X-Idempotency-Key is minted per submit so a double tap cannot
 *     create two jobs (the backend replays the first answer for 24h).
 *
 * The picker sections reuse the owner form's components unchanged
 * (SkillPicker, CustomerPicker, DateTimeFields). Data sources are the same
 * shared stores (`useSkills`, `useCustomers`, `useMyProfile`); employees hold
 * `customer.read`, so the customer list works unchanged.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { ArrowLeft, UserPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  Input,
  SectionHead,
} from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import { jobService } from '../../services';
import type {
  ApiError,
  CreateJobRequest,
  NewCustomerPayload,
} from '../../services';
import { logEvent } from '../../services/telemetry';
import { generateIdempotencyKey } from '../../utils';
import { useNow } from '../../hooks';
import { upsertJob } from '../jobs/useJobs';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { DIAL_CODE } from '../../constants/phone';
import { loadToday } from './useTechnicianJobs';
import { useMyProfile } from '../profile';
import { loadSkills, useSkills } from '../skills';
import { useCustomers } from '../customers';
import type { NewCustomerDraft } from '../customers/types';
import { DateTimeFields } from '../newJob/components/DateTimeFields';
import { SkillPicker } from '../newJob/components/SkillPicker';
import { CustomerPicker } from '../newJob/components/CustomerPicker';
import {
  TechNewCustomerCard,
  draftAddressLine,
} from './components/TechNewCustomerCard';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'TechNewJob'>;

/**
 * Next half-hour boundary from now — the owner form's default, kept so both
 * create forms pre-fill the same way.
 */
function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)));
  return d;
}

/**
 * The captured draft mapped onto `POST /jobs`'s `newCustomer` payload.
 * The AddCustomer form's Save gate already guarantees name + 10-digit
 * phone + a location signal, so this mapper never has to re-validate —
 * every field is included only when non-empty, and the snapshot's
 * coordinates travel as a unit (`placeId` is not part of the job payload).
 */
function buildNewCustomerPayload(draft: NewCustomerDraft): NewCustomerPayload {
  const snap = draft.snapshot;
  return {
    name: draft.name,
    countryCode: DIAL_CODE,
    phoneNumber: draft.phone,
    ...(draft.street ? { address: draft.street } : {}),
    ...(draft.city ? { city: draft.city } : {}),
    ...(snap?.formattedAddress ? { formattedAddress: snap.formattedAddress } : {}),
    ...(draft.area ? { pincode: draft.area } : {}),
    ...(snap
      ? { latitude: snap.latitude, longitude: snap.longitude }
      : {}),
    ...(draft.addressDetails ? { addressDetails: draft.addressDetails } : {}),
  };
}

/**
 * Section bands — the owner form's alternating surface treatment, kept so
 * both create forms read as one pattern.
 */
const SECTION_BANDS = [colors.surfaceCard, colors.surfaceSunken] as const;
const sectionBand = (index: number) => [
  styles.section,
  { backgroundColor: SECTION_BANDS[index % SECTION_BANDS.length] },
];

export default function TechNewJobScreen({ navigation, route }: Props) {
  const [skillId, setSkillId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  // The "Add new" capture, collected on the dual-registered AddCustomer
  // screen (draft mode) and returned here as a param. While set it IS the
  // customer selection — the saved-customer picker stays hidden until it's
  // removed, so the two arms can never both be live.
  const [newCustomer, setNewCustomer] = useState<NewCustomerDraft | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date>(nextHalfHour);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  /** Success confirmation (D7): shown briefly, then the screen closes. */
  const [justCreated, setJustCreated] = useState(false);

  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
  } = useMyProfile();

  const {
    skills,
    isLoading: skillsLoading,
    error: skillsError,
    refresh: refreshSkills,
  } = useSkills();

  const {
    customers,
    isLoading: customersLoading,
    error: customersError,
    hasLoaded: customersLoaded,
    refresh: refreshCustomers,
  } = useCustomers();

  useEffect(() => {
    void loadSkills();
  }, []);

  // SelectSkills returns with the picked skill on Apply — a string picks it,
  // `null` after "Clear" drops it and re-collapses the form. `undefined`
  // (param absent) means nothing to apply. Read once, then cleared (the
  // owner form's rule: a consumed param must not re-apply on a later visit).
  useEffect(() => {
    const picked = route.params?.selectedSkillId;
    if (picked === undefined) return;
    edit();
    setSkillId(picked);
    navigation.setParams({ selectedSkillId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.selectedSkillId, navigation]);

  // SelectCustomers' return channel — same read-once-clear rule.
  useEffect(() => {
    const picked = route.params?.selectedCustomerId;
    if (picked === undefined) return;
    edit();
    setCustomerId(picked);
    navigation.setParams({ selectedCustomerId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.selectedCustomerId, navigation]);

  // AddCustomer's return channel (draft mode) — same read-once-clear rule.
  // A "Use customer" becomes THE selection: any saved pick is dropped with
  // it, so the two customer arms stay mutually exclusive in state.
  useEffect(() => {
    const returned = route.params?.newCustomerDraft;
    if (returned === undefined) return;
    edit();
    setNewCustomer(returned);
    setCustomerId(null);
    navigation.setParams({ newCustomerDraft: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.newCustomerDraft, navigation]);

  // A create that fails after the user has changed the form must not keep
  // showing an error about the old form — every edit clears the server
  // error, and the edit-count snapshot decides at settle time.
  const editCount = useRef(0);
  // The idempotency key survives a FAILED submit: a response lost on the
  // wire (the job may exist server-side) is retried with the SAME key, so
  // the server replays the first answer instead of creating a second job.
  // Any form edit voids it — the next submit is a new action with a new
  // payload, and replaying the old answer for it would be wrong.
  const idempotencyKeyRef = useRef<string | null>(null);
  /** The auto-close timer for the success note — cleared on unmount. */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  const edit = (count: boolean = true) => {
    if (count) editCount.current += 1;
    idempotencyKeyRef.current = null;
    setSubmitError('');
  };

  const trimmedNotes = notes.trim();
  // useNow re-ticks every minute FORCING a re-render even when the form is
  // idle (the hook's own value is up to a minute stale — the fresh
  // Date.now() is what the gate actually compares against, so a form left
  // open across the chosen slot disables itself within one tick; review
  // find: a render-time-only Date.now() kept the button enabled and let a
  // stale slot through to a 422).
  useNow();
  const isPastSlot = scheduledAt.getTime() <= Date.now();

  /** Own id on the roster — the employee always self-assigns (CAP-2). */
  const selfTechnicianId = profile?.id ?? null;

  /** Can the customer half of the form be submitted? Either a saved pick
   *  or a captured draft. The AddCustomer form's Save gate already
   *  guarantees name + 10-digit phone + a location signal, so a present
   *  draft needs no per-field re-check here. */
  const customerReady = newCustomer !== null || Boolean(customerId);

  /**
   * `serviceLocation` is required by the API. Saved customer: their stored
   * address + city (the owner form's rule). Draft customer: the same line
   * the summary card shows (`draftAddressLine` — the resolved pick's line
   * when there is one, the typed street/city otherwise).
   */
  const serviceLocation = useMemo(() => {
    if (newCustomer) return draftAddressLine(newCustomer);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return '';
    return [customer.address, customer.city].filter(Boolean).join(', ');
  }, [customers, customerId, newCustomer]);

  const canSubmit =
    Boolean(skillId) &&
    customerReady &&
    Boolean(selfTechnicianId) &&
    serviceLocation.length > 0 &&
    !isPastSlot &&
    !submitting;

  const missingHint = (() => {
    if (submitting || canSubmit) return null;
    if (!skillId) return 'Pick a skill to continue';
    if (!newCustomer && !customerId) return 'Pick a customer to continue';
    if (serviceLocation.length === 0) return "Add the customer's address to continue";
    if (!isPastSlot) return null;
    return 'Pick a time that is still to come';
  })();

  const handleSkillChange = (id: string) => {
    edit();
    setSkillId(id);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !skillId || !selfTechnicianId) return;
    setSubmitting(true);
    setSubmitError('');
    const editsAtSubmit = editCount.current;
    // One key per action, minted at submit and kept across a failed retry
    // (see idempotencyKeyRef): a double tap replays the first answer
    // server-side instead of creating a second job.
    const idempotencyKey =
      idempotencyKeyRef.current ?? (idempotencyKeyRef.current = generateIdempotencyKey());
    // The customer arm is built FIRST as a typed union — spreading a union
    // object into the request literal keeps the `CreateJobRequest` XOR
    // contract (exactly one of customerId / newCustomer) intact, which a
    // conditional spread inline cannot express.
    // Each arm of the XOR contract is built as its own complete payload —
    // spreading the union arm into one literal does not distribute over the
    // `CreateJobRequest` union, so both arms spell the shared fields out.
    const sharedFields = {
      skillId,
      technicianId: selfTechnicianId,
      scheduledStart: scheduledAt.toISOString(),
      serviceLocation,
      ...(trimmedNotes
        ? { description: trimmedNotes, notesForTechnician: trimmedNotes }
        : {}),
    };
    // The customer arm as a local, so the XOR union stays a ternary over
    // ONE checked value: a live draft always wins (state keeps the two
    // arms exclusive), and `canSubmit` already blocks neither-being-set.
    const newCustomerArm = newCustomer;
    const payload: CreateJobRequest =
      newCustomerArm
        ? { ...sharedFields, newCustomer: buildNewCustomerPayload(newCustomerArm) }
        : { ...sharedFields, customerId: customerId as string };
    try {
      const created = await jobService.create(payload, idempotencyKey);
      // Firebase analytics: the employee create funnel (same event the
      // owner's create posts).
      logEvent('job_created');
      // The shared Jobs-tab store takes the row directly (the create
      // response IS the server row). For an approval-required tenant the
      // row is `pending_approval`: the store holds it ONLY in its Pending
      // list (scope `all` + that filter), so if that list is open the new
      // job appears immediately inside the 15s throttle window; day lists
      // never show it (CAP-4). The technician Today store still
      // force-refetches (its day list is its own request).
      upsertJob(created);
      void loadToday({ force: true });
      idempotencyKeyRef.current = null; // the action is done — a new submit is a new action
      // The job vanishes from every day list by design (CAP-4), so the
      // submit's only visible trace would be the amber row's count — say
      // the outcome before the screen closes (review 2026-11-13).
      setJustCreated(true);
      closeTimer.current = setTimeout(() => navigation.goBack(), 1600);
    } catch (err) {
      if (editCount.current === editsAtSubmit) {
        setSubmitError((err as ApiError).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Permission missing or refused — a plain-English blocked view, not a
   * hidden form. Reachable when the flag flips after the entry action was
   * drawn, or when an older backend omits the flag and a stale entry point
   * is tapped.
   */
  if (profileError) {
    return (
      <BlockedView
        title="Could not load your details"
        message={profileError}
        onRetry={() => void refreshProfile()}
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (!profileLoading && profile && profile.canCreateJobs !== true) {
    return (
      <BlockedView
        title="You don't create jobs yet"
        message="Ask the business owner to allow it for you from their settings."
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (profileLoading && !profile) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
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
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>New job</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={sectionBand(0)}>
            {renderSkills()}
          </View>

          {/* Progressive disclosure — the owner form's rule: nothing but the
              Skill section shows until a skill is picked. */}
          {skillId ? (
            <>
              <View style={sectionBand(1)}>
                <SectionHead title="Customer" />
                {newCustomer ? (
                  // A captured draft IS the selection — it replaces the
                  // picker until removed (the two arms stay exclusive).
                  <TechNewCustomerCard
                    draft={newCustomer}
                    onOpen={() =>
                      navigation.navigate('AddCustomer', {
                        returnTo: 'TechNewJob',
                        // Re-opening with a capture seeds the form with it.
                        ...(newCustomer ? { draft: newCustomer } : {}),
                      })
                    }
                    onRemove={() => {
                      edit();
                      setNewCustomer(null);
                    }}
                  />
                ) : (
                  <>
                    {renderCustomers()}
                    {/* The owner form's inline add row, unchanged in
                        wording — it opens the same full AddCustomer
                        screen (draft mode on this stack). */}
                    <Pressable
                      onPress={() =>
                        navigation.navigate('AddCustomer', {
                          returnTo: 'TechNewJob',
                        })
                      }
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Add new customer"
                      style={styles.inlineAddRow}>
                      <UserPlus size={18} color={colors.textLink} strokeWidth={2} />
                      <Text style={styles.inlineAddText}>
                        Customer not in list? Add new
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>

              <View style={sectionBand(2)}>
                <SectionHead title="Date & time" />
                <DateTimeFields
                  value={scheduledAt}
                  onChange={next => {
                    edit();
                    setScheduledAt(next);
                  }}
                />
                {isPastSlot ? (
                  <Text style={styles.fieldError}>Pick a time in the future.</Text>
                ) : null}
              </View>

              <View style={sectionBand(3)}>
                <SectionHead title="Notes" />
                <Input
                  value={notes}
                  onChangeText={text => {
                    edit();
                    setNotes(text);
                  }}
                  placeholder="Any special instructions..."
                  multiline
                  accessibilityLabel="Notes"
                />
              </View>
            </>
          ) : null}
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {justCreated ? (
            <Text style={styles.successNote} accessibilityLiveRegion="polite">
              {profile?.jobApprovalRequired
                ? 'Job created — waiting for approval'
                : 'Job created'}
            </Text>
          ) : submitError ? (
            <Text style={styles.submitError}>{submitError}</Text>
          ) : null}
          {!justCreated && !submitError && missingHint ? (
            <Text style={styles.missingHint} accessibilityLiveRegion="polite">
              {missingHint}
            </Text>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}>
            Create job
          </Button>
          {/* Epic 22 — the creator is told where their job lands (CAP-2's
              flag is the contract): approval ON means the job waits for the
              owner's decision, and the notification tells them the outcome. */}
          {profile?.jobApprovalRequired ? (
            <Text style={styles.approvalHint}>
              Your owner approves new jobs first — this job will wait for
              their approval.
            </Text>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  /** Skill tiles + their loading/empty/error states (the owner form's rules). */
  function renderSkills() {
    if (skillsLoading && skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (skillsError && skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>{skillsError}</Text>
          <Button variant="secondary" size="sm" onPress={refreshSkills}>
            Try again
          </Button>
        </View>
      );
    }
    if (skills.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No skills are available yet. Try again shortly.
          </Text>
        </View>
      );
    }
    return (
      <SkillPicker
        title="Skill"
        options={skills}
        value={skillId}
        onChange={handleSkillChange}
        onBrowseAll={() =>
          navigation.navigate('SelectSkills', {
            selectedSkillId: skillId,
            returnTo: 'TechNewJob',
          })
        }
      />
    );
  }

  /** Saved-customer tiles + their loading/empty/error states. */
  function renderCustomers() {
    if (customersLoading && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (customersError && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>{customersError}</Text>
          <Button variant="secondary" size="sm" onPress={refreshCustomers}>
            Try again
          </Button>
        </View>
      );
    }
    if (customersLoaded && customers.length === 0) {
      return (
        <View style={styles.sectionStatus}>
          <Text style={styles.statusText}>
            No saved customers yet. Use "Add new" below to create one with the job.
          </Text>
        </View>
      );
    }
    return (
      <CustomerPicker
        title="Customer"
        options={customers}
        value={customerId}
        onChange={id => {
          edit();
          setCustomerId(id);
        }}
        onBrowseAll={() =>
          navigation.navigate('SelectCustomers', {
            selectedCustomerId: customerId,
            returnTo: 'TechNewJob',
          })
        }
      />
    );
  }
}

/** The full-screen "can't create" state — back link, optional retry. */
function BlockedView({
  title,
  message,
  onBack,
  onRetry,
}: {
  title: string;
  message: string;
  onBack: () => void;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>New job</Text>
      </View>
      <View style={styles.centered}>
        <Text style={styles.blockedTitle}>{title}</Text>
        <Text style={styles.blockedMessage}>{message}</Text>
        {onRetry ? (
          <Button variant="secondary" size="md" onPress={onRetry}>
            Try again
          </Button>
        ) : null}
        <Button variant="primary" size="md" onPress={onBack}>
          Go back
        </Button>
      </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
  },
  blockedTitle: {
    ...typography.heading,
    color: colors.textStrong,
    textAlign: 'center',
  },
  blockedMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
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
  content: {
    padding: spacing.s4,
    paddingBottom: spacing.s6,
    gap: spacing.s5,
  },
  section: {
    gap: spacing.s3,
    borderRadius: radius.lg,
    padding: spacing.s3,
  },
  sectionStatus: {
    minHeight: 84,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.s3,
  },
  statusText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  inlineAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    // Keeps the row a 44px-tall tap target without a visible gap.
    paddingVertical: spacing.s2,
    marginTop: -spacing.s1,
  },
  inlineAddText: {
    ...typography.labelStrong,
    color: colors.textLink,
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
  successNote: {
    ...typography.bodySm,
    color: colors.status.done.fg,
    textAlign: 'center',
  },
  approvalHint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
  },
});
