/**
 * NoAccessScreen — the one simple screen for a signed-in person who cannot
 * open any company: someone removed from their company, someone whose invite
 * has not been set up, and Fenzit staff (who use the web admin). It shows a
 * plain message and a Log out button — never company data, never a dead end.
 *
 * (A brand-new person with no company at all is NOT sent here: they get the
 * company setup flow instead — see `routeAfterVerify` in AuthFlow.)
 */
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, LogOut } from 'lucide-react-native';
import { EmptyState } from '../../../components/ui';
import { colors, spacing } from '../../../theme';
import { NO_COMPANY_MESSAGE, PLATFORM_ADMIN_MESSAGE } from '../noAccessCopy';
import { useLogOut } from '../useLogOut';

type Props = {
  /** Fenzit staff get their own sentence; everyone else gets the invite hint. */
  platformAdmin: boolean;
};

export default function NoAccessScreen({ platformAdmin }: Props) {
  const logOut = useLogOut();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <EmptyState
          icon={<Building2 size={36} color={colors.primary} strokeWidth={1.5} />}
          title={platformAdmin ? 'Web admin only' : 'No company yet'}
          description={platformAdmin ? PLATFORM_ADMIN_MESSAGE : NO_COMPANY_MESSAGE}
          ctaLabel="Log out"
          ctaIcon={<LogOut size={18} color={colors.onPrimary} strokeWidth={2} />}
          onPressCta={logOut}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfacePage },
  body: { flex: 1, justifyContent: 'center', padding: spacing.s4 },
});
