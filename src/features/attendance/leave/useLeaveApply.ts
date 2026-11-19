/**
 * useLeaveApply.ts — the Leave apply form's orchestration (Story 17-5,
 * spec D1/D4–D6). Owns: the read-once consumption of the DatePicker's
 * return channel (the RosterScreen idiom), the seq-latched live preview,
 * the submit latch with one fresh idempotency key per tap, the D6 error
 * table, and the access-store observation that pops the screen back when
 * tracking is disabled mid-session (a flip to none/history_only strands
 * this screen — the tab's own guard only fires when the TAB is focused).
 *
 * Race latch (D4): a monotonic request sequence number, not a param key —
 * a From→B→From-A-again triple-key would let a stale response answer the
 * newest request; only the newest seq renders, and a response landing
 * after unmount is dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { attendanceLeaveService } from '../../../services';
import type {
  LeaveBalanceView,
  LeavePart,
  LeaveTypeView,
} from '../../../services/resources/attendanceLeave';
import type { ApiError } from '../../../services/api/apiError';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import {
  refreshAttendanceAccessNow,
  useAttendanceAccess,
} from '../me/attendanceAccessStore';
import type {
  LeaveApplyParams,
  TechnicianRootStackParamList,
} from '../../../navigation/types';
import {
  buildApplyBody,
  buildWireDates,
  changePart,
  clearTo,
  initialLeaveForm,
  leaveTypeOptionCaption,
  minSelectableDate,
  pickFrom,
  pickTo,
  sortLeaveTypes,
  typeSelectable,
  typeOptions,
  type LeaveFormState,
  type LeaveFormStep,
} from './leaveApplyModel';

/** D8 copy — the FE-owned transport/generic lines. */
export const PREVIEW_TRANSPORT_MESSAGE =
  "Couldn't update the working-days count. Check your connection.";
export const SUBMIT_OFFLINE_MESSAGE =
  "You're offline. Submitting leave needs a working connection.";
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const SUBMITTED_ANNOUNCEMENT = 'Leave request submitted';
export const BALANCES_ERROR_MESSAGE = "Couldn't load your balances.";

/** The live preview's render state. In-flight keeps the previous count so
 *  the chip dims in place (no spinner swap, no layout shift). */
export interface LeavePreviewState {
  status: 'idle' | 'loading' | 'ok' | 'rejected' | 'transport';
  workingDays: number | null;
  message: string | null;
}

/** The no-dates state both leave forms share (the on-behalf hook imports
 *  it — one idle shape, no drift). */
export const IDLE_PREVIEW: LeavePreviewState = {
  status: 'idle',
  workingDays: null,
  message: null,
};

/** D6's POST error table — the server's message, verbatim, except the
 *  FE-owned transport line; the code is what we branch on, never the
 *  string. `ATTENDANCE_NOT_TRACKED` additionally forces the access-store
 *  refresh at the call site (the flip then drives the pop-back). */
function messageForSubmitError(err: ApiError): string {
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return SUBMIT_OFFLINE_MESSAGE;
  }
  return err.message || GENERIC_ERROR_MESSAGE;
}

type Navigation = NativeStackNavigationProp<
  TechnicianRootStackParamList,
  'LeaveApply'
>;

