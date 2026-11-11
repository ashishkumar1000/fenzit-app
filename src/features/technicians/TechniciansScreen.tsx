/**
 * TechniciansScreen — full-screen route (pushed over the tabs). Shows the
 * zero-data empty state for a new account, or the technician list once the
 * owner has invited their team. The header "Add" button opens the
 * AddTechnicianSheet; Home's "Add employee" quick action lands here with
 * that sheet already open (`autoOpenAdd` param).
 *
 * The roster it renders is the shared profile store's mirror (`GET /users/me`
 * is what fills it) — this screen can be the FIRST consumer after a cold
 * start, so it drives the refresh itself and owns the feedback for the wait
 * (story 20-1 loading-feedback sweep): a spinner while the roster is still
 * in flight, an error + retry when it fails, and pull-to-refresh on every
 * scrollable posture (review 2026-10-01): rows, the empty state AND the
 * first-load error — the pull works wherever content can wait. A failed
 * refresh over populated rows says so (an inline banner above the list —
 * rows stay on screen, the 15-6 precedent), never silently.
 */
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, HardHat, Search, UserPlus } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, InlineError, Skeleton } from '../../components/ui';
import { colors, radius, spacing, touch, typography } from '../../theme';
import { matchesTechnicianQuery } from './format';
import type { RootStackParamList } from '../../navigation/types';
import { useTechnicians } from './useTechnicians';
import { AddTechnicianSheet } from './components/AddTechnicianSheet';
import { TechnicianRow } from './components/TechnicianRow';
import { useMyProfile } from '../profile';
import { useCanWrite, useSessionRole } from '../auth';
import { isAdminRole } from '../auth/roles';
import type { NewTechnicianInput } from './types';

type Props = NativeStackScreenProps<RootStackParamList, 'Technicians'>;

export default function TechniciansScreen({ navigation, route }: Props) {
  const { technicians, hasTechnicians, add } = useTechnicians();
  const { isLoading, error: loadError, refresh } = useMyProfile();
  // The roster is readable by a viewer; inviting is not. The Add button and
  // the Add sheet are not rendered for them (no auto-open either).
  const canWrite = useCanWrite();
  // Resend (invite SMS) is a company-admin action; the server checks again.
  const canResend = isAdminRole(useSessionRole());
  // Home's "Add employee" quick action pushes us with `autoOpenAdd` — read
  // once as the initial state, so the sheet never re-opens on later visits
  // (stack params are per-push, but a re-render must not reset a user-closed
  // sheet either).
  const [sheetVisible, setSheetVisible] = useState(
    canWrite && (route.params?.autoOpenAdd ?? false),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Search narrows the list only; the counts always describe the whole team.
  const [query, setQuery] = useState('');
  const activeCount = technicians.filter(t => t.status === 'active').length;
  const offlineCount = technicians.length - activeCount;
  const needle = query.trim().toLowerCase();
  // The same match rule as the New Job picker (format.ts), so both lists agree.
  const visibleTechnicians = needle
    ? technicians.filter(t =>
        matchesTechnicianQuery(
          { name: t.name, phoneNumber: t.phone, employeeCode: t.employeeCode },
          query,
        ),
      )
    : technicians;
  // The latch is a REF, not the spinner state — a same-tick double pull
  // would pass a state guard twice before React re-renders (the race the
  // 20-1 sweep latches guard everywhere else too).
  const refreshingRef = useRef(false);
  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [refresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );

  const handleSubmit = async (input: NewTechnicianInput) => {
    // Deliberately not caught here: rejects with `ApiError`, and
    // AddTechnicianSheet needs that rejection to keep itself open and show
    // the error instead of closing on a failed invite.
    await add(input);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textStrong} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Employees</Text>
        </View>

        {canWrite ? (
          <Button
            variant="primary"
            size="md"
            onPress={() => setSheetVisible(true)}
            leadingIcon={<UserPlus size={18} color={colors.onPrimary} strokeWidth={2.5} />}>
            Add
          </Button>
        ) : null}
      </View>

      {isLoading && !hasTechnicians ? (
        // First load with nothing persisted yet: a roster-shaped shimmer
        // (skeleton over spinner, per the loading-feedback sweep) instead of
        // the empty state, which would read as a confident "no team".
        <View style={styles.skeleton} accessibilityLabel="Loading employees">
          <Skeleton rows={5} height={76} />
        </View>
      ) : !hasTechnicians && loadError ? (
        // The error posture is scrollable too — the same pull retries.
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.center}
          refreshControl={refreshControl}>
          <InlineError message="Couldn't load your team. Check your connection and try again." />
          <Button variant="secondary" onPress={() => void refresh()}>
            Try again
          </Button>
        </ScrollView>
      ) : hasTechnicians ? (
        <>
          <View style={styles.toolbar}>
            <View style={styles.searchField}>
              <Search size={20} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search employees..."
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search employees"
                autoCorrect={false}
                clearButtonMode="while-editing"
                style={styles.searchInput}
              />
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryTotal}>
                {technicians.length} {technicians.length === 1 ? 'employee' : 'employees'}
              </Text>
              <Text style={styles.summaryDot}>·</Text>
              <View style={styles.summaryItem}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={[styles.summaryText, { color: colors.success }]}>
                  {activeCount} active
                </Text>
              </View>
              <Text style={styles.summaryDot}>·</Text>
              <View style={styles.summaryItem}>
                <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                <Text style={styles.summaryText}>{offlineCount} offline</Text>
              </View>
            </View>
          </View>
        <FlatList
          data={visibleTechnicians}
          ListEmptyComponent={
            needle ? (
              <Text style={styles.noMatch}>No employees match "{query.trim()}".</Text>
            ) : undefined
          }
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TechnicianRow technician={item} canResend={canResend} />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          // A failed pull over live rows says so above them; the rows
          // never get cleared out of the way.
          ListHeaderComponent={
            loadError != null && !isRefreshing ? (
              <InlineError message="Couldn't refresh your team. Check your connection and try again." />
            ) : undefined
          }
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        />
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.center}
          refreshControl={refreshControl}>
          <EmptyState
            icon={<HardHat size={36} color={colors.primary} strokeWidth={1.5} />}
            title="No employees yet"
            description={
              canWrite
                ? "Add your team so you can assign jobs to them. They'll get an SMS invite to download the Fenzit app."
                : 'Your company admin has not added anyone yet.'
            }
          />
        </ScrollView>
      )}

      {canWrite ? (
        <AddTechnicianSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          onSubmit={handleSubmit}
        />
      ) : null}
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flex: 1,
  },
  backButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: touch.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
  },
  toolbar: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s2,
    gap: spacing.s3,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textStrong,
    paddingVertical: spacing.s2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  summaryTotal: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textStrong,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  summaryText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  summaryDot: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  dot: {
    width: spacing.s2,
    height: spacing.s2,
    borderRadius: radius.xs,
  },
  noMatch: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.s6,
  },
  listContent: {
    padding: spacing.s4,
  },
  separator: {
    height: spacing.s3,
  },
  center: {
    padding: spacing.s6,
    alignItems: 'center',
    gap: spacing.s3,
  },
  skeleton: {
    padding: spacing.s4,
  },
  scroll: {
    flex: 1,
  },
});
