/**
 * EmployeesStep — wizard's final step, enrolment-lite. The roster is
 * `GET /attendance/enrolments` (every tenant technician joined with their
 * access state); each row is an avatar, a status chip and an enable toggle,
 * inside ONE grouped scrolling card — the roster is a FlatList (owner
 * ruling 2026-10-23: a big team must virtualize, not stretch the step),
 * with the search + count above and the info banner, the Enable attendance
 * button and the gate line in the footer.
 *
 * Row chips (one status per row): "Hasn't signed in yet" (invited — the
 * database refuses them), "Office: X" (tracked), "Starts DATE" (upcoming —
 * the switch is disabled: a bare enable PUT clamps the start to today and
 * deletes the future period, AD-8), "Not tracking attendance".
 *
 * UX-DR9 (switch-not-committed-until-office): toggling ON for an employee
 * with no office opens the office picker INLINE immediately and the switch
 * does not visually commit — its value is always the server's row state —
 * until a pick PUTs and the returned post-write state lands. Cancelling
 * the picker writes nothing and the switch springs back off. Toggling OFF
 * asks through the shared ConfirmDialog first (20-1), then DELETEs
 * (idempotent). Failures surface as the row's own banner and the row keeps
 * its pre-write server state (per-row retry = toggle again).
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Info, Search, Users, XCircle } from 'lucide-react-native';
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  InlineError,
  Input,
  Skeleton,
  Switch,
} from '../../../components/ui';
import { colors, palette, radius, spacing, typography } from '../../../theme';
import type { ApiError, EnrolmentOverview } from '../../../services';
import type { Office } from '../../../types/office';
import { enrolmentCoversToday } from './wizardModel';
import { OfficePickerSheet } from '../enrolments/OfficePickerSheet';

type Props = {
  roster: EnrolmentOverview[];
  /** Live offices only (`archivedAt == null`) — the picker's options. */
  liveOffices: Office[];
  /** IST today (YYYY-MM-DD) — distinguishes a future-dated enrolment. */
  today: string;
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  onRetry: () => void;
  rowError: (employeeId: string) => ApiError | null;
  isRowPending: (employeeId: string) => boolean;
  onEnable: (employeeId: string, officeId: string) => Promise<boolean>;
  onDisable: (employeeId: string) => Promise<boolean>;
};

type Chip = { text: string; bg: string; fg: string; dot: string } | null;

