/**
 * Step 3 — capture the business profile, then finish setup.
 * Composes Input + Select + MultiSelect + Button from the Design System.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Button, Input, Select } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { AuthScaffold } from '../components/AuthScaffold';
import { INDIA_STATES } from '../constants';
import type { BusinessProfile } from '../types';

type Props = {
  profile: BusinessProfile;
  onChange: (patch: Partial<BusinessProfile>) => void;
  onFinish: () => void;
  submitting?: boolean;
  /** Error from the `setupCompany` API call — distinct from local field validation below. */
  serverError?: string;
};

type Errors = Partial<
  Record<'businessName' | 'ownerName' | 'city' | 'stateCode', string>
>;

export function ProfileScreen({
  profile,
  onChange,
  onFinish,
  submitting = false,
  serverError = '',
}: Props) {
  const [errors, setErrors] = useState<Errors>({});

  const validate = (): boolean => {
    const next: Errors = {};
    if (!profile.businessName.trim()) next.businessName = 'Enter your business name.';
    if (!profile.ownerName.trim()) next.ownerName = 'Enter your name.';
    if (!profile.city.trim()) next.city = 'Enter your city.';
    if (!profile.stateCode.trim()) next.stateCode = 'Select your state.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finish = () => {
    if (!validate()) return;
    onFinish();
  };

  return (
    <AuthScaffold>
      <View style={styles.card}>
      <Text style={styles.heading}>Tell us about your business</Text>

      <View style={styles.field}>
        <Input
          label="Business name"
          value={profile.businessName}
          onChangeText={t => {
            setErrors(e => ({ ...e, businessName: undefined }));
            onChange({ businessName: t });
          }}
          placeholder="e.g. Cool Air AC Services"
          autoCapitalize="words"
          error={errors.businessName}
        />
      </View>

      <View style={styles.field}>
        <Input
          label="Your name"
          value={profile.ownerName}
          onChangeText={t => {
            setErrors(e => ({ ...e, ownerName: undefined }));
            onChange({ ownerName: t });
          }}
          placeholder="e.g. Ravi Kumar"
          autoCapitalize="words"
          error={errors.ownerName}
        />
      </View>

      <View style={styles.field}>
        <Input
          label="City"
          value={profile.city}
          onChangeText={t => {
            setErrors(e => ({ ...e, city: undefined }));
            onChange({ city: t });
          }}
          placeholder="e.g. Mumbai"
          autoCapitalize="words"
          error={errors.city}
        />
      </View>

      <View style={styles.field}>
        <Select
          label="State"
          value={profile.stateCode}
          onChange={v => {
            setErrors(e => ({ ...e, stateCode: undefined }));
            onChange({ stateCode: v });
          }}
          options={INDIA_STATES as unknown as { value: string; label: string }[]}
          placeholder="Select your state"
        />
        {errors.stateCode ? <Text style={styles.fieldError}>{errors.stateCode}</Text> : null}
      </View>

      {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={submitting}
        onPress={finish}
        trailingIcon={
          submitting ? undefined : (
            <ArrowRight size={20} color={colors.onPrimary} strokeWidth={2.5} />
          )
        }
        style={styles.cta}>
        {submitting ? 'Setting up…' : 'Start using Fenzit'}
      </Button>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.s6,
  },
  heading: {
    ...typography.title,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  field: {
    marginTop: spacing.s5,
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s2,
  },
  serverError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.s4,
  },
  cta: {
    marginTop: spacing.s6,
  },
});
