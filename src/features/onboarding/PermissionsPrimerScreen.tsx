/**
 * PermissionsPrimerScreen — the "here's the deal" moment: what Fenzit asks
 * for and why. Each row shows the LIVE OS state: a green check when the
 * permission is granted, an "Allow" pill that fires the OS prompt when not
 * (a permanently-denied answer — Android "don't ask again", iOS still-denied
 * — opens the app's Settings page, since the OS won't re-prompt). iOS camera
 * is the one state JS cannot read, so that row keeps the honest
 * ask-at-first-use path: the request fires at the first photo step. The
 * notifications row stays out until push ships (scope decision D4).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { checkPermission, requestPermission } from 'react-native-nitro-geolocation';
import { Check, Info } from 'lucide-react-native';
import { Button } from '../../components/ui';
import { colors, palette, radius, shadow, spacing, typography, fontSize, weight, leading } from '../../theme';
import type { UserRole } from '../../services';
import { CameraArt, LocationArt, ShieldArt } from './components/artwork';

type Props = {
  role: UserRole | null;
  /** One-line correction when the picked intent differs from the phone's
   *  real role — employees land here (never the owner tour), so this is
   *  where their correction has to show. */
  notice?: string | null;
  onContinue: () => void;
};

type Row = {
  key: string;
  perm: 'location' | 'camera';
  art: ReactNode;
  title: string;
  badge: string;
  badgeFg: string;
  body: string;
};

/** The primer's per-row permission state. 'unknown' = JS cannot read it
 *  (iOS camera) — the row keeps the ask-at-first-use path. */
type PermState = 'checking' | 'granted' | 'denied' | 'unknown';

