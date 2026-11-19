/**
 * PayslipsScreen — the employee's payslip history (story 23-12). A
 * full-screen route on the technician stack, opened from the Profile
 * tab's Payslips row. The BE answers locked months only, newest first —
 * the screen renders exactly that list and nothing else: no payroll
 * admin UI, no gating math, and `[]` is the honest "nothing locked yet"
 * state, never an error.
 *
 * States: Skeleton on first load, EmptyState before the first lock,
 * InlineError + Retry on failure, pull-to-refresh force reload. A failed
 * REFRESH with rows already on screen never blanks the list — the error
 * renders as a banner + Retry above the kept rows (stale rows beat a
 * blank screen); the full-screen error block is for a failed FIRST load.
 * Row tap pushes PayslipDetailScreen (month-keyed — the client never keys
 * anything off membershipId/runId; own-payslip-only is the API's
 * enforcement, never assumed here).
 */
import { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Receipt } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, InlineError, Skeleton } from '../../components/ui';
import { colors, spacing } from '../../theme';
import type { PayslipView } from '../../services';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import ScreenHeader from '../attendance/offices/ScreenHeader';
import { PayslipRow } from './PayslipRow';
import { useMyPayslips } from './useMyPayslips';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'MyPayslips'>;

export default function PayslipsScreen({ navigation }: Props) {
  const { payslips, isLoading, isRefreshing, error, load, refresh } =
    useMyPayslips();

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openDetail = useCallback(
    (item: PayslipView) => {
      navigation.navigate('MyPayslipDetail', { month: item.month });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Payslips" onBack={() => navigation.goBack()} />
      {isLoading ? (
        <View style={styles.body}>
          <Skeleton rows={3} />
        </View>
      ) : error && payslips.length === 0 ? (
        <View style={styles.body}>
          <InlineError message={error} />
          <Button variant="secondary" onPress={refresh}>
            Retry
          </Button>
        </View>
      ) : payslips.length === 0 ? (
        <View style={styles.body}>
          <EmptyState
            icon={<Receipt size={22} color={colors.textMuted} strokeWidth={2} />}
            title="No payslips yet"
            description="Yours will appear here after payroll runs."
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={payslips}
          keyExtractor={item => item.month}
          renderItem={({ item }) => <PayslipRow item={item} onPress={openDetail} />}
          ListHeaderComponent={
            error ? (
              /* Refresh failed with rows on screen — banner above the kept
                 rows; the list never blanks (Sally review F2). */
              <View style={styles.staleHead}>
                <InlineError message={error} />
                <Button variant="secondary" onPress={refresh}>
                  Retry
                </Button>
              </View>
            ) : undefined
          }
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
          }
        />
      )}
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
  list: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  staleHead: {
    gap: spacing.s3,
  },
});
