/**
 * ServicesOffCard — the red "your phone location is off" card shown at the
 * top of the picker sheet while device location services are off (red =
 * the cancelled/danger family — user decision 2026-10-18, made seeing the
 * strengthened amber live: the owner wants this state to read as "not
 * good"). Plain-English copy, never the word "permission". Announces the
 * named cause to screen readers when it appears.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { MapPinOff } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

/** Frozen copy (ux-map-pin-picker-2026-10-18) — UX-corrected per research:
 *  the services-off card names the device toggle, never "permission". */
const SERVICES_OFF_TITLE = 'Your phone location is off';
const SERVICES_OFF_BODY =
  'Please turn on location in your phone settings. This helps us find the correct place.';

export default function ServicesOffCard() {
  // Screen readers announce the named cause when the card appears (the
  // AccessibilityInfo idiom from the punch button).
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${SERVICES_OFF_TITLE}. ${SERVICES_OFF_BODY}`);
  }, []);

  return (
    <View style={styles.offCard} accessibilityRole="alert">
      <View style={styles.offIconChip}>
        <MapPinOff size={20} color={colors.textOnColor} strokeWidth={2.2} />
      </View>
      <View style={styles.offCopy}>
        <Text style={styles.offBadge}>ACTION NEEDED</Text>
        <Text style={styles.offTitle}>{SERVICES_OFF_TITLE}</Text>
        <Text style={styles.offBody}>{SERVICES_OFF_BODY}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- Services-off layout (red = the cancelled/danger family — user
  //     decision 2026-10-18, made seeing the strengthened amber live: the
  //     owner wants this state to read as "not good", overriding the
  //     warning-amber research recommendation) ---
  offCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    padding: spacing.s3,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.status.cancelled.bg,
    borderColor: colors.status.cancelled.border,
  },
  offIconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.cancelled.solid,
  },
  offCopy: {
    flex: 1,
    gap: spacing.s1,
  },
  // The urgency micro-badge (the one allowed caps style — the eyebrow).
  offBadge: {
    ...typography.eyebrow,
    color: colors.status.cancelled.fg,
  },
  offTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  offBody: {
    ...typography.bodySm,
    color: colors.textBody,
  },
});
