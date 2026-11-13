/**
 * PendingQueue — the owner Jobs tab's Pending segment body (Epic 22 story
 * 4): the approval queue from `GET /approval-queue`, oldest submission
 * first. Its own FlatList (queue rows are not ApiJobs, so the jobs list's
 * renderer doesn't apply), with the same state grammar as the jobs list:
 * loader → error+retry → rows with pull-to-refresh and cursor loadMore.
 *
 * CAP-10 filters, user decision 2026-11-13 (scaled): the employee filter is
 * ONE chip that opens a searchable picker sheet (`EmployeeFilterSheet` — a
 * roster of name chips doesn't scale to 100 employees); the age filter is a
 * three-chip row. They combine.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, EmptyState, InlineError } from '../../../components/ui';
import { ClockIcon, UsersIcon } from '../icons';
import { colors, fontSize, radius, spacing, touch, weight } from '../../../theme';
import { ApprovalQueueCard } from './ApprovalQueueCard';
import { EmployeeFilterSheet } from './EmployeeFilterSheet';
import { setQueueFilter, useApprovalQueue } from '../useApprovalQueue';
import { useMyProfile } from '../../profile';

/** The age cut-offs the chip row offers (the endpoint accepts 1–8760). */
const AGE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'Any age', hours: null },
  { label: 'Over 24 hours', hours: 24 },
  { label: 'Over 3 days', hours: 72 },
];

type Props = {
  /** Opens the job detail for the review decision. */
  onOpenJob: (jobId: string) => void;
};

/** One filter chip — the StatusFilterBar's vocabulary (44px pill, soft-tint
 *  active). Disabled while the query loads so taps can't race it. */
function FilterChip({
  label,
  active,
  disabled,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : null,
        pressed && !disabled ? styles.chipPressed : null,
      ]}>
      {icon}
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PendingQueue({ onOpenJob }: Props) {
  const {
    items,
    isLoading,
    isLoadingMore,
    error,
    hasLoaded,
    employeeId,
    olderThanHours,
    refresh,
    loadMore,
  } = useApprovalQueue();
  // The employee filter picks from the owner's roster (server-issued ids) —
  // the sheet searches the whole roster, so an employee with no pending jobs
  // is still selectable ("show only what Amit created" must not depend on
  // Amit having created one).
  const { profile } = useMyProfile();
  const technicians = useMemo(
    () => (profile?.technicians ?? []).filter(t => t.status !== 'invited'),
    [profile],
  );
  const selectedTechnician = useMemo(
    () => technicians.find(t => t.id === employeeId) ?? null,
    [technicians, employeeId],
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const failedWithNoData = Boolean(error && items.length === 0 && hasLoaded);

  // Pull-to-refresh over rows on screen: the store keeps `isLoading` false,
  // so the spinner is local state — the same pattern as the jobs list.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  // A failed refresh with rows on screen: keep the queue, explain — the
  // dismissal is local, like the jobs list's banner (the store's error
  // clears on the next success).
  const [errorDismissed, setErrorDismissed] = useState(false);
  // A dismissal covers ONE failure: when the error changes (or clears and
  // returns), the banner must come back — a dismissed flag that survived
  // every later failure would render the second consecutive error as
  // silence (review 2026-11-13). Clearing also resets it, so the first
  // failure of a fresh attempt is announced.
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);
  const showBanner = Boolean(error) && items.length > 0 && !errorDismissed;

  const isFiltered = employeeId !== null || olderThanHours !== null;

  const clearFilters = useCallback(() => {
    void setQueueFilter(null, null);
  }, []);

  const applyEmployeeFilter = useCallback(
    (id: string | null) => {
      setFilterSheetOpen(false);
      void setQueueFilter(id, olderThanHours);
    },
    [olderThanHours],
  );

  const filterHeader = (
    <>
      {/* CAP-10 — one chip per axis. The employee chip opens the search
          sheet (its label names the current pick); the age chips are a
          plain three-option row. Disabled while the query loads so a
          mid-flight re-filter can't race the store. */}
      <View style={styles.filterRow}>
        <FilterChip
          // Honest label (review 2026-11-13): a filtered employee who has
          // since left the roster is no longer resolvable to a name — the
          // chip must not claim "All employees" while the list is filtered
          // to one person.
          label={
            selectedTechnician
              ? selectedTechnician.name
              : employeeId !== null
                ? 'Filtered employee'
                : 'All employees'
          }
          active={employeeId !== null}
          disabled={isLoading}
          icon={
            <UsersIcon
              size={15}
              color={employeeId !== null ? colors.primaryHover : colors.textMuted}
            />
          }
          onPress={() => setFilterSheetOpen(true)}
        />
        {AGE_OPTIONS.map(o => (
          <FilterChip
            key={o.label}
            label={o.label}
            active={olderThanHours === o.hours}
            disabled={isLoading}
            onPress={() => void setQueueFilter(employeeId, o.hours)}
          />
        ))}
      </View>
      {/* A failed refresh with rows on screen: keep the queue, explain. */}
      {showBanner ? (
        <View style={styles.bannerWrap}>
          <InlineError
            message={error ?? ''}
            onDismiss={() => setErrorDismissed(true)}
          />
        </View>
      ) : null}
    </>
  );

  // First load (or a filter change with nothing cached): the chip rows stay
  // mounted — only the list area shows the loader, so the filters never
  // blink out of existence mid-query.
  if (isLoading && items.length === 0 && !failedWithNoData) {
    return (
      <>
        {filterHeader}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  if (failedWithNoData) {
    return (
      <>
        {filterHeader}
        <View style={styles.centered}>
          {/* No onDismiss: with nothing on screen an X would only hide the
              message while the store still holds the error — Retry is the way
              out (the jobs list's banner rule). */}
          <InlineError message={error ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void refresh()}>
            Retry
          </Button>
        </View>
      </>
    );
  }

  return (
    <>
      {filterHeader}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ApprovalQueueCard item={item} onPress={onOpenJob} />
        )}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerSpinner}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : undefined // RN 0.87 list types reject `null` here
        }
        contentContainerStyle={[
          styles.listContent,
          items.length === 0 && styles.listContentEmpty,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          isFiltered ? (
            // A filtered empty is a different sentence from a bare queue:
            // "nothing waiting" is false when the owner just applied a
            // filter — nothing matches THIS filter.
            <EmptyState
              icon={<ClockIcon size={36} color={colors.primary} strokeWidth={1.5} />}
              title="Nothing matches this filter"
              description="No pending job fits the employee or age you picked."
              ctaLabel="Clear filters"
              ctaVariant="secondary"
              onPressCta={clearFilters}
            />
          ) : (
            <EmptyState
              icon={<ClockIcon size={36} color={colors.primary} strokeWidth={1.5} />}
              title="Nothing waiting for approval"
              description="Jobs your employees create wait here until you approve or reject them."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
      <EmployeeFilterSheet
        visible={filterSheetOpen}
        technicians={technicians}
        selectedId={employeeId}
        onSelect={applyEmployeeFilter}
        onClose={() => setFilterSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  chip: {
    // touch.min, not a smaller "designed" height — this row is the densest
    // tap surface in the feature and the DS floor for tap targets is 44px.
    height: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipLabel: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: colors.textBody,
  },
  chipLabelActive: {
    color: colors.primaryHover,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  bannerWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  footerSpinner: {
    paddingVertical: spacing.s4,
  },
  listContent: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s6,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.s3,
  },
});
