/**
 * useApplyOnBehalf — the apply-on-behalf screen's own state/submit hook
 * (Story 17-6, spec D4). Deliberately NOT `useLeaveApply`: that hook is
 * typed to the technician `LeaveApply` route. The on-behalf form now HAS
 * a live preview (23-14): the dedicated owner route
 * `GET /attendance/leave/on-behalf/preview` runs the on-behalf POST's
 * validation read-only for the picked employee — the technician-scoped
 * `me` preview still 403s an owner JWT, which is why this route exists.
 * The form therefore gets the working-days count chip, the server's
 * refusal verdict inline (insufficient balance, locked month, overlap —
 * rendered verbatim) and the same submit gate as the self-apply form.
 *
 * Shared brain: the form transitions are `leaveApplyModel`'s (the same
 * single-date rule), the picker channel is the same read-once-then-clear
 * idiom, and the From picker's floor is the DEVICE-local today−7 as a
 * CONVENIENCE ONLY (no server `today` exists on this route — commented at
 * the call site); the authoritative ladders (`LEAVE_BEFORE_START_DATE`,
 * `LEAVE_TOO_OLD`) are server-rendered verbatim on submit — never a client
 * decision.
 *
 * Error posture (spec D4): server messages verbatim;
 * `ATTENDANCE_NOT_TRACKED` on-behalf means the TARGET employee is untracked
 * — inline server message only, NO access-store refresh, form stays;
 * `ATTENDANCE_EMPLOYEE_NOT_FOUND` gets the FE-owned line. Success:
 * announce "Leave applied for {name}" and land on OwnerLeave `all` (a
 * born-approved request is invisible in the Pending filter).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { enrolmentsService } from '../../../services';
import { attendanceLeaveService } from '../../../services';
import type {
  LeaveBalanceView,
  LeaveTypeView,
} from '../../../services/resources/attendanceLeave';
import type { ApiError } from '../../../services/api/apiError';
import type { LeavePickerEmployee } from './EmployeePickerSheet';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import { istTodayDate } from '../../../utils/istDate';
import type {
  ApplyOnBehalfParams,
  RootStackParamList,
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
import {
  BALANCES_ERROR_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  IDLE_PREVIEW,
  PREVIEW_TRANSPORT_MESSAGE,
  SUBMIT_OFFLINE_MESSAGE,
  type LeavePreviewState,
} from './useLeaveApply';

export const EMPLOYEE_NOT_FOUND_MESSAGE =
  "This person isn't in your team anymore.";
export const APPLIED_ANNOUNCEMENT_PREFIX = 'Leave applied for';

/** D4 — the picker keeps TRACKED rows only (`attendanceStartDate != null`),
 *  carrying the identity fields the picker's search matches on (code,
 *  phone) and its caption shows. */
export function trackedEmployees(
  rows: {
    employeeId: string;
    employeeName: string;
    employeeCode?: string | null;
    phone?: string;
    officeName: string | null;
    attendanceStartDate: string | null;
    avatarUrl?: string | null;
  }[],
): LeavePickerEmployee[] {
  return rows
    .filter(row => row.attendanceStartDate != null)
    .map(
      ({
        employeeId,
        employeeName,
        employeeCode,
        phone,
        officeName,
        avatarUrl,
      }) => ({
        employeeId,
        employeeName,
        employeeCode: employeeCode ?? null,
        phone: phone ?? '',
        officeName,
        avatarUrl: avatarUrl ?? null,
      }),
    );
}

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'ApplyOnBehalf'
>;

function messageForSubmitError(err: ApiError): string {
  if (err.code === 'ATTENDANCE_EMPLOYEE_NOT_FOUND') {
    return EMPLOYEE_NOT_FOUND_MESSAGE;
  }
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return SUBMIT_OFFLINE_MESSAGE;
  }
  return err.message || GENERIC_ERROR_MESSAGE;
}

