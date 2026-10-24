/**
 * NotOnTeamScreen — a staff-intent login whose number belongs to no company.
 * Before the intent picker existed this person was pushed into company setup
 * and silently became an owner of a stray company (which then blocked their
 * real invite). Now, per the redesign: a warning for employees, the number
 * to hand to their admin (share sheet — a clipboard library would be a
 * native dependency), and the owner path on a gradient card for someone who
 * genuinely runs their own business.
 */
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Building,
  CircleCheck,
  Plus,
  Share2,
  Star,
  TriangleAlert,
  UserRound,
} from 'lucide-react-native';
import { GradientSurface } from '../../../components/ui';
import { DIAL_CODE } from '../constants';
import { colors, palette, radius, spacing, typography } from '../../../theme';

type Props = {
  /** The entered number (national digits, no dial code) — what the admin must invite. */
  phone: string;
  onSetUpInstead: () => void;
  onUseAnotherNumber: () => void;
};

const formatPhone = (digits: string) =>
  `${DIAL_CODE} ${digits.replace(/(\d{5})(\d{5})/, '$1 $2')}`;

export function NotOnTeamScreen({ phone, onSetUpInstead, onUseAnotherNumber }: Props) {
  const shareNumber = () => {
    Share.share({
      message: `Add me to your Fenzit team — my registered number is ${formatPhone(phone)}.`,
    }).catch(err => {
      // Some OEM share sheets reject (cancelled/error) — nothing to show
      // that the number box doesn't already say.
      console.error('[NotOnTeam] share failed:', err);
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>Not on a team yet</Text>
          <Text style={styles.sub}>
            Your account is ready, but no company has added you yet. Choose
            what to do next:
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.warnStrip}>
            <TriangleAlert size={18} color={colors.warning} strokeWidth={2.2} />
            <View style={styles.warnText}>
              <Text style={styles.warnTitle}>Are you an employee or technician?</Text>
              <Text style={styles.warnBody}>
                Please{' '}
                <Text style={styles.warnStrong}>do NOT set up a company</Text>{' '}
                below. Your company owner or manager should add your number to
                their team first.
              </Text>
            </View>
          </View>

          <View style={styles.staffHead}>
            <View style={styles.staffTile}>
              <UserRound size={20} color={colors.textBody} strokeWidth={2} />
            </View>
            <View style={styles.staffCol}>
              <View style={styles.staffTitleRow}>
                <Text style={styles.staffTitle}>Staff & Technician Setup</Text>
                <Text style={styles.chip}>Waiting for invite</Text>
              </View>
              <Text style={styles.staffBody}>
                Show this number to your company owner or manager. They will
                add you to their Fenzit team.
              </Text>
            </View>
          </View>

          <View style={styles.numberBox}>
            <View style={styles.numberCol}>
              <Text style={styles.numberLabel}>Give this number to your company</Text>
              <Text style={styles.number}>{formatPhone(phone)}</Text>
            </View>
            <Pressable
              style={styles.shareBtn}
              onPress={shareNumber}
              accessibilityLabel="Share your number with your admin">
              <Share2 size={16} color={colors.textStrong} strokeWidth={2.2} />
              <Text style={styles.shareBtnText}>Share</Text>
            </Pressable>
          </View>

          <View style={styles.noteRow}>
            <CircleCheck size={16} color={colors.success} strokeWidth={2.2} />
            <Text style={styles.noteText}>
              Once they add you, login again and your jobs will be ready.
            </Text>
          </View>
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <GradientSurface style={styles.ownerCard}>
          <View style={styles.ownerHead}>
            <View style={styles.ownerBadge}>
              <Star size={12} color={colors.onPrimary} strokeWidth={2.4} />
              <Text style={styles.ownerBadgeText}>Only for business owners</Text>
            </View>
            <View style={styles.ownerTile}>
              <Building size={20} color={colors.primary} strokeWidth={2.2} />
            </View>
          </View>
          <Text style={styles.ownerTitle}>Run your own business?</Text>
          <Text style={styles.ownerBody}>
            This is only for owners starting a new company. If your company
            already uses Fenzit, do not create a new one.
          </Text>
          <Pressable
            style={styles.ownerBtn}
            onPress={onSetUpInstead}
            accessibilityLabel="Set up new company">
            <Plus size={20} color={colors.primary} strokeWidth={2.4} />
            <Text style={styles.ownerBtnText}>Set up new company</Text>
          </Pressable>
        </GradientSurface>

        <Pressable style={styles.footerLink} onPress={onUseAnotherNumber} hitSlop={8}>
          <ArrowLeft size={18} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.footerText}>Use another number</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s8,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.s6,
  },
  title: {
    ...typography.title,
    color: colors.textStrong,
    textAlign: 'center',
  },
  sub: {
    ...typography.body,
    color: colors.textBody,
    textAlign: 'center',
    marginTop: spacing.s3,
    lineHeight: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.s5,
  },
  warnStrip: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'flex-start',
    backgroundColor: palette.amber50,
    borderRadius: radius.lg,
    padding: spacing.s4,
  },
  warnText: {
    flex: 1,
  },
  warnTitle: {
    ...typography.bodySm,
    fontWeight: '700',
    color: palette.amber800,
  },
  warnBody: {
    ...typography.bodySm,
    color: palette.amber700,
    marginTop: 2,
    lineHeight: 21,
  },
  warnStrong: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  staffHead: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginTop: spacing.s5,
  },
  staffTile: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffCol: {
    flex: 1,
  },
  staffTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  staffTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textStrong,
  },
  chip: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.gray500,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 999,
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  staffBody: {
    ...typography.bodySm,
    color: colors.textBody,
    marginTop: 4,
    lineHeight: 21,
  },
  numberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginTop: spacing.s4,
  },
  numberCol: {
    flex: 1,
  },
  numberLabel: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.gray500,
  },
  number: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textStrong,
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  shareBtnText: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.textStrong,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    marginTop: spacing.s4,
  },
  noteText: {
    ...typography.bodySm,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 21,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.s5,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  orText: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: palette.gray400,
    marginHorizontal: spacing.s4,
  },
  ownerCard: {
    width: '100%',
    padding: spacing.s6,
  },
  ownerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    backgroundColor: colors.onPrimarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  ownerBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.onPrimary,
  },
  ownerTile: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.3,
    color: colors.onPrimary,
    marginTop: spacing.s4,
  },
  ownerBody: {
    ...typography.body,
    color: colors.onPrimaryFaint,
    marginTop: spacing.s2,
    lineHeight: 24,
  },
  ownerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    height: 52,
    marginTop: spacing.s5,
  },
  ownerBtnText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    alignSelf: 'center',
    marginTop: spacing.s6,
  },
  footerText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textBody,
  },
});
