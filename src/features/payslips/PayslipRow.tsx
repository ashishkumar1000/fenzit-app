/**
 * PayslipRow — one row of the payslips list (story 23-12). A Card
 * composing the design-system Badge (the fixed status vocabulary via
 * `payslipPdfBadge`) with the month, the net-pay figure and the paid/LOP
 * line. Every row is tappable — the detail GET owns the branched 404s,
 * so the list never gates on the pdf state (a month listed by the BE is
 * always worth opening).
 */
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Card } from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { PayslipView } from '../../services';
import { formatRupee } from '../../utils/formatRupee';
import { formatMonthLong, payslipDaysCopy, payslipPdfBadge } from './payslipModel';

type Props = {
  item: PayslipView;
  onPress?: (item: PayslipView) => void;
};

export function PayslipRow({ item, onPress }: Props) {
  const badge = payslipPdfBadge(item.pdf.status);
  return (
    <Card interactive onPress={() => onPress?.(item)} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {formatMonthLong(item.month)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {payslipDaysCopy(item.paidDays, item.lopDays)}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.amount}>{formatRupee(item.netWages)}</Text>
          {badge ? (
            <Badge status={badge.status} size="sm">
              {badge.label}
            </Badge>
          ) : null}
        </View>
      </View>
      <Text style={styles.slip} numberOfLines={1}>
        Slip {item.slipNumber}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.s1,
  },
  amount: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  slip: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
