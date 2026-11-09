import { useEffect, useRef, useState, type ElementRef } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import { ArrowRight, Download } from 'lucide-react-native';
import { installedAppVersion } from '../../services/clientMetadata';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { colors, radius, spacing, typography } from '../../theme';
import { RoadblockModal } from './RoadblockModal';
import { SoftBackdrop } from './SoftBackdrop';
import { UpdateHeroIcon } from './UpdateHeroIcon';

const NOT_SET_TEXT = 'Update link is not set yet. Please try again later.';
const OPEN_FAILED_TEXT =
  Platform.OS === 'android'
    ? 'Could not open the Play Store. Open it yourself and search for Fenzit.'
    : 'Could not open the App Store. Open it yourself and search for Fenzit.';

interface ForcedUpdateScreenProps {
  /** Server copy for this platform (from `getForceUpdateRule`). */
  message: string;
  /** Store listing URL for this platform. Empty = the button is disabled. */
  storeUrl?: string;
  /** The server's minimum version for this platform (the version the user must reach). */
  requiredVersion: string;
}

/**
 * Modal shown when the running app is older than the server's minimum for
 * this platform (CAP-6). No dismiss, no data. It must render even when this
 * app version is broken by the API changes that made an update mandatory.
 * The only action opens the store listing; Android back exits the app.
 *
 * The card shows only what the server sends: the message and the required
 * version. Size, release time and a feature list are not in the backend yet,
 * so the design's lines for them are left out.
 */
export function ForcedUpdateScreen({
  message,
  storeUrl = '',
  requiredVersion,
}: ForcedUpdateScreenProps) {
  const [openFailed, setOpenFailed] = useState(false);
  const titleRef = useRef<ElementRef<typeof View>>(null);
  const linkMissing = storeUrl === '';

  // Focus moves to the title when the card appears, so a screen reader
  // starts with the reason for the block.
  useEffect(() => {
    const tag = findNodeHandle(titleRef.current);
    if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
  }, []);

  const openStore = async () => {
    try {
      await Linking.openURL(storeUrl);
      setOpenFailed(false);
    } catch {
      setOpenFailed(true);
    }
  };

  return (
    // Android back exits the app: the update is mandatory.
    <RoadblockModal testID="forced-update-screen" onRequestClose={() => BackHandler.exitApp()}>
      <SoftBackdrop />
      <View style={styles.heroTile} importantForAccessibility="no" accessible={false}>
        <UpdateHeroIcon size={34} />
      </View>

      <Badge status="progress" dot size="md" style={styles.chip}>
        Update is here!
      </Badge>

      <View ref={titleRef} accessible accessibilityRole="header">
        <Text style={[typography.heading, styles.title]}>Exciting update ready!</Text>
      </View>
      <ScrollView style={styles.messageScroll} bounces={false}>
        <Text style={[typography.body, styles.message]}>{message}</Text>
      </ScrollView>

      <View style={styles.versionRow}>
        <Text style={[typography.bodySm, styles.muted]}>{`Current: v${installedAppVersion()}`}</Text>
        <ArrowRight size={16} color={colors.textMuted} />
        <View style={styles.requiredChip}>
          <Text style={[typography.bodySm, styles.requiredText]}>{`Required: v${requiredVersion}`}</Text>
        </View>
      </View>

      <Button
        size="lg"
        fullWidth
        disabled={linkMissing}
        onPress={openStore}
        leadingIcon={<Download size={20} color={colors.onPrimary} />}
        testID="forced-update-button"
        accessibilityLabel="Update app now"
        accessibilityRole="button"
        accessibilityHint={linkMissing ? NOT_SET_TEXT : undefined}>
        Update app now
      </Button>
      {linkMissing ? (
        <Text style={[typography.bodySm, styles.muted]}>{NOT_SET_TEXT}</Text>
      ) : null}
      {openFailed ? (
        <Text style={[typography.bodySm, styles.error]} accessibilityRole="alert">
          {OPEN_FAILED_TEXT}
        </Text>
      ) : null}
    </RoadblockModal>
  );
}

const styles = StyleSheet.create({
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  chip: {
    alignSelf: 'center',
  },
  title: {
    color: colors.textStrong,
    textAlign: 'center',
  },
  // A long server message scrolls inside this height; the title and button stay put.
  messageScroll: {
    width: '100%',
    maxHeight: 200,
  },
  message: {
    color: colors.textBody,
    textAlign: 'center',
  },
  versionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  requiredChip: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  requiredText: {
    color: colors.primary,
    fontWeight: '600',
  },
  muted: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
