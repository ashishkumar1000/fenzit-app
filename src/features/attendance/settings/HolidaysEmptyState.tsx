/**
 * HolidaysEmptyState — the Holidays screen when no holiday exists yet: a
 * short "how holidays work" notice, the drawn calendar picture, one line of
 * explanation and a single full-width "Add first holiday" button.
 *
 * The notice says only what the app really does: staff need not check in on
 * a holiday and it shows as a holiday, not as an absence.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Lightbulb, Plus } from 'lucide-react-native';
import { Button } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import HolidayIllustration from './HolidayIllustration';

type Props = {
  onAdd: () => void;
};

export default function HolidaysEmptyState({ onAdd }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.notice}>
        <View style={styles.noticeIcon}>
          <Lightbulb size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={styles.noticeText}>
          <Text style={styles.noticeTitle}>Holidays are marked off automatically</Text>
          <Text style={styles.noticeBody}>
            Staff don't need to check in on these days, and no one is marked absent.
          </Text>
        </View>
      </View>

      <View style={styles.centre}>
        <HolidayIllustration />
        <Text style={styles.title}>No holidays scheduled yet</Text>
        <Text style={styles.body}>
          Add public and company holidays so attendance marks these days off for everyone.
        </Text>
        <Button
          variant="primary"
          fullWidth
          leadingIcon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.2} />}
          onPress={onAdd}>
          Add first holiday
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: spacing.s4,
    gap: spacing.s4,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.primarySoft,
  },
  noticeIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  noticeText: {
    flex: 1,
    gap: spacing.s1,
  },
  noticeTitle: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  noticeBody: {
    ...typography.bodySm,
    color: colors.textBody,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    paddingBottom: spacing.s8,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.s3,
    marginBottom: spacing.s2,
  },
});
