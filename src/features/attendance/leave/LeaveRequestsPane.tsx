/**
 * LeaveRequestsPane — the owner Requests pane's body (the two-tab Leave
 * redesign, 2026-11; the Stitch "Leave Requests" mobile screen). The data
 * orchestration lives in `useLeaveRequests` — the screen owns it (the
 * detail sheet's writes update the same reducer) and hands this pane the
 * hook object; the pane renders: the compact Apply-on-behalf row, the
 * search field (local raw text, the hook commits trimmed/debounced), the
 * six filter pills with their /summary counts (the numbers go quiet while
 * a search narrows the list — whole-tenant counts would contradict the
 * narrowed list), the "N total · M need review" line (hidden while a
 * search narrows the list — the web's round-4 rule — and when counts
 * failed), and the card list with the inline Approve + the sheet-opening
 * Decline/Revoke/detail callbacks. An empty non-All filter with requests
 * elsewhere offers the grounded "See all N requests" switch.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalendarOff, ChevronRight, Search, Users } from 'lucide-react-native';
import { Button, EmptyState, InlineError, InlineNotice, Input, Skeleton } from '../../../components/ui';
import { LeaveEmptyArt } from './LeaveEmptyArt';
import { ScrollFade } from './ScrollFade';
import { colors, radius, spacing, typography } from '../../../theme';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { LeaveRequestCard } from './LeaveRequestCard';
import {
  countsTotal,
  PILL_LABELS,
  type LeaveFilter,
} from './requestsModel';
import type { useLeaveRequests } from './useLeaveRequests';

/** The screen's write notice — rendered above the list, one at a time. */
export type RequestsWriteNotice =
  | { kind: 'handled'; message: string }
  | { kind: 'error'; message: string };