export default function PermissionsPrimerScreen({ role, notice, onContinue }: Props) {
  const isStaff = role === 'employee';

  // Live OS state per row, probed on mount and refreshed after every Allow.
  const [perms, setPerms] = useState<{ location: PermState; camera: PermState }>(() => ({
    location: 'checking',
    camera: Platform.OS === 'ios' ? 'unknown' : 'checking',
  }));

  const probe = async () => {
    try {
      if (Platform.OS === 'android') {
        const [location, camera] = await Promise.all([
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
        ]);
        setPerms({
          location: location ? 'granted' : 'denied',
          camera: camera ? 'granted' : 'denied',
        });
      } else {
        const status = (await checkPermission()) as string;
        setPerms(p => ({ ...p, location: status === 'granted' ? 'granted' : 'denied' }));
      }
    } catch (err) {
      // Fail to 'denied' — the row then offers Allow, and tapping it runs
      // the real request (the attendance probe's fail-open rule).
      console.error('[PermissionsPrimer] probe failed:', err);
      setPerms(p => ({
        location: p.location === 'granted' ? 'granted' : 'denied',
        camera: p.camera === 'granted' ? 'granted' : p.camera,
      }));
    }
  };

  useEffect(() => {
    void probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [asking, setAsking] = useState(false);

  // The pre-permission pattern (how Uber-style primers do it): the screen
  // explains, Continue fires the real OS prompts — ONE after another, never
  // stacked — and a denial never blocks the way (the feature flows re-ask
  // in context, and each row keeps its Allow pill for a later retry).
  const handleContinue = async () => {
    setAsking(true);
    try {
      if (perms.location === 'denied') await allow('location');
      if (perms.camera === 'denied') await allow('camera');
    } finally {
      setAsking(false);
    }
    onContinue();
  };

  const allow = async (perm: 'location' | 'camera') => {
    try {
      if (perm === 'location') {
        if (Platform.OS === 'android') {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'Allow Fenzit to use your location for check-in and job steps.',
              buttonPositive: 'Allow',
              buttonNegative: 'Cancel',
            },
          );
          if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            await Linking.openSettings();
          }
        } else {
          // iOS: the prompt shows for a never-asked user; an already-denied
          // one gets no dialog, so Settings is the honest next step.
          const status = (await requestPermission()) as string;
          if (status !== 'granted') await Linking.openSettings();
        }
      } else if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Allow Fenzit to use your camera for job photo proof.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
          },
        );
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          await Linking.openSettings();
        }
      }
    } catch (err) {
      console.error('[PermissionsPrimer] request failed:', err);
    }
    await probe();
  };

  const rows: Row[] = [
    {
      key: 'location',
      perm: 'location',
      art: <LocationArt />,
      title: 'Location',
      badge: 'REQUIRED',
      badgeFg: colors.primary,
      body: isStaff
        ? 'Only when you check in or complete a job step \u2014 never in the background. It helps the app find the exact job address.'
        : 'Checks the team in at the office or site \u2014 taken only at check-in and job steps, never in the background.',
    },
    {
      key: 'camera',
      perm: 'camera',
      art: <CameraArt />,
      title: 'Camera',
      badge: 'FOR PROOF',
      badgeFg: colors.status.done.fg,
      body: isStaff
        ? 'Snap photo proof when a job step asks for it.'
        : 'Photo proof that the work is done.',
    },
  ];

  const headerScale = useSharedValue(0);

  useEffect(() => {
    headerScale.value = withDelay(120, withSpring(1, { damping: 11, stiffness: 160 }));
  }, [headerScale]);

  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerScale.value }],
  }));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Animated.View style={[styles.badgeWrap, headerStyle]}>
          <ShieldArt size={76} />
        </Animated.View>
        {notice ? (
          <View style={styles.notice}>
            <Info size={16} color={colors.primary} strokeWidth={2} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>
          {isStaff ? 'Permissions that protect you' : 'Permissions that protect your team'}
        </Text>
        <Text style={styles.subtitle}>
          {'We ask for two things now \u2014 so we never stop you during a job.'}
        </Text>

        {rows.map((row, i) => (
          <PrimerRow
            key={row.key}
            row={row}
            index={i}
            state={perms[row.perm]}
            onAllow={() => allow(row.perm)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footnote}>
          {'Tap Continue. When the phone asks, tap Allow. You can change this later in settings.'}
        </Text>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={asking}
          onPress={handleContinue}>
          {asking ? 'Please wait…' : 'Continue'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

function PrimerRow({
  row,
  index,
  state,
  onAllow,
}: {
  row: Row;
  index: number;
  state: PermState;
  onAllow: () => void;
}) {
  const y = useSharedValue(24);
  const opacity = useSharedValue(0);
  const check = useSharedValue(0);

  useEffect(() => {
    const base = 220 + index * 150;
    y.value = withDelay(base, withSpring(0, { damping: 16, stiffness: 130 }));
    opacity.value = withDelay(base, withTiming(1, { duration: 300 }));
    check.value = withDelay(base + 180, withSpring(1, { damping: 10, stiffness: 210 }));
  }, [index, y, opacity, check]);

  const enter = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: check.value }],
  }));

  return (
    <Animated.View style={[styles.row, enter]}>
      <View style={styles.rowIcon}>{row.art}</View>
      <View style={styles.rowText}>
        <View style={styles.titleRow}>
          <Text style={styles.rowTitle}>{row.title}</Text>
          <View style={[styles.badgeChip, { backgroundColor: colors.surfaceSunken }]}>
            <Text style={[styles.badgeText, { color: row.badgeFg }]}>{row.badge}</Text>
          </View>
        </View>
        <Text style={styles.rowBody}>{row.body}</Text>
      </View>
      {state === 'denied' ? (
        <Pressable
          onPress={onAllow}
          style={styles.allowBtn}
          accessibilityLabel={`Allow ${row.title}`}>
          <Text style={styles.allowText}>Allow</Text>
        </Pressable>
      ) : (
        // Granted → the green pop; 'checking'/'unknown' → muted, the honest
        // "asked when you first need it" path the footnote describes.
        <Animated.View style={[styles.rowCheck, checkStyle]}>
          <Check
            size={14}
            color={state === 'granted' ? colors.status.done.fg : palette.gray300}
            strokeWidth={3.5}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s8,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
    marginBottom: spacing.s5,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s4,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: {
    flex: 1,
    color: colors.textBody,
    fontSize: fontSize.sm,
    fontWeight: weight.medium,
  },
  title: {
    ...typography.heading,
    fontSize: 26,
    color: colors.textStrong,
    marginBottom: spacing.s2,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * leading.normal),
    color: colors.textMuted,
    marginBottom: spacing.s6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    padding: spacing.s4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    marginBottom: spacing.s3,
    ...shadow.xs,
  },
  rowIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  rowText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: 3,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: weight.semibold,
    color: colors.textStrong,
  },
  badgeChip: {
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: weight.bold,
    letterSpacing: 0.5,
  },
  rowBody: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * leading.normal),
    color: colors.textMuted,
  },
  allowBtn: {
    minWidth: 64,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s3,
  },
  allowText: {
    fontSize: fontSize.sm,
    fontWeight: weight.bold,
    color: colors.primary,
  },
  rowCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.done.bg,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
    gap: spacing.s4,
  },
  footnote: {
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * leading.normal),
    color: palette.gray500,
    textAlign: 'center',
  },
});
