/**
 * TechNewCustomerCard — the "New customer" mode's body on the employee
 * create-job form (Epic 22). Replaces the retired inline mini-form: the
 * details are collected by the owner's full AddCustomer screen (map pin,
 * structured address, phone-book pick), dual-registered on the technician
 * stack in draft mode.
 *
 * Two states:
 * - no draft yet: a tappable prompt card that opens the form;
 * - a captured draft: a summary card (name, phone, address line) — tapping
 *   it reopens the form seeded with the capture, and "Remove" clears it
 *   back to the prompt (both recoverable, so removal is a plain text
 *   action, not a confirm).
 *
 * The card never POSTs — an employee JWT lacks `customer.write`; the draft
 * rides `POST /jobs`'s `newCustomer` payload and the find-or-create happens
 * server-side. Dumb by design: draft in, intents out.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, MapPin, User, X } from 'lucide-react-native';
import { colors, radius, spacing, touch, typography } from '../../../theme';
import { DIAL_CODE } from '../../../constants/phone';
import type { NewCustomerDraft } from '../../customers/types';

type Props = {
  draft: NewCustomerDraft | null;
  /** Open the add-customer form (fresh when no draft, seeded otherwise). */
  onOpen: () => void;
  /** Drop the captured draft back to the prompt card. */
  onRemove: () => void;
};

/** The one address line the card shows — what the job's serviceLocation
 *  derives from (the resolved pick's line when there is one, the typed
 *  street/city/area otherwise). Kept in ONE place so card and payload
 *  agree. `area` (the pincode line) counts: a pincode-only draft is a real
 *  location signal and the text-only path has nothing else. */
export function draftAddressLine(draft: NewCustomerDraft): string {
  if (draft.previewLine.trim()) return draft.previewLine.trim();
  return [draft.street.trim(), draft.city.trim(), draft.area.trim()]
    .filter(Boolean)
    .join(', ');
}

export function TechNewCustomerCard({ draft, onOpen, onRemove }: Props) {
  if (!draft) {
    return (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Add the customer's details"
        style={styles.prompt}>
        <View style={styles.promptIcon}>
          <User size={20} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.promptText}>
          <Text style={styles.promptTitle}>Add the customer's details</Text>
          <Text style={styles.promptSubtitle}>
            Name, phone and address — saved with the job
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    );
  }

  const addressLine = draftAddressLine(draft);

  return (
    <View style={styles.summaryWrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Change the customer details. ${draft.name}. ${addressLine}.`}
        style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryName}>{draft.name}</Text>
          <Text style={styles.summaryMeta}>
            {DIAL_CODE} {draft.phone}
          </Text>
          {addressLine ? (
            <View style={styles.summaryAddressRow}>
              <MapPin size={13} color={colors.textMuted} strokeWidth={2} />
              <Text numberOfLines={2} style={styles.summaryMeta}>
                {addressLine}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.changeText}>Change</Text>
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove the customer details"
        style={styles.remove}>
        <X size={14} color={colors.danger} strokeWidth={2.5} />
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    padding: spacing.s3,
    minHeight: touch.min + spacing.s2,
  },
  promptIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}14`,
  },
  promptText: {
    flex: 1,
    gap: 2,
  },
  promptTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  promptSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  summaryWrap: {
    gap: spacing.s2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    padding: spacing.s3,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  summaryName: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  summaryMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  summaryAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s1,
    marginTop: 2,
  },
  changeText: {
    ...typography.labelStrong,
    color: colors.primary,
  },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.s1,
    minHeight: touch.min,
    paddingHorizontal: spacing.s2,
  },
  removeText: {
    ...typography.labelStrong,
    color: colors.danger,
  },
});
