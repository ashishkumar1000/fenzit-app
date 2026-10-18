/**
 * OfficeListRow — one office in the Offices list. Identity header (icon tile,
 * name + status pill, chevron, the shift hours ONCE underneath, then the pin's
 * address when one was saved) over a single
 * stats panel of four columns (check-in distance · late cut-off · full day ·
 * half day), then the rule's valid-from date as a quiet footer line.
 *
 * Archived rows render read-only (muted, no press, neutral pill) — they are
 * grouped behind the screen's "Archived" disclosure/tab and can never be
 * edited or re-archived (15-3 contract: archived offices PATCH to 404,
 * never unarchive).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, CalendarDays, ChevronRight, Clock } from 'lucide-react-native';
import { Badge, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatLongDate } from '../../../utils';
import AddressMapBackdrop from './AddressMapBackdrop';
import OfficeCardBackdrop from './OfficeCardBackdrop';
import type { Office } from '../../../types/office';

type Props = {
  office: Office;
  /** Archived rows are display-only. */
  onPress?: () => void;
};

/** Today's timing summary — "09:00 – 18:00", or the honest gap. */
export function officeTimingSummary(office: Office): string {
  if (!office.rule) return 'Timing not set';
  return `${office.rule.startTime} – ${office.rule.endTime}`;
}

/**
 * The address as the card shows it: the place without the country and the
 * "State 560066" tail ("Mana Placido Apartments, Pattandur Agrahara,
 * Whitefield, Bengaluru"), so it fits two lines. The full text stays on the
 * edit screen and in the card's spoken label. Falls back to the whole address
 * when trimming would leave nothing.
 */
export function officeCardAddress(address: string): string {
  const parts = address.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length > 2 && /^(india)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length > 2 && /\d{5,6}$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(', ') || address;
}

type StatProps = { label: string; value: string; tone?: 'late'; muted: boolean };

function Stat({ label, value, tone, muted }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === 'late' && !muted && styles.statValueLate,
          muted && styles.textArchived,
        ]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function OfficeListRow({ office, onPress }: Props) {
  const archived = office.archivedAt !== null;
  const rule = office.rule;
  const footerText = archived
    ? `Archived ${formatLongDate((office.archivedAt ?? '').slice(0, 10))}`
    : rule?.validFrom
      ? `Valid from ${formatLongDate(rule.validFrom)}`
      : null;
  const address = office.formattedAddress?.trim() || null;
  return (
    <Card padding="none" style={archived ? styles.cardArchived : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Office ${office.name}${address ? `, ${address}` : ''}`}
        accessibilityState={archived ? { disabled: true } : undefined}
        onPress={onPress}
        disabled={archived}
        style={({ pressed }) => [styles.row, pressed && !archived && styles.rowPressed]}>
        {archived ? null : <OfficeCardBackdrop />}
        <View style={styles.header}>
          <View style={styles.iconTile}>
            <Building2 size={20} color={colors.primary} strokeWidth={1.8} />
          </View>
          <View style={styles.texts}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, archived && styles.textArchived]} numberOfLines={1}>
                {office.name}
              </Text>
              <Badge status={archived ? 'neutral' : 'done'} tone="soft" size="sm" dot>
                {archived ? 'Archived' : 'Active'}
              </Badge>
            </View>
            <View style={styles.timeRow}>
              <Clock size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.time} numberOfLines={1}>
                {officeTimingSummary(office)}
              </Text>
            </View>
          </View>
          {archived ? null : <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />}
        </View>

        {address ? (
          <View style={styles.addressRow}>
            <AddressMapBackdrop />
            <Text style={[styles.address, archived && styles.textArchived]} numberOfLines={2}>
              {officeCardAddress(address)}
            </Text>
          </View>
        ) : null}

        <View style={styles.stats}>
          <Stat label="Check-in" value={`${office.radiusM} m`} muted={archived} />
          {rule ? (
            <>
              <View style={styles.divider} />
              <Stat
                label="Late after"
                value={`${rule.lateCutoffMinutes} min`}
                tone="late"
                muted={archived}
              />
              <View style={styles.divider} />
              <Stat label="Full day" value={`${rule.fullDayHours} hrs`} muted={archived} />
              <View style={styles.divider} />
              <Stat label="Half day" value={`${rule.halfDayHours} hrs`} muted={archived} />
            </>
          ) : null}
        </View>

        {footerText ? (
          <View style={styles.footer}>
            <CalendarDays size={13} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.footerText}>{footerText}</Text>
          </View>
        ) : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardArchived: {
    opacity: 0.7,
  },
  row: {
    padding: spacing.s4,
    borderRadius: radius.md,
    gap: spacing.s3,
  },
  rowPressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: spacing.s1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  name: {
    ...typography.heading,
    flexShrink: 1,
    color: colors.textStrong,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  time: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  // The pin's address: its own full-width line under the header, on a soft
  // blue street-map chip.
  addressRow: {
    justifyContent: 'center',
    minHeight: 52,
    paddingLeft: spacing.s3,
    paddingRight: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  address: {
    ...typography.bodySm,
    color: colors.textStrong,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfacePage,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s2,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.s1,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  statValueLate: {
    color: colors.status.scheduled.fg,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.borderDefault,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  textArchived: {
    color: colors.textMuted,
  },
});
