/**
 * EmployeePickerSheet — the apply-on-behalf team-member picker (Story 17-6,
 * spec D4; the OfficePickerSheet twin). Data is the enrolments roster
 * FILTERED TO TRACKED ROWS (`attendanceStartDate != null` — the ungated
 * per-employee truth; never `attendanceAccess` — module-gated, and never
 * `attendanceEnabled` — the tenant flag): a never-enrolled person must not
 * be pickable for a tracked leave.
 *
 * Search (2026-11-19 device-pass compaction): ALWAYS visible while the
 * roster is non-empty — the old >8-rows threshold left big companies
 * (50–100+ tracked people) scrolling blind. The needle matches NAME,
 * EMP CODE and PHONE: the name case-insensitively, the code and the
 * phone on their digits ("080" finds EMP-080, "9817001040" or "98170
 * 001 040" finds the number — formatting never blocks a match). Each
 * row carries its code · phone · office caption so the user can see
 * what to type and why a row matched. A controlled DS `Sheet` with
 * plain pressable rows (NOT a nested FlatList — the Sheet is a
 * ScrollView).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Avatar, Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';

/** The picker's row — the tracked subset of a roster row. */
export interface LeavePickerEmployee {
  employeeId: string;
  employeeName: string;
  /** The human-readable EMP code (CAP) — searchable + shown on the row. */
  employeeCode?: string | null;
  /** The full phone (country code + number) — searchable + shown. */
  phone?: string;
  officeName: string | null;
  /** Photo link or null; absent shows initials. */
  avatarUrl?: string | null;
}

/** Case- and formatting-insensitive form: lowercase alphanumerics only,
 *  so "EMP-080" ≍ "emp080" and "98170 001 040" ≍ "9817001040". */
const searchable = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

function matchesNeedle(employee: LeavePickerEmployee, needle: string): boolean {
  if (needle === '') return true;
  if (employee.employeeName.toLowerCase().includes(needle)) return true;
  const code = searchable(employee.employeeCode ?? '');
  if (code !== '' && code.includes(searchable(needle))) return true;
  const phone = searchable(employee.phone ?? '');
  if (phone !== '' && phone.includes(searchable(needle))) return true;
  return false;
}

/** The row's caption: the identity fields the search matches on, joined —
 *  "EMP-080 · 9817001040 · Test Branch". The office-only degenerate case
 *  keeps the old "No office" fallback. */
function captionFor(employee: LeavePickerEmployee): string {
  const caption = [
    employee.employeeCode,
    employee.phone || null,
    employee.officeName,
  ]
    .filter(Boolean)
    .join(' · ');
  return caption === '' ? 'No office' : caption;
}

export function EmployeePickerSheet(input: {
  visible: boolean;
  employees: LeavePickerEmployee[];
  /** The roster GET in flight — a spinner holds the rows' place. */
  loading?: boolean;
  /** The roster GET failed — an honest error + Retry, never a
   *  permanent-sounding "no team members" (17-6 review P3). */
  error?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onPick: (employeeId: string) => void;
}) {
  const { visible, employees, loading = false, error = false, onRetry, onClose, onPick } = input;
  const [query, setQuery] = useState('');

  // A stale needle must not silently filter the next opening.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => employees.filter(employee => matchesNeedle(employee, needle)),
    [employees, needle],
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose team member"
      subtitle="Who is this leave for?"
      detents={[0.6]}
      scrollable>
      {loading ? (
        <Text style={styles.empty}>Loading your team…</Text>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.empty}>
            Couldn't load your team. Check your connection.
          </Text>
          <Button variant="secondary" onPress={onRetry}>
            Try again
          </Button>
        </View>
      ) : employees.length === 0 ? (
        <Text style={styles.empty}>
          No team members yet — enrol them from Attendance first.
        </Text>
      ) : (
        <>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, EMP code or phone..."
            autoCapitalize="none"
            autoCorrect={false}
            leadingIcon={<Search size={18} color={colors.textMuted} strokeWidth={2} />}
          />
          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              No team members match "{query.trim()}"
            </Text>
          ) : (
            filtered.map(employee => (
              <Pressable
                key={employee.employeeId}
                accessibilityRole="button"
                accessibilityLabel={`Apply leave for ${employee.employeeName}`}
                onPress={() => onPick(employee.employeeId)}
                style={styles.row}>
                <Avatar name={employee.employeeName} uri={employee.avatarUrl ?? null} size="md" />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {employee.employeeName}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {captionFor(employee)}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textStrong,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.s6,
  },
  errorWrap: {
    alignItems: 'center',
  },
});