export function EmployeesStep({
  roster,
  liveOffices,
  today,
  isLoading,
  hasLoaded,
  error,
  onRetry,
  rowError,
  isRowPending,
  onEnable,
  onDisable,
}: Props) {
  // The employee the inline picker is open for (null = closed).
  const [pickingId, setPickingId] = useState<string | null>(null);
  // 20-1 — the switch-off DELETE ask (same posture as the roster screen:
  // the DELETE fires only after the shared ConfirmDialog confirms).
  const [disableAskId, setDisableAskId] = useState<string | null>(null);
  // The search narrows the roster by name (the mockup's "Search employees").
  const [query, setQuery] = useState('');

  if (isLoading && !hasLoaded) {
    // First load: a roster-shaped shimmer, labelled (the 19-5 idiom); the
    // per-row write spinner below stays an action acknowledgment.
    return (
      <View style={styles.skeleton} accessibilityLabel="Loading attendance">
        <Skeleton rows={4} height={80} />
      </View>
    );
  }

  if (error && !hasLoaded) {
    return (
      <View style={styles.stack}>
        <InlineError message="Couldn't load your team. Check your connection and try again." />
        <Button variant="secondary" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  const shown = roster.filter((row) =>
    row.employeeName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  // How many of the shown rows cannot be switched on right now (invited —
  // the database refuses them — or a future start): the amber count tag.
  const notEnabledCount = shown.filter((row) => {
    const coversToday = enrolmentCoversToday(row, today);
    return (
      !coversToday &&
      (row.memberStatus === 'invited' || row.attendanceStartDate !== null)
    );
  }).length;

  const pickerEmployee =
    roster.find((row) => row.employeeId === pickingId) ?? null;
  const disableRow =
    roster.find((row) => row.employeeId === disableAskId) ?? null;

  const onToggle = (row: EnrolmentOverview, nextValue: boolean) => {
    if (isRowPending(row.employeeId)) return;
    // Upcoming rows: the disabled switch already blocks this; the guard
    // keeps the "never silently cancel a future start" invariant local
    // (a bare enable clamps the start to today and deletes the period).
    const upcoming =
      row.attendanceStartDate !== null && !enrolmentCoversToday(row, today);
    if (nextValue && upcoming) return;
    // Invited people cannot be tracked yet: never open the picker or enable them.
    if (nextValue && row.memberStatus === 'invited') return;
    if (!nextValue) {
      setDisableAskId(row.employeeId);
      return;
    }
    if (row.officeId) {
      void onEnable(row.employeeId, row.officeId);
    } else {
      // No office yet — the picker opens NOW; the switch commits only on
      // a pick (the value below is the server's row state, still false).
      setPickingId(row.employeeId);
    }
  };

  const onPickOffice = (officeId: string) => {
    const employee = pickerEmployee;
    setPickingId(null);
    if (!employee) return;
    // A failed PUT leaves the row's server state untouched — the switch
    // springs back off and the row's banner explains why.
    void onEnable(employee.employeeId, officeId);
  };

  /** The row's one status chip — colours are the same tint families the
   *  Avatar draws from (name-derived), never new hues. */
  function chipFor(row: EnrolmentOverview): Chip {
    const coversToday = enrolmentCoversToday(row, today);
    const upcomingStart =
      !coversToday && row.attendanceStartDate !== null
        ? row.attendanceStartDate
        : null;
    if (row.memberStatus === 'invited' && !coversToday) {
      return { text: "Hasn't signed in yet", bg: palette.amber50, fg: palette.amber700, dot: palette.amber500 };
    }
    if (coversToday) {
      return {
        text: row.officeId ? `${row.officeName ?? 'Office'} assigned` : 'No office assigned',
        bg: palette.green50,
        fg: palette.green700,
        dot: palette.green500,
      };
    }
    if (upcomingStart !== null) {
      return { text: `Starts ${upcomingStart}`, bg: palette.blue50, fg: palette.blue700, dot: palette.blue500 };
    }
    return { text: 'Not tracking attendance', bg: palette.gray100, fg: palette.gray600, dot: palette.gray400 };
  }

  const renderRow = ({ item: row }: { item: EnrolmentOverview }) => {
    const rowErr = rowError(row.employeeId);
    // Raw enrolment truth (never the kill-switch-gated module flag —
    // see `enrolmentCoversToday`): covers-today drives the switch and
    // the chip; a future start renders as upcoming.
    const coversToday = enrolmentCoversToday(row, today);
    const upcomingStart =
      !coversToday && row.attendanceStartDate !== null
        ? row.attendanceStartDate
        : null;
    // Invited people have not signed in yet; the database refuses them.
    const notSignedIn = row.memberStatus === 'invited';
    const chip = chipFor(row);
    // Rows that cannot be enabled yet (invited, or a future start) render
    // dimmed — easy to scan past (owner ruling 2026-10-23).
    const cannotEnable = upcomingStart !== null || (notSignedIn && !coversToday);
    return (
      // The row is a COLUMN: the write-failure banner gets the full width
      // BELOW the row line — inside the row's flex it would squeeze into
      // the sliver right of the switch (review finding 2026-10-23).
      <View>
        <View style={[styles.row, cannotEnable && styles.rowDisabled]}>
          <Avatar name={row.employeeName} size="md" />
          <View style={styles.rowText}>
            <View style={styles.nameLine}>
              <Text style={styles.rowName}>{row.employeeName}</Text>
              {row.phone ? (
                <View style={styles.phoneTag}>
                  <Text style={styles.phoneTagText}>{row.phone}</Text>
                </View>
              ) : null}
            </View>
            {chip ? (
              <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
                <Text style={[styles.chipText, { color: chip.fg }]} numberOfLines={1}>
                  {chip.text}
                </Text>
              </View>
            ) : null}
          </View>
          {/* In-flight write feedback: the switch is disabled while the write
              is pending — the spinner makes the wait legible. The switch is
              bare (the chip carries the status — the mockup's anatomy). */}
          {isRowPending(row.employeeId) ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={coversToday}
              onValueChange={(nextValue) => onToggle(row, nextValue)}
              disabled={
                isRowPending(row.employeeId) ||
                upcomingStart !== null ||
                (notSignedIn && !coversToday)
              }
            />
          )}
        </View>
        {rowErr ? (
          <View style={styles.rowError}>
            <InlineError message="Couldn't save this change. Try again." />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.stack}>
      {/* The search earns its place only on a big roster — six or fewer
         members are scannable at a glance (owner ruling 2026-10-23). */}
      {roster.length > 6 ? (
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search employees..."
          leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
        />
      ) : null}

      <View style={styles.countRow}>
        <View style={styles.countTag}>
          <Text style={styles.countTagText}>
            {`${shown.length} ${shown.length === 1 ? 'Member' : 'Members'} found`}
          </Text>
        </View>
        {notEnabledCount > 0 ? (
          <View style={styles.warnTag}>
            <Text style={styles.warnTagText}>{`${notEnabledCount} not enabled`}</Text>
          </View>
        ) : null}
      </View>

      <Card padding="none" style={styles.groupCard}>
        <FlatList
          data={shown}
          keyExtractor={(row) => row.employeeId}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={24} color={colors.primary} strokeWidth={1.5} />}
              title={query ? 'No one matches' : 'Invite technicians first'}
              description={
                query
                  ? 'No team member matches that search.'
                  : 'Your team roster is empty. Invite technicians from the Home tab, then return here to switch on tracking.'
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </Card>

      <View style={styles.infoBanner}>
        <Info size={16} color={colors.primary} strokeWidth={2} />
        <Text style={styles.infoText}>
          Tracking starts automatically on their first punch once active. You
          can modify settings any time.
        </Text>
      </View>

      <OfficePickerSheet
        visible={pickerEmployee !== null}
        employeeName={pickerEmployee?.employeeName ?? null}
        offices={liveOffices}
        emptyMessage="No offices yet. Add one from the Offices step first."
        onClose={() => setPickingId(null)}
        onPick={onPickOffice}
      />

      <ConfirmDialog
        visible={disableRow != null}
        title={`Turn off tracking for ${disableRow?.employeeName ?? ''}?`}
        message={`${disableRow?.employeeName ?? ''} will not be able to check in for attendance. Any scheduled office move for them is also cancelled. You can turn it back on later.`}
        confirmLabel="Turn off tracking"
        confirmVariant="danger"
        icon={<XCircle size={20} color={colors.danger} strokeWidth={2} />}
        cancelLabel="Keep tracking"
        onConfirm={() => {
          const id = disableAskId;
          setDisableAskId(null);
          if (id) void onDisable(id);
        }}
        onCancel={() => setDisableAskId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flex: 1,
    gap: spacing.s3,
  },
  skeleton: {
    paddingVertical: spacing.s8,
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s2,
  },
  countTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  countTagText: {
    ...typography.labelStrong,
    fontSize: 12,
    color: colors.primary,
  },
  warnTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.status.warning.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  warnTagText: {
    ...typography.labelStrong,
    fontSize: 12,
    color: colors.status.warning.fg,
  },
  groupCard: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.s1,
  },
  // Name + phone sit inline and WRAP to the next line when they grow —
  // never truncate and never overflow the row (owner ask 2026-10-23).
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s1,
  },
  rowName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  phoneTag: {
    alignSelf: 'flex-start',
    backgroundColor: palette.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  phoneTagText: {
    ...typography.caption,
    color: palette.gray600,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
  chipText: {
    ...typography.caption,
  },
  rowError: {
    marginTop: spacing.s2,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.s4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  infoText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.textStrong,
  },
});
