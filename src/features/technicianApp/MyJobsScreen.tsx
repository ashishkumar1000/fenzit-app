/**
 * MyJobsScreen — the employee's "My jobs" record as a full screen
 * (2026-11-13, user request): the Profile tab keeps a single entry card and
 * this screen holds the details — the 7/30 window control, the outcome
 * tiles, the approval-rate and average-wait rows, the Assigned/Completed
 * lanes and the rejection reasons. Moving the expansion off the Profile tab
 * de-clutters it while the entry point stays in the same place.
 *
 * Root-stack route (sibling of TechJobDetail — covers the tab bar), pushed
 * from the Profile tab's card. The data lives in `MyJobsDetails`, which
 * calls `useMyJobReport` itself.
 */
import { ScrollView, StatusBar, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { IconButton } from '../../components/ui';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '../../theme';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import MyJobsDetails from './components/MyJobsDetails';
import { useMyJobReport } from './useMyJobReport';

type Props = NativeStackScreenProps<TechnicianRootStackParamList, 'TechMyJobs'>;

export default function MyJobsScreen({ navigation }: Props) {
  // The report hook lives here so the pull-to-refresh can drive it; the
  // details body renders the state (2026-11-13 review: the record had no
  // manual refresh at all — only the window switch or the error Retry).
  const myJobs = useMyJobReport(true);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Sibling root-stack screens set this (NotificationsScreen, the
          app's back-header pattern). */}
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          label="Go back"
          size="md"
          variant="ghost"
          onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        {/* Left-aligned next to the back button — the app's back-header
            pattern (TechJobDetail, Notifications); a centred title needed a
            spacer hack and matched nobody. */}
        <Text style={styles.title} numberOfLines={1}>
          My jobs
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={myJobs.isLoading}
            onRefresh={() => myJobs.refresh()}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        <MyJobsDetails state={myJobs} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    // The pattern's hairline: the header separates from the page it opens.
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.heading,
    color: colors.textStrong,
    flex: 1,
  },
  content: {
    padding: spacing.s4,
    paddingBottom: spacing.s6,
  },
});
