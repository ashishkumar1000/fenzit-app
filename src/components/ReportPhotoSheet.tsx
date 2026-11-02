/**
 * ReportPhotoSheet — the reason sheet opened from a job photo's Report action.
 *
 * A report does not hide the photo. It goes to Fenzit's review queue, and a
 * platform admin decides. Reporting the same photo again is harmless: the
 * server returns the first report.
 *
 * Rendered by the screen that hosts the photo viewer (the viewer closes
 * before this sheet opens, because two native presentations cannot stack).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Button, InlineError, InlineNotice, Input, Sheet } from './ui';
import { colors, radius, spacing, touch, typography } from '../theme';
import {
  attachmentService,
  type PhotoReportReason,
} from '../services/resources/attachments';
import {
  FALLBACK_ERROR_MESSAGE,
  type ApiError,
} from '../services/api/apiError';

const REASONS: readonly { value: PhotoReportReason; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'spam', label: 'Spam or unrelated photo' },
  { value: 'other', label: 'Something else' },
];

const NETWORK_MESSAGE =
  'No connection or the request timed out. Check your network and try again.';
const GONE_MESSAGE =
  'This photo is no longer available. Go back to the job and refresh.';
const NOT_ALLOWED_MESSAGE = "This photo can't be reported from this account.";
const INVALID_MESSAGE = 'Check the reason and note, then try again.';

/** Fixed, plain-English copy per status. Server wording is never shown. */
function errorCopy(status: number): string {
  if (status === 0) return NETWORK_MESSAGE;
  if (status === 404) return GONE_MESSAGE;
  if (status === 403) return NOT_ALLOWED_MESSAGE;
  if (status === 422) return INVALID_MESSAGE;
  return FALLBACK_ERROR_MESSAGE;
}

type Props = {
  visible: boolean;
  /** Job the photo belongs to. */
  jobId: string;
  /** Photo being reported; null while nothing is selected. */
  attachmentId: string | null;
  onClose: () => void;
};

export function ReportPhotoSheet({
  visible,
  jobId,
  attachmentId,
  onClose,
}: Props) {
  const [reason, setReason] = useState<PhotoReportReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Every open starts from a blank form.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
      setSent(false);
    }
  }, [visible, attachmentId]);

  const submit = async () => {
    if (!reason || !attachmentId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await attachmentService.reportPhoto(
        jobId,
        attachmentId,
        reason,
        note.trim() || undefined,
      );
      setSent(true);
    } catch (e) {
      setError(errorCopy((e as ApiError).status));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Report photo"
      subtitle="Fenzit reviews every report. Tell us what is wrong."
      dismissible={!submitting}
    >
      {sent ? (
        <View style={styles.body}>
          <InlineNotice
            tone="success"
            message="Thanks. We will review this photo."
          />
          <Button fullWidth onPress={onClose}>
            Done
          </Button>
        </View>
      ) : (
        <View style={styles.body}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Reason for report"
          >
            {REASONS.map(option => {
              const selected = reason === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: selected,
                    disabled: submitting,
                  }}
                  disabled={submitting}
                  onPress={() => setReason(option.value)}
                  style={[
                    styles.reason,
                    selected ? styles.reasonSelected : null,
                  ]}
                >
                  <Text style={styles.reasonLabel}>{option.label}</Text>
                  {selected ? (
                    <Check size={20} color={colors.primary} strokeWidth={2} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Input
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="What should we look at?"
            helper="Up to 500 characters"
            maxLength={500}
            multiline
            editable={!submitting}
          />
          {error ? <InlineError message={error} /> : null}
          <Button
            fullWidth
            disabled={!reason || submitting}
            loading={submitting}
            onPress={submit}
          >
            Send report
          </Button>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s3,
    paddingBottom: spacing.s2,
  },
  reason: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  reasonSelected: {
    borderColor: colors.primary,
  },
  reasonLabel: {
    ...typography.body,
    color: colors.textStrong,
  },
});
