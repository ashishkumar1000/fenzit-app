/**
 * FormSectionCard — a grouped form section per Add Customer design v2: a
 * Card whose header is a tinted icon chip, a bold title, a muted subtitle
 * and (optionally) a red "Required *" badge on the trailing edge, with a
 * hairline divider before the fields.
 */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

type Props = {
  /** Small glyph rendered inside the tinted circle chip. */
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** Shows the red "Required *" badge on the header's trailing edge. */
  required?: boolean;
  children: ReactNode;
};

export function FormSectionCard({
  icon,
  title,
  subtitle,
  required = false,
  children,
}: Props) {
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.chip}>{icon}</View>
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {required ? <Text style={styles.required}>Required *</Text> : null}
      </View>
      <View style={styles.divider} />
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // Section cards sit on the page background — same surface, outlined.
    backgroundColor: colors.surfaceCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}14`,
  },
  heading: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  required: {
    ...typography.caption,
    color: colors.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginTop: spacing.s3,
    marginBottom: spacing.s4,
  },
});
