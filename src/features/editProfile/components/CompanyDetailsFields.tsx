/**
 * CompanyDetailsFields — GST number and business types on the Edit profile
 * page. The owner can edit both. Anyone else sees them read-only, with a
 * plain line saying why.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Button, Input, InlineError, MultiSelect, Skeleton } from '../../../components/ui';
import { spacing, typography, colors } from '../../../theme';
import type { BusinessType } from '../../../services';
import type { BusinessTypeOptionsState } from '../useBusinessTypeOptions';

type OptionsState = BusinessTypeOptionsState & { retry: () => void };

type Props = {
  canEdit: boolean;
  gstin: string;
  onChangeGstin: (value: string) => void;
  gstinError: string | null;
  selectedCodes: string[];
  onChangeCodes: (codes: string[]) => void;
  typesError: string | null;
  savedTypes: BusinessType[];
  options: OptionsState;
};

const OWNER_ONLY = 'Only the company owner can change this.';

export function CompanyDetailsFields(props: Props) {
  const { canEdit, options } = props;

  return (
    <View style={styles.root}>
      <View style={styles.field}>
        <Input
          label="GST number (optional)"
          value={props.gstin}
          onChangeText={props.onChangeGstin}
          placeholder="e.g. 29ABCDE1234F1Z5"
          autoCapitalize="characters"
          maxLength={15}
          error={props.gstinError ?? undefined}
          helper={canEdit ? undefined : OWNER_ONLY}
          disabled={!canEdit}
        />
      </View>

      <View style={styles.field}>
        {canEdit ? (
          <>
            {options.status === 'loading' ? (
              <View style={styles.loading} accessibilityLabel="Loading business types">
                <Skeleton rows={1} height={48} />
              </View>
            ) : options.status === 'error' ? (
              <View style={styles.errorBlock}>
                <InlineError message="Could not load business types." />
                <Button variant="secondary" size="md" onPress={options.retry}>
                  Try again
                </Button>
              </View>
            ) : options.options.length === 0 ? (
              <Text style={styles.hint}>No business types are available yet.</Text>
            ) : (
              <MultiSelect
                label="Business types"
                value={props.selectedCodes}
                onChange={props.onChangeCodes}
                options={options.options.map((o) => ({ value: o.code, label: o.label }))}
                placeholder="Pick your business types"
                helper="Pick up to 10."
                searchable
              />
            )}
            {props.typesError ? <InlineError message={props.typesError} /> : null}
          </>
        ) : (
          <View style={styles.readOnly}>
            <Text style={styles.label}>Business types</Text>
            <Text style={styles.value}>
              {props.savedTypes.length > 0
                ? props.savedTypes.map((t) => t.label).join(', ')
                : 'None added yet'}
            </Text>
            <Text style={styles.hint}>{OWNER_ONLY}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.s5,
  },
  field: {
    gap: spacing.s2,
  },
  loading: {
    minHeight: 48,
  },
  errorBlock: {
    gap: spacing.s3,
    alignItems: 'flex-start',
  },
  readOnly: {
    gap: spacing.s1,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.body,
    color: colors.textStrong,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
