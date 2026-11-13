/**
 * ProfileActionRow — the Profile tab's tappable row (the 2026-11 redesign):
 * a 40px rounded-square icon tile, the label, and a chevron (rows here all
 * navigate, so the chevron is earned). Danger rows (Delete account, Log
 * out) tint the icon tile and label; a busy row swaps the chevron for a
 * spinner (the photo-upload row).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  /** Upload in flight — spinner instead of chevron, row not tappable. */
  busy?: boolean;
  /** Danger action — danger-tinted icon tile and label. */
  danger?: boolean;
};

export function ProfileActionRow({ icon, label, onPress, busy, danger }: Props) {
  return (
    <Card
      padding="md"
      interactive
      elevated={false}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      accessibilityLabel={label}
      // Disabled because of an upload needs its reason spoken, not just
      // "disabled" (Sally review 2026-11-13).
      accessibilityHint={busy ? 'Working, try again in a moment' : undefined}
      style={styles.row}>
      <View style={[styles.iconBox, danger ? styles.iconBoxDanger : null]}>
        {icon}
      </View>
      <Text style={[styles.label, danger ? styles.labelDanger : null]}>{label}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <ChevronRight
          size={18}
          color={danger ? colors.danger : colors.textMuted}
          strokeWidth={2}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxDanger: {
    backgroundColor: colors.status.rejected.bg,
  },
  label: {
    ...typography.body,
    color: colors.textStrong,
    flex: 1,
  },
  labelDanger: {
    color: colors.danger,
    fontWeight: '600',
  },
});