export function useApplyOnBehalf(input: {
  navigation: Navigation;
  route: { params?: ApplyOnBehalfParams };
}) {
  const { navigation, route } = input;

  // The picked team member — from params (deep link) until the picker
  // replaces it; the CTA entry opens the picker immediately.
  const [employee, setEmployee] = useState<LeavePickerEmployee | null>(() => {
    const p = route.params;
    return p?.employeeId && p.employeeName
      ? { employeeId: p.employeeId, employeeName: p.employeeName, officeName: p.officeName ?? null }
      : null;
  });
  const [pickerVisible, setPickerVisible] = useState(false);

  // The roster (tracked rows only), fetched once on mount.
  const [roster, setRoster] = useState<LeavePickerEmployee[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  // A failed roster GET must not masquerade as "no team members yet" —
  // the picker shows an error + Retry instead (17-6 review P3).
  const [rosterError, setRosterError] = useState(false);
  const mounted = useRef(true);
  const loadRoster = useCallback(() => {
    setRosterLoading(true);
    setRosterError(false);
    enrolmentsService
      .list()
      .then(rows => {
        if (!mounted.current) return;
        setRoster(trackedEmployees(rows));
      })
      .catch(() => {
        if (!mounted.current) return;
        setRoster([]);
        setRosterError(true);
      })
      .finally(() => {
        if (mounted.current) setRosterLoading(false);
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    loadRoster();
    return () => {
      mounted.current = false;
    };
  }, [loadRoster]);

  // Open the picker while nobody is picked (the CTA's cold entry).
  useEffect(() => {
    if (employee == null) setPickerVisible(true);
  }, [employee]);

  const [step, setStep] = useState<LeaveFormStep>(initialLeaveForm);
  const state = step.state;
  const [reason, setReason] = useState('');
  const [footerError, setFooterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Story 23-14 — the Leave type picker + the target's balances. -------
  // The OWNER cannot read the employee-scoped `me/leave/*` endpoints (the
  // MeLeaveController is @Roles(TECHNICIAN) — an owner JWT answers 403):
  // the catalog comes from the admin GET /attendance/leave/types
  // (`leave.types`), filtered to ENABLED client-side (the full catalog
  // returns disabled types + remnants — they must never reach the
  // picker), and the balances are the TARGET employee's via
  // GET /attendance/leave/:employeeId/balances.
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeView[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [balances, setBalances] = useState<LeaveBalanceView[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  // The PICKED type's raw id — same no-"No type" rule as the technician
  // hook: first sorted type is the default; null survives only when the
  // catalog is empty/failed (the wire request then carries no type).
  const [pickedTypeId, setPickedTypeId] = useState<string | null>(null);

  useEffect(() => {
    attendanceLeaveService
      .listCompanyLeaveTypes()
      .then(types => {
        if (!mounted.current) return;
        setLeaveTypes(types.filter(type => type.enabled));
      })
      .catch(() => {
        // Non-blocking — an empty list renders the picker's neutral
        // notice and the form behaves exactly as pre-23-14.
      })
      .finally(() => {
        if (mounted.current) setTypesLoading(false);
      });
  }, []);

  /** Every form transition clears the message area (the 17-5 D6 rule). */
  const transition = useCallback(
    (next: (state: LeaveFormState) => LeaveFormStep) => {
      setStep(prev => next(prev.state));
      setFooterError(null);
    },
    [],
  );

  // --- The DatePicker return channel: read once, then clear (F4). ----------
  const lastPickRef = useRef<string | null>(null);
  const { pickedDate, context } = route.params ?? {};
  useEffect(() => {
    if (!pickedDate || !context) {
      lastPickRef.current = null;
      return;
    }
    const signature = `${context}|${pickedDate}`;
    if (lastPickRef.current === signature) return;
    lastPickRef.current = signature;
    navigation.setParams({ pickedDate: null, context: null });
    if (context === 'from') transition(s => pickFrom(s, pickedDate));
    else if (context === 'to') transition(s => pickTo(s, pickedDate));
  }, [pickedDate, context, navigation, transition]);

  const openPicker = useCallback(
    (slot: 'from' | 'to') => {
      navigation.navigate('DatePicker', {
        title: slot === 'from' ? 'Choose start date' : 'Choose end date',
        value: slot === 'from' ? state.from : state.to,
        // CONVENIENCE floor only (device-local today−7) — there is NO
        // server `today` on this route; the authoritative past-date and
        // staleness ladders are the server's, rendered verbatim on submit.
        minDate:
          slot === 'from'
            ? minSelectableDate(istTodayDate())
            : (state.from ?? undefined),
        returnTo: 'ApplyOnBehalf',
        context: slot,
      });
    },
    [state, navigation],
  );

  const onPickEmployee = useCallback(
    (employeeId: string) => {
      const picked =
        roster.find(row => row.employeeId === employeeId) ?? null;
      setEmployee(picked);
      setPickerVisible(false);
      setFooterError(null);
    },
    [roster],
  );

  // --- 23-14: the target's balances — on employee change AND on focus ------
  // (the staleness guard from the plan review: the owner can submit, land
  // on OwnerLeave, and Android-back into this still-mounted form, so a
  // balance card that never refetches would show pre-apply numbers).
  const balancesSeq = useRef(0);
  const loadBalances = useCallback(
    (employeeId: string | null) => {
      if (employeeId == null) {
        setBalances([]);
        setBalancesError(null);
        setBalancesLoading(false);
        return;
      }
      const requestSeq = ++balancesSeq.current;
      setBalancesLoading(true);
      attendanceLeaveService
        .getEmployeeBalances(employeeId)
        .then(rows => {
          if (!mounted.current || requestSeq !== balancesSeq.current) return;
          setBalances(rows);
          setBalancesError(null);
        })
        .catch(() => {
          if (!mounted.current || requestSeq !== balancesSeq.current) return;
          // Includes the 404 for a since-removed employee — a quiet
          // notice, never a blocking failure.
          setBalancesError(BALANCES_ERROR_MESSAGE);
        })
        .finally(() => {
          if (requestSeq === balancesSeq.current) setBalancesLoading(false);
        });
    },
    [],
  );
  useEffect(() => {
    loadBalances(employee?.employeeId ?? null);
  }, [employee, loadBalances]);
  // Re-entry refetch (the Android-back staleness guard) — the
  // navigation-prop listener, not useFocusEffect, for the same
  // testability reason as the technician hook.
  useEffect(() => {
    return navigation.addListener('focus', () => {
      if (employee?.employeeId) loadBalances(employee.employeeId);
    });
  }, [navigation, employee, loadBalances]);

  /** The picker's rows: enabled catalog types in the model's display
   *  order, with the TARGET's balance caption (viewer 'owner' — Comp-Off
   *  reads "You approve each request") and pickability: a zero-balance
   *  accrual type is disabled in the sheet (mirrors the BE's apply-time
   *  check; the balance here is the TARGET's). The shortfall catch
   *  itself is the preview's verdict below — one server truth, no FE
   *  balance math. */
  const sortedTypes = sortLeaveTypes(leaveTypes);
  const leaveTypePickerOptions = sortedTypes.map(type => {
    const remaining =
      balances.find(row => row.typeId === type.id)?.remaining ?? null;
    return {
      id: type.id,
      name: type.name,
      caption: leaveTypeOptionCaption(type.accrualMode, remaining, 'owner'),
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
  // Sally F6: options exist but NONE is pickable for the TARGET (every
  // accrual type's balance used up, no Comp-Off/allow-over type) — the
  // fields must not dress a disabled type up as the selection; the neutral
  // notice renders instead and the wire request stays untyped (the BE's
  // paid-leave semantic — the preview/POST still govern it).
  const leaveTypeUnavailable =
    leaveTypePickerOptions.length > 0 && firstPickableId == null;

  /** A picker tap — a param change, so the message area clears with it.
   *  The sheet closes at the call site (select + dismiss is one gesture). */
  const pickLeaveType = useCallback((id: string | null) => {
    setPickedTypeId(id);
    setFooterError(null);
  }, []);

  // The type chooser sheet (the inline rows collapsed into it — the
  // device-pass compaction). Same shape as the technician hook.
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const openTypePicker = useCallback(() => setTypePickerVisible(true), []);
  const closeTypePicker = useCallback(() => setTypePickerVisible(false), []);

  // --- 23-14: the live preview via the OWNER route. ------------------------
  // GET /attendance/leave/on-behalf/preview runs the on-behalf POST's
  // validation read-only for the picked employee (the technician `me`
  // preview still 403s an owner JWT). Same contract as the self-apply
  // form: latest-wins seq latch, dim-in-place previous count, `ok: false`
  // renders the server's message verbatim AND gates submit, transport
  // fails open (the BE re-verdicts at POST). NOT_TRACKED here means the
  // TARGET is untracked — inline only, never an access-store refresh.
  const previewSeq = useRef(0);
  const [preview, setPreview] = useState<LeavePreviewState>(IDLE_PREVIEW);
  useEffect(() => {
    if (employee == null || !state.from) {
      previewSeq.current += 1; // invalidate any in-flight GET
      setPreview(IDLE_PREVIEW);
      return;
    }
    const requestSeq = ++previewSeq.current;
    setPreview(prev => ({
      status: 'loading',
      workingDays: prev.workingDays, // the dim-in-place previous value
      message: null,
    }));
    const dates = buildWireDates(state);
    if (!dates) return; // unreachable when from is set (model contract)
    attendanceLeaveService
      .previewOnBehalf({
        employeeId: employee.employeeId,
        ...dates,
        ...(selectedTypeId ? { leaveTypeId: selectedTypeId } : {}),
      })
      .then(res => {
        if (!mounted.current || requestSeq !== previewSeq.current) return;
        if (!res.ok) {
          setPreview({
            status: 'rejected',
            workingDays: null,
            message: res.message,
          });
        } else {
          setPreview({
            status: 'ok',
            workingDays: res.workingDays,
            message: null,
          });
        }
      })
      .catch(() => {
        if (!mounted.current || requestSeq !== previewSeq.current) return;
        setPreview({
          status: 'transport',
          workingDays: null,
          message: PREVIEW_TRANSPORT_MESSAGE,
        });
      });
  }, [employee, state, selectedTypeId]);

  // --- Submit: gate → latch → fresh key → announce-and-land-All. -----------
  // 23-14: the server's preview verdict gates the button too — the same
  // refusal message renders inline above, so a disabled Approve always
  // has its reason on screen. Transport/in-flight states fail open; the
  // BE re-verdicts at POST.
  const submitLatch = useRef(false);
  const canSubmit =
    employee != null &&
    state.from != null &&
    reason.trim() !== '' &&
    preview.status !== 'rejected';
  const submit = useCallback(() => {
    if (submitLatch.current) return; // double-tap no-op while in flight
    if (employee == null || !state.from || reason.trim() === '') return;
    if (preview.status === 'rejected') return; // the server's refusal stands
    submitLatch.current = true;
    setSubmitting(true);
    setFooterError(null);
    const idempotencyKey = generateIdempotencyKey(); // fresh per tap
    attendanceLeaveService
      .applyOnBehalf(
        {
          employeeId: employee.employeeId,
          ...buildApplyBody(state, reason.trim(), selectedTypeId),
        },
        idempotencyKey,
      )
      // 201 = success for BOTH the create and the replay; the count is
      // discovered from the returned view (no live preview exists here).
      .then(() => {
        if (!mounted.current) return;
        AccessibilityInfo.announceForAccessibility(
          `${APPLIED_ANNOUNCEMENT_PREFIX} ${employee.employeeName}`,
        );
        // Param merge pops back to the owner's Leave screen, landing on All
        // so the born-approved request is visible immediately (spec D4).
        navigation.navigate('OwnerLeave', { tab: 'all' });
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        // NOT_TRACKED here = the TARGET employee is untracked — inline
        // server message only; deliberately NO access-store refresh (that
        // seam is the technician's own session, not this employee's).
        const message = messageForSubmitError(err);
        setFooterError(message);
        AccessibilityInfo.announceForAccessibility(message);
      })
      .finally(() => {
        submitLatch.current = false;
        if (mounted.current) setSubmitting(false);
      });
  }, [employee, state, reason, selectedTypeId, navigation, preview.status]);

  return {
    employee,
    roster,
    rosterLoading,
    rosterError,
    reloadRoster: loadRoster,
    pickerVisible,
    closePicker: useCallback(() => setPickerVisible(false), []),
    /** The selected card's "Change" — re-open over the current pick. */
    reopenPicker: useCallback(() => setPickerVisible(true), []),
    onPickEmployee,
    from: state.from,
    to: state.to,
    part: state.part,
    reason,
    // 23-14 additions — the picker + the target's balances pass through.
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
    setReason: useCallback((next: string) => {
      setReason(next);
      setFooterError(null);
    }, []),
    typeOptions: typeOptions(state),
    resetNote: step.resetNote,
    preview,
    canSubmit,
    submitting,
    footerError,
    changePart: useCallback(
      (next: LeaveFormState['part']) => transition(s => changePart(s, next)),
      [transition],
    ),
    clearTo: useCallback(() => transition(clearTo), [transition]),
    openFromPicker: useCallback(() => openPicker('from'), [openPicker]),
    openToPicker: useCallback(() => openPicker('to'), [openPicker]),
    submit,
  };
}
