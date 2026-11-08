/**
 * DeleteAccountConfirm — the pre-delete guard for "Delete account" on More.
 * Names the consequences for the viewer's role before the request is filed
 * (the Play User Data policy's in-app deletion path). Nothing deletes here:
 * the request lands in the platform-admin queue for review — the same row
 * the website files — and the app signs the person out once it is accepted
 * by the server. A failed send keeps the dialog up with a retry line added
 * to the message (text only — the dialog body is a Text node).
 */
import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react-native';
import { ConfirmDialog } from '../../../components/ui';
import { accountDeletionApi } from '../../../services';
import type { LoginRole } from '../../../services';
import { colors } from '../../../theme';
// Straight from the pure roles module, not the auth barrel — screens mock
// the barrel (it drags in hooks and stores), and roles.ts advertises direct
// imports for exactly this reason.
import { isAdminRole } from '../../auth/roles';

/** Everything the admin's company loses, then the review + sign-out posture. */
const ADMIN_CONSEQUENCES =
  "All of your company's data will be deleted — its jobs, photos, attendance and team records. Employees who work only for your company will be deleted with it.";

/** What an employee or viewer loses, and what the company is told. */
const MEMBER_CONSEQUENCES =
  "Your name, mobile number and sign-in details will be deleted, and your name will be removed from the records your company keeps. Your company's admin will be told you have left.";

const REVIEW_LINE =
  'Your request goes to our team for review first, and you will be signed out now.';

/** Appended after a failed send; the dialog stays up for a retry. */
const RETRY_LINE =
  'We could not send your request. Check your connection and try again.';

type Props = {
  visible: boolean;
  /** The viewer's role — the admin's copy names the company wipe. */
  role: LoginRole | null | undefined;
  /** Runs after the request is accepted — More signs the person out here. */
  onRequestFiled: () => void;
  /** Every non-confirm exit (scrim, X, Cancel). */
  onClose: () => void;
};

export function DeleteAccountConfirm({
  visible,
  role,
  onRequestFiled,
  onClose,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const onConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      await accountDeletionApi.requestAccountDeletion();
      setSubmitting(false);
      setFailed(false);
      onRequestFiled();
    } catch {
      // Keep the dialog up for a retry; the message names the failure.
      setSubmitting(false);
      setFailed(true);
    }
  }, [onRequestFiled]);

  const consequences = isAdminRole(role) ? ADMIN_CONSEQUENCES : MEMBER_CONSEQUENCES;

  return (
    <ConfirmDialog
      visible={visible}
      title="Delete your account?"
      message={failed ? `${consequences} ${REVIEW_LINE} ${RETRY_LINE}` : `${consequences} ${REVIEW_LINE}`}
      confirmLabel="Delete account"
      confirmVariant="danger"
      icon={<Trash2 size={20} color={colors.danger} strokeWidth={2} />}
      cancelLabel="Cancel"
      submitting={submitting}
      onConfirm={() => void onConfirm()}
      onCancel={() => {
        // A fresh open must not carry the last failure's retry line.
        setFailed(false);
        onClose();
      }}
    />
  );
}