export function LeaveRequestsPane(input: {
  requests: ReturnType<typeof useLeaveRequests>;
  /** The inline Approve write in flight (the screen owns the latch). */
  approvingId: string | null;
  writeNotice: RequestsWriteNotice | null;
  onDismissNotice: () => void;
  onApplyOnBehalf: () => void;
  /** Opens LeaveDetailSheet's detail stage — from the card tap AND the
   *  Decline/Revoke buttons alike (the reason flow lives inside the
   *  sheet's own stages; no deep-stage param exists). */
  onOpenRequest: (request: LeaveRequestRow) => void;
  onApprove: (request: LeaveRequestRow) => void;
}) {
  const { requests, approvingId, writeNotice, onDismissNotice, onApplyOnBehalf, onOpenRequest, onApprove } = input;
  const { state, activeFilter } = requests;
  const page = state.pages[activeFilter];
  // The raw search text is the pane's — the hook only ever sees commits.
  // Seeded from the hook: the pane unmounts on a pane switch and the
  // committed needle survives it — an empty box over a filtered list
  // would hide the needle (the review, 2026-11-26).
  const [searchText, setSearchText] = useState(() => state.q);
  const counts = state.counts;
  const narrowed = state.q !== '';

  const pillCount = (filter: LeaveFilter): number | null => {
    if (!counts) return null;
    return filter === 'all' ? countsTotal(counts) : counts[filter];
  };

  /** The pill's screen-reader label: the word + its count ("All, 18
   *  requests", "Needs review, 3") — without it the two Texts read as one
   *  glued "Needs review3". The counts go quiet under a needle, with the
   *  visible numbers. */
  const pillA11yLabel = (filter: LeaveFilter): string => {
    const word = PILL_LABELS[filter];
    const count = pillCount(filter);
    if (count == null || narrowed) return word;
    return filter === 'all' ? `${word}, ${count} requests` : `${word}, ${count}`;
  };

  return (
    <View style={styles.pane}>
      <FlatList
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={page.items}
        keyExtractor={request => request.id}
        renderItem={({ item }) => (
          <LeaveRequestCard
            request={item}
            approving={approvingId === item.id}
            onPress={() => onOpenRequest(item)}
            onApprove={() => onApprove(item)}
            onDecline={() => onOpenRequest(item)}
            onRevoke={() => onOpenRequest(item)}
          />
        )}
        onEndReached={() => void requests.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply on behalf"
              onPress={onApplyOnBehalf}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
              <View style={styles.ctaIcon}>
                <Users size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              {/* One compact row — the CTA is parity, not the hero; the daily
                  job is the queue below it (the review P2). */}
              <Text style={styles.ctaTitle}>Apply on behalf</Text>
              <ChevronRight size={18} color={colors.onPrimary} style={styles.ctaChevron} />
            </Pressable>
            <Input
              value={searchText}
              onChangeText={raw => {
                setSearchText(raw);
                requests.searchInput(raw);
              }}
              placeholder="Search name, code, or reason"
              leadingIcon={<Search size={18} color={colors.textMuted} />}
              clearable
              maxLength={100}
              accessibilityLabel="Search leave requests"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}>
              {(
                Object.keys(PILL_LABELS) as LeaveFilter[]
              ).map(filter => {
                const active = filter === activeFilter;
                return (
                  <Pressable
                    key={filter}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={pillA11yLabel(filter)}
                    onPress={() => {
                      // The write notice belongs to the list being left — an
                      // 'already handled' line must not sit above an
                      // unrelated filter's list (the review, 2026-11-26).
                      onDismissNotice();
                      requests.switchFilter(filter);
                    }}
                    style={({ pressed }) => [
                      styles.pill,
                      active ? styles.pillActive : styles.pillIdle,
                      pressed && styles.pillPressed,
                    ]}>
                    <Text style={active ? styles.pillLabelActive : styles.pillLabelIdle}>
                      {PILL_LABELS[filter]}
                    </Text>
                    {/* The numbers are whole-tenant counts — under an active
                        needle they'd contradict the narrowed list, so they
                        go quiet with the totals line (the review P3). */}
                    {pillCount(filter) != null && !narrowed ? (
                      <Text style={active ? styles.pillCountActive : styles.pillCountIdle}>
                        {pillCount(filter)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          {counts && !narrowed ? (
            <Text style={styles.totalsLine}>
              {countsTotal(counts)} total · {counts.pending} need review
            </Text>
          ) : null}
          {writeNotice ? (
            writeNotice.kind === 'handled' ? (
              <InlineNotice message={writeNotice.message} tone="neutral" onDismiss={onDismissNotice} />
            ) : (
              <InlineError message={writeNotice.message} onDismiss={onDismissNotice} />
            )
          ) : null}
          {requests.refreshFailed === activeFilter && page.loaded ? (
            <InlineError message="Couldn't refresh. Showing the last loaded list." />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        !page.loaded && page.loading ? (
          <View style={styles.skeletonBlock} accessibilityLabel="Loading leave requests">
            <Skeleton rows={5} height={120} />
          </View>
        ) : !page.loaded ? (
          <View style={styles.stateBlock} accessibilityLiveRegion="polite">
            <InlineError message="Couldn't load leave requests. Check your connection and try again." />
            <Button variant="secondary" onPress={() => requests.fetchFirst(activeFilter)}>
              Retry
            </Button>
          </View>
        ) : page.items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              illustration={<LeaveEmptyArt />}
              icon={<CalendarOff size={24} color={colors.primary} strokeWidth={1.5} />}
              title={narrowed ? 'No matches' : 'No requests here'}
              description={
                narrowed
                  ? 'Try a different name, employee code, or reason.'
                  : 'Nothing matches this filter yet.'
              }
            />
            {/* One grounded next step when THIS filter is empty but the
                tenant has requests elsewhere (the review P2 — an empty
                Needs-review queue is a normal state; counts are already
                fetched). Grounded numbers only: no count, no button. */}
            {!narrowed && activeFilter !== 'all' && counts && countsTotal(counts) > 0 ? (
              <Button
                variant="secondary"
                onPress={() => {
                  onDismissNotice();
                  requests.switchFilter('all');
                }}>
                {`See all ${countsTotal(counts)} requests`}
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
      ListFooterComponent={
        page.loading && page.loaded && !requests.refreshing ? (
          <View style={styles.footerSpinner}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : undefined
      }
        refreshControl={
          <RefreshControl refreshing={requests.refreshing} onRefresh={requests.onRefresh} />
        }
      />
      <ScrollFade />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.s4,
    paddingHorizontal: spacing.s4,
    // The last card needs bottom clearance in BOTH hostings — pushed mode
    // fills to the gesture-bar edge (no tab bar), embedded mode ends at the
    // app tab bar. The Config pane already carries the same s8.
    paddingBottom: spacing.s8,
    gap: spacing.s3,
    flexGrow: 1,
  },
  listHeader: {
    gap: spacing.s3,
  },
  footerSpinner: {
    paddingVertical: spacing.s3,
  },
  stateBlock: {
    gap: spacing.s3,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonBlock: {
    gap: spacing.s3,
    paddingVertical: spacing.s10,
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.s3 - 2,
    paddingHorizontal: spacing.s4,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
    flex: 1,
  },
  ctaChevron: {
    opacity: 0.85,
  },
  pillRow: {
    gap: spacing.s2,
    paddingRight: spacing.s4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillIdle: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.borderSubtle,
  },
  pillPressed: {
    opacity: 0.8,
  },
  pillLabelActive: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.onPrimary,
  },
  pillLabelIdle: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textStrong,
  },
  pillCountActive: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.onPrimary,
    opacity: 0.85,
  },
  pillCountIdle: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textMuted,
  },
  totalsLine: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
