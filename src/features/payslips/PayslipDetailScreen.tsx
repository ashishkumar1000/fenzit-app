/**
 * PayslipDetailScreen — one payslip's detail + PDF download (story
 * 23-12). Month-keyed route param; every render is a fresh GET (the
 * presigned URL regenerates per read — never cached client-side).
 *
 * Layout: hero card (month, slip number, net pay, paid/LOP), Earnings
 * card (lines + gross), Deductions card (machine sources labelled via
 * the model's map + total), the as-of-lock leave-balances section
 * (omitted when the BE's array is empty), warnings as notices, and the
 * bottom-anchored PDF button whose label/state follows the live
 * `pdf.status` through the hook's three-state tap.
 *
 * The BE's branched 404 copy renders verbatim (not run / not locked /
 * not yours) — this screen never rewords a server reason.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import {
  Button,
  Card,
  InlineError,
  InlineNotice,
  Skeleton,
} from '../../components/ui';
import { colors, spacing, typography } from '../../theme';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import ScreenHeader from '../attendance/offices/ScreenHeader';
import { formatRupee } from '../../utils/formatRupee';
import { usePayslipDetail } from './usePayslipDetail';
import {
  balanceCaption,
  balanceRemainingCopy,
  deductionLabel,
  formatDayMonthLong,
  formatDays,
  formatMonthLong,
} from './payslipModel';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'MyPayslipDetail'>;

/** One money line row (name + right-aligned amount). */
function MoneyRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, strong ? styles.moneyStrong : null]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.moneyValue, strong ? styles.moneyStrong : null]}>
        {formatRupee(amount)}
      </Text>
    </View>
  );
}

export default function PayslipDetailScreen({ navigation, route }: Props) {
  const month = route.params.month;
  const detail = usePayslipDetail(month);

  // Every focus re-reads: a returning visit mints a fresh presign, which
  // is what keeps a ~10-min-expired URL unreachable from the UI.
  useFocusEffect(
    useCallback(() => {
      void detail.loadDetail();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the hook is month-stable
    }, [detail.loadDetail]),
  );

  const payslip = detail.payslip;

  // The button's posture follows the live pdf status (the hook's
  // three-state tap owns what a tap does).
  const pdfStatus = payslip?.pdf.status ?? 'none';
  const pdfLabel =
    detail.pdfBusy && (pdfStatus === 'queued' || pdfStatus === 'running')
      ? 'Preparing PDF…'
      : pdfStatus === 'ready'
        ? 'Open PDF'
        : pdfStatus === 'failed'
          ? 'Try again'
          : 'Download PDF';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title={formatMonthLong(month)} onBack={() => navigation.goBack()} />
      {detail.isLoading ? (
        <View style={styles.body}>
          <Skeleton rows={4} />
        </View>
      ) : detail.error ? (
        <View style={styles.body}>
          <InlineError message={detail.error} />
          <Button variant="secondary" onPress={() => void detail.loadDetail()}>
            Retry
          </Button>
          <Button variant="ghost" onPress={() => navigation.goBack()}>
            Go back
          </Button>
        </View>
      ) : payslip ? (
        <>
          {/* The payslip is naturally taller than one screen (hero + two
              cards + the balances section) — a ScrollView, not a clipped
              View (device-pass finding). */}
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <Card style={styles.hero}>
              <Text style={styles.heroMonth}>{formatMonthLong(payslip.month)}</Text>
              <Text style={styles.heroSlip}>Slip {payslip.slipNumber}</Text>
              <Text style={styles.heroAmount}>{formatRupee(payslip.netWages)}</Text>
              <Text style={styles.heroNet}>Net pay</Text>
              <Text style={styles.heroDays}>
                {formatDays(payslip.paidDays)} paid days
                {payslip.lopDays > 0 ? ` · ${formatDays(payslip.lopDays)} LOP` : ''}
                {payslip.wagePeriodStart && payslip.wagePeriodEnd
                  ? ` · ${formatDayMonthLong(payslip.wagePeriodStart)} – ${formatDayMonthLong(payslip.wagePeriodEnd)}`
                  : ''}
              </Text>
            </Card>

            {payslip.warnings.length > 0
              ? payslip.warnings.map(warning => (
                  <InlineNotice key={warning} message={warning} tone="neutral" />
                ))
              : null}

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Earnings</Text>
              {payslip.earningLines.map(line => (
                <MoneyRow key={line.name} label={line.name} amount={line.amount} />
              ))}
              <MoneyRow label="Gross earnings" amount={payslip.grossEarnings} strong />
            </Card>

            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Deductions</Text>
              {payslip.deductionLines.length > 0 ? (
                payslip.deductionLines.map(line => (
                  <MoneyRow
                    key={`${line.source}:${line.amount}`}
                    label={deductionLabel(line.source)}
                    amount={line.amount}
                  />
                ))
              ) : (
                <Text style={styles.emptyLines}>No deductions this month.</Text>
              )}
              <MoneyRow label="Total deductions" amount={payslip.totalDeductions} strong />
            </Card>

            {payslip.leaveBalances.length > 0 ? (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Leave balances (as of month end)</Text>
                {payslip.leaveBalances.map(balance => (
                  <View key={balance.code} style={styles.balanceRow}>
                    <View style={styles.balanceHead}>
                      <Text style={styles.balanceName} numberOfLines={1}>
                        {balance.name}
                      </Text>
                      <Text style={styles.balanceRemaining}>
                        {balanceRemainingCopy(balance.remaining)}
                      </Text>
                    </View>
                    <Text style={styles.balanceCaption}>
                      {balanceCaption(balance.accrued, balance.availed, balance.carryForward)}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {detail.openError ? <InlineError message={detail.openError} /> : null}
            {detail.pdfNotice ? <InlineNotice message={detail.pdfNotice} tone="neutral" /> : null}
            <Button
              size="lg"
              fullWidth
              loading={detail.isOpening || detail.pdfBusy}
              disabled={detail.isOpening || detail.pdfBusy}
              onPress={detail.downloadPdf}>
              {pdfLabel}
            </Button>
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  body: {
    flex: 1,
    padding: spacing.s4,
    gap: spacing.s3,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  hero: {
    gap: spacing.s1,
  },
  heroMonth: {
    ...typography.bodyStrong,
    color: colors.textMuted,
  },
  heroSlip: {
    ...typography.caption,
    color: colors.textMuted,
  },
  heroAmount: {
    ...typography.title,
    color: colors.textStrong,
    marginTop: spacing.s1,
  },
  heroNet: {
    ...typography.caption,
    color: colors.textMuted,
  },
  heroDays: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.s2,
  },
  section: {
    gap: spacing.s2,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  moneyLabel: {
    ...typography.body,
    color: colors.textBody,
    flex: 1,
  },
  moneyValue: {
    ...typography.body,
    color: colors.textBody,
  },
  moneyStrong: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  emptyLines: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  balanceRow: {
    gap: 2,
  },
  balanceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  balanceName: {
    ...typography.body,
    color: colors.textBody,
    flex: 1,
  },
  balanceRemaining: {
    ...typography.bodyStrong,
    color: colors.textStrong,
  },
  balanceCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.s4,
    gap: spacing.s3,
    backgroundColor: colors.surfaceCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