export function useLeaveApply(input: {
  navigation: Navigation;
  route: { params?: LeaveApplyParams };
}) {
  const { navigation, route } = input;
  const today = route.params?.today ?? null;

  // The day sheet's "Apply leave" prefill (2026-10): the tapped work date
  // seeds From ONCE at mount — the normal single-date pick through the same
  // model transition (pickFrom), so every form invariant (range clearing,
  // part reset) holds by construction. It never re-runs: a fresh push is a
  // fresh mount; an old prefilled param must not re-apply on any re-render.
  const prefill = route.params?.prefillDate ?? null;
  const [step, setStep] = useState<LeaveFormStep>(() => {
    return prefill ? pickFrom(initialLeaveForm().state, prefill) : initialLeaveForm();
  });
  const state = step.state;
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<LeavePreviewState>(IDLE_PREVIEW);
  const [footerError, setFooterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Story 23-14 — the Leave type picker + the balances card. ------------
  // Catalog types (enabled only — the BE hard-filters) and the per-type
  // balances. Both non-blocking: a failed balances GET leaves the form
  // fully usable (the picker falls back to bare names, the card shows a
  // quiet notice) — balances are context, not a gate.
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeView[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [balances, setBalances] = useState<LeaveBalanceView[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  // The PICKED type's raw id. There is no "No type" row in the picker
  // (owner's call, 2026-11-19): the first sorted type is the default, and
  // null only survives when the catalog is empty/failed — then the request
  // goes on the wire untyped (paid leave, the shipped BE semantic).
  const [pickedTypeId, setPickedTypeId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Every form transition clears the message area (D6: the message clears
   *  on the next param change). */
  const transition = useCallback((next: (state: LeaveFormState) => LeaveFormStep) => {
    setStep(prev => next(prev.state));
    setFooterError(null);
  }, []);

  // --- 23-14 fetches: the catalog types once; balances on mount + focus. ---
  // Focus refetch is the staleness guard: the owner's decisions and the
  // check-in auto-cancel consume balance server-side while this form can
  // sit open, and a balance card that lies is worse than none.
  const typesSeq = useRef(0);
  const balancesSeq = useRef(0);
  useEffect(() => {
    const requestSeq = ++typesSeq.current;
    attendanceLeaveService
      .listMyLeaveTypes()
      .then(types => {
        if (!mounted.current || requestSeq !== typesSeq.current) return;
        setLeaveTypes(types);
      })
      .catch(() => {
        // Non-blocking by design — the empty list renders the picker's
        // neutral notice and the form behaves exactly as pre-23-14.
      })
      .finally(() => {
        if (requestSeq === typesSeq.current) setTypesLoading(false);
      });
  }, []);

  const loadBalances = useCallback(() => {
    const requestSeq = ++balancesSeq.current;
    setBalancesLoading(true);
    attendanceLeaveService
      .getMyLeaveBalances()
      .then(rows => {
        if (!mounted.current || requestSeq !== balancesSeq.current) return;
        setBalances(rows);
        setBalancesError(null);
      })
      .catch(() => {
        if (!mounted.current || requestSeq !== balancesSeq.current) return;
        setBalancesError(BALANCES_ERROR_MESSAGE);
      })
      .finally(() => {
        if (requestSeq === balancesSeq.current) setBalancesLoading(false);
      });
  }, []);

  // First load + every re-entry. The navigation-prop listener (not
  // useFocusEffect) keeps the hook testable without a NavigationContainer
  // — the same access-flip listener below uses this form already.
  useEffect(() => {
    loadBalances();
  }, [loadBalances]);
  useEffect(() => {
    return navigation.addListener('focus', loadBalances);
  }, [navigation, loadBalances]);

  /** The picker's rows: enabled catalog types in the model's display
   *  order (accruing first, then Comp-Off), each with its balance caption
   *  (viewer 'employee') and its pickability — zero-balance accrual types
   *  are disabled in the sheet (the owner's ruling; mirrors the BE's
   *  apply-time check; Comp-Off and allow-over types stay offered). */
  const sortedTypes = sortLeaveTypes(leaveTypes);
  const leaveTypePickerOptions = sortedTypes.map(type => {
    const remaining =
      balances.find(row => row.typeId === type.id)?.remaining ?? null;
    return {
      id: type.id,
      name: type.name,
      caption: leaveTypeOptionCaption(type.accrualMode, remaining),
      disabled: !typeSelectable(type.accrualMode, type.allowOverBalance, remaining),
    };
  });

  /** The effective selection: the raw pick while it is still OFFERED,
   *  else the first pickable type (the default), else null — an empty
   *  catalog means the wire request carries no type. */
  const firstPickableId: string | null =
    leaveTypePickerOptions.find(option => !option.disabled)?.id ?? null;
  const selectedTypeId: string | null =
    pickedTypeId != null &&
    leaveTypePickerOptions.some(
      option => option.id === pickedTypeId && !option.disabled,
    )
      ? pickedTypeId
      : firstPickableId;
  // Sally F6: options exist but NONE is pickable (every accrual type's
  // balance is used up, no Comp-Off/allow-over type) — the fields must not
  // dress a disabled type up as the selection; the neutral notice renders
  // instead and the wire request stays untyped (the BE's paid-leave
  // semantic — the preview/POST still govern it).
  const leaveTypeUnavailable =
    leaveTypePickerOptions.length > 0 && firstPickableId == null;

  /** A picker tap — a param change, so the message area clears with it.
   *  The sheet closes at the call site (select + dismiss is one gesture). */
  const pickLeaveType = useCallback((id: string | null) => {
    setPickedTypeId(id);
    setFooterError(null);
  }, []);

  // The type chooser sheet (the inline rows collapsed into it — the
  // device-pass compaction). Visibility is screen-adjacent state, so it
  // rides the hook like the form state it modifies.
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const openTypePicker = useCallback(() => setTypePickerVisible(true), []);
  const closeTypePicker = useCallback(() => setTypePickerVisible(false), []);

  // --- Live preview: latest-wins GET, only when From exists (D4). ----------
  // 23-14: the preview now carries the picked type, so the BE runs the
  // apply-time balance check (and the payroll-lock and type gates) inside
  // it — a `ok: false` verdict IS the server's refusal message, rendered
  // inline, and it gates submit (the form must not apply a request the
  // server has already said it would refuse). A transport failure stays
  // fail-open: the BE re-verdicts at POST.
  const seq = useRef(0);
  const { from, to, part } = state;
  useEffect(() => {
    if (!from) {
      seq.current += 1; // invalidate any in-flight GET — no From, no count
      setPreview(IDLE_PREVIEW);
      return;
    }
    const requestSeq = ++seq.current;
    setPreview(prev => ({
      status: 'loading',
      workingDays: prev.workingDays, // the dim-in-place previous value
      message: null,
    }));
    const dates = buildWireDates({ from, to, part });
    if (!dates) return; // unreachable when from is set (model contract)
    attendanceLeaveService
      .previewLeave({
        ...dates,
        ...(selectedTypeId ? { leaveTypeId: selectedTypeId } : {}),
      })
      .then(res => {
        if (!mounted.current || requestSeq !== seq.current) return; // stale
        if (!res.ok) {
          // The gate answers NOT_TRACKED inline on preview too (200) —
          // force the access refresh; the store flip then pops us back.
          if (res.errorCode === 'ATTENDANCE_NOT_TRACKED') {
            refreshAttendanceAccessNow();
          }
          setPreview({ status: 'rejected', workingDays: null, message: res.message });
        } else {
          setPreview({ status: 'ok', workingDays: res.workingDays, message: null });
        }
      })
      .catch(() => {
        if (!mounted.current || requestSeq !== seq.current) return;
        setPreview({ status: 'transport', workingDays: null, message: PREVIEW_TRANSPORT_MESSAGE });
      });
  }, [from, to, part, selectedTypeId]);

  // --- The DatePicker return channel: read once, then clear (D1). ----------
  const lastPickRef = useRef<string | null>(null);
  useEffect(() => {
    const { pickedDate, context } = route.params ?? {};
    if (!pickedDate || !context) {
      // The clearing setParams landed (or a fresh mount): the signature
      // guard must let the NEXT pick through — even the SAME date re-picked
      // after a Clear, where applying it is a real state change, not a
      // no-op (review: blind-hunter MEDIUM).
      lastPickRef.current = null;
      return;
    }
    const signature = `${context}|${pickedDate}`;
    if (lastPickRef.current === signature) return;
    lastPickRef.current = signature;
    // setParams clearing is async — the signature guard above keeps a
    // pending param from re-dispatching on each render until it clears.
    navigation.setParams({ pickedDate: null, context: null });
    if (context === 'from') transition(s => pickFrom(s, pickedDate));
    else if (context === 'to') transition(s => pickTo(s, pickedDate));
  }, [route.params, navigation, transition]);

  // --- Access flip pop-back (D1): none/history_only while on top. ----------
  const access = useAttendanceAccess();
  const wasEligible = useRef(false);
  const maybePopForAccessFlip = useCallback(() => {
    const accessState = access.access?.attendanceAccess ?? null;
    if (accessState === 'active' || accessState === 'upcoming') {
      wasEligible.current = true;
      return;
    }
    if (
      (accessState === 'none' || accessState === 'history_only') &&
      wasEligible.current &&
      navigation.isFocused()
    ) {
      navigation.goBack();
    }
  }, [access, navigation]);
  useEffect(() => {
    maybePopForAccessFlip();
  }, [maybePopForAccessFlip]);
  // A flip landing while the DatePicker is on top finds isFocused() false
  // and would otherwise be skipped forever — re-check when the form
  // regains focus (review: blind-hunter MEDIUM). This screen's OWN
  // navigation object: on a root-stack screen that is correct (the 15-10
  // getParent() trap applies to tab screens only).
  useEffect(() => {
    return navigation.addListener('focus', maybePopForAccessFlip);
  }, [navigation, maybePopForAccessFlip]);

  // --- Submit (D5): gate → latch → fresh key → announce-and-leave. ---------
  // 23-14: a server verdict that the request would be refused (insufficient
  // balance, locked month, overlap, disabled type) also gates the button —
  // the refusal message renders inline above, so a disabled button always
  // has its reason on screen. Transport failures and in-flight GETs stay
  // fail-open; the BE re-verdicts at POST regardless.
  const submitLatch = useRef(false);
  const canSubmit =
    from != null && reason.trim() !== '' && preview.status !== 'rejected';
  const submit = useCallback(() => {
    if (submitLatch.current) return; // double-tap no-op while in flight
    if (!state.from || reason.trim() === '') return; // the disabled gate
    if (preview.status === 'rejected') return; // the server's refusal stands
    submitLatch.current = true;
    setSubmitting(true);
    const idempotencyKey = generateIdempotencyKey(); // fresh per tap
    attendanceLeaveService
      .applyLeave(
        buildApplyBody(state, reason.trim(), selectedTypeId),
        idempotencyKey,
      )
      // 201 = success for BOTH the create and the replay (same handler) —
      // announce and leave; a submitted write stands even if we unmount.
      .then(() => {
        if (!mounted.current) return;
        AccessibilityInfo.announceForAccessibility(SUBMITTED_ANNOUNCEMENT);
        navigation.goBack();
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        if (err.code === 'ATTENDANCE_NOT_TRACKED') {
          refreshAttendanceAccessNow();
        }
        const message = messageForSubmitError(err);
        setFooterError(message);
        AccessibilityInfo.announceForAccessibility(message);
      })
      .finally(() => {
        submitLatch.current = false;
        if (mounted.current) setSubmitting(false);
      });
  }, [state, reason, selectedTypeId, navigation, preview.status]);

  // --- Navigation + control handlers handed to the screen. -----------------
  const openPicker = useCallback(
    (context: 'from' | 'to') => {
      navigation.navigate('DatePicker', {
        title: context === 'from' ? 'Choose start date' : 'Choose end date',
        value: context === 'from' ? state.from : state.to,
        today: today ?? undefined,
        minDate:
          context === 'from'
            ? today
              ? minSelectableDate(today)
              : undefined
            : state.from ?? undefined,
        returnTo: 'LeaveApply',
        context,
      });
    },
    [state, today, navigation],
  );

  return {
    today,
    from,
    to,
    part,
    reason,
    setReason: useCallback(
      (next: string) => {
        setReason(next);
        setFooterError(null);
      },
      [],
    ),
    typeOptions: typeOptions(state),
    resetNote: step.resetNote,
    preview,
    canSubmit,
    submitting,
    footerError,
    changePart: useCallback(
      (next: LeavePart) => transition(s => changePart(s, next)),
      [transition],
    ),
    clearTo: useCallback(() => transition(clearTo), [transition]),
    openFromPicker: useCallback(() => openPicker('from'), [openPicker]),
    openToPicker: useCallback(() => openPicker('to'), [openPicker]),
    // 23-14 additions — the picker + balances pass through to the fields.
    leaveTypePickerOptions,
    typesLoading,
    leaveTypeUnavailable,
    selectedTypeId,
    pickLeaveType,
    typePickerVisible,
    openTypePicker,
    closeTypePicker,
    balances,
    balancesLoading,
    balancesError,
    submit,
  };
}
