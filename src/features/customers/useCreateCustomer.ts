/**
 * useCreateCustomer — the submit chain for `AddCustomerScreen`, extracted
 * verbatim (file split, behaviour unchanged): the submitting/submit-error
 * state, the back-guard that blocks hardware or gesture navigation while
 * the request is in flight, the error-copy mapping, and the post-success
 * sequence (store write → refresh → navigate back).
 *
 * One chain, two verbs: without `customerId` it POSTs the create payload;
 * with one it PATCHes the already-diffed update patch (the screen owns the
 * diff — payload assembly stays with the caller, which owns the form state
 * and the address-pick snapshot). Only the request *outcome* is this hook's
 * job. Edit is never pushed from NewJob, so its post-success path is
 * always the plain goBack.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { customerService } from '../../services';
import type {
  ApiError,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from '../../services';
import { currentResetEpoch } from '../../services/resetRegistry';
import type { AddCustomerReturnRouteName, RootStackParamList } from '../../navigation/types';
import { loadCustomers, upsertCustomer } from './useCustomers';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AddCustomer'>;

/**
 * Turns a failed `POST /customers` into copy the screen can show directly.
 * Codes follow the endpoint's documented failures.
 */
function createErrorMessage(err: ApiError): string {
  if (err.status === 409 || err.code === 'DUPLICATE_RESOURCE') {
    return 'A customer with this phone number already exists.';
  }
  if (err.status === 422 || err.code === 'VALIDATION_ERROR') {
    return 'Check the name and phone number — one of them looks invalid.';
  }
  if (err.status === 403) {
    return 'Only the business owner can add customers.';
  }
  if (err.status === 400) {
    return 'Finish setting up your company before adding customers.';
  }
  return err.message;
}

/**
 * The PATCH counterpart. Deliberately narrower than the create map: there
 * is no duplicate-phone path (the phone is immutable, never in the patch —
 * a 409 on edit is not a state the form can fix), and a 404 here means the
 * customer is gone (or belongs to another tenant — reads never say which),
 * so the copy invites leaving instead of retrying.
 */
function updateErrorMessage(err: ApiError): string {
  if (err.status === 404) {
    return 'This customer is no longer available. It may have been removed.';
  }
  if (err.status === 422 || err.code === 'VALIDATION_ERROR') {
    return 'Check the fields — one of the values looks invalid.';
  }
  if (err.status === 403) {
    return 'Only the business owner can edit customers.';
  }
  if (err.status === 400) {
    return 'Finish setting up your company before editing customers.';
  }
  return err.message;
}

type Props = {
  navigation: Navigation;
  /** The post-save destination (`'NewJob'` → the created id travels as a
   *  navigation param; `'Customers'`/`'Home'` → plain goBack). Edit mode
   *  ignores it — it is only ever pushed from CustomerDetail. */
  returnRouteName: AddCustomerReturnRouteName;
  /** Present = edit mode: the request is a diff PATCH, not a create POST. */
  customerId?: string;
};

export function useCreateCustomer({ navigation, returnRouteName, customerId }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // While the request is in flight, hardware/gesture back is blocked — the old
  // Modal-based AddCustomerSheet vetoed it via `onRequestClose`; on a full
  // page only a navigation guard covers the gesture path (the header back
  // button's `disabled` does not). Without it the screen pops mid-request,
  // the resolve still lands (`upsertCustomer` + possible NewJob redirect)
  // and a retry of the same phone then 409s. The listener re-arms on every
  // `submitting` flip, so navigation is free again once the request settles.
  const bypassBackGuardRef = useRef(false);

  useEffect(() => {
    if (!submitting) return;
    return navigation.addListener('beforeRemove', e => {
      // The screen's OWN post-save navigation (goBack / navigate to NewJob)
      // dispatches while `submitting` is still true — the listener is only
      // disarmed by the next render, after React Navigation has already
      // evaluated the removal. A prevented removal is never retried, so
      // without this bypass a successful save would leave the screen open.
      if (bypassBackGuardRef.current) return;
      e.preventDefault();
    });
  }, [submitting, navigation]);

  const handleSubmit = useCallback(
    async (request: CreateCustomerRequest | UpdateCustomerRequest) => {
      if (submitting) return;
      setSubmitting(true);
      setSubmitError('');
      // Capture the reset epoch before the await: a concurrent request's 401
      // can tear the session down while the request is in flight. Everything
      // after the response — store write, refresh, navigation — must then be
      // skipped (see services/resetRegistry.ts).
      const epochAtStart = currentResetEpoch();
      try {
        // Add mode is the only caller that holds a CreateCustomerRequest —
        // the edit branch never carries the phone keys, so the cast is the
        // branch condition restated for the type system.
        const saved = customerId
          ? await customerService.update(customerId, request)
          : await customerService.create(request as CreateCustomerRequest);

        // The customer was written server-side even if the session died
        // mid-flight — the next session's first load picks it up. But its
        // post-response steps belong to a session that no longer exists.
        if (currentResetEpoch() !== epochAtStart) return;

        // Pushed into the shared store directly rather than waiting on a
        // refetch: `Customers`'s list (and `NewJob`'s picker) both read this
        // same store, so this is instantly visible to whichever screen goes
        // back to it — no return-params round trip needed for `Customers`.
        // Add mode only: the PATCH response carries no derived
        // `jobCount`/`lastJobDate`, so upserting it would replace the row
        // with zeroed stats and reorder the list — edit's list update is
        // the forced refresh below (detail refetches on focus).
        if (!customerId) upsertCustomer(saved);
        // A failed refresh here is a stale-list problem, not a save failure —
        // the customer above is already saved server-side, so it must never
        // surface as a save error via the catch below. In edit it is also
        // the only list update; a swallowed failure just leaves the stale
        // row until the next focus refresh.
        await loadCustomers({ force: true }).catch(() => {});

        // This removal is our own — let the still-armed back guard through
        // (see its comment above).
        bypassBackGuardRef.current = true;
        if (returnRouteName === 'NewJob' && !customerId) {
          // popTo pops this screen off the stack and merges the param onto
          // the NewJob entry beneath it. React Navigation 7's plain `navigate`
          // no longer goes back to an existing screen — it PUSHES a new one,
          // which left AddCustomer stranded in the stack (it resurfaced after
          // New Job's post-create goBack). Unreachable in edit mode (never
          // pushed from NewJob) — the guard just keeps the two modes from
          // ever coupling.
          navigation.popTo(
            'NewJob',
            { createdCustomerId: saved.id },
            { merge: true },
          );
        } else {
          navigation.goBack();
        }
      } catch (err) {
        setSubmitError(
          customerId
            ? updateErrorMessage(err as ApiError)
            : createErrorMessage(err as ApiError),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, navigation, returnRouteName, customerId],
  );

  /** Any form edit clears a stale error — the user is most likely fixing
   *  exactly what the server complained about, so a 422 shouldn't sit under
   *  the form while they do. */
  const clearSubmitError = useCallback(() => setSubmitError(''), []);

  return { submitting, submitError, clearSubmitError, handleSubmit };
}