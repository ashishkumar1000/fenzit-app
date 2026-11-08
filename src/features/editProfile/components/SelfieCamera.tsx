/**
 * SelfieCamera — the in-app front camera for a profile photo. A circle guide
 * sits over the live preview, and face detection runs on the camera while it
 * is open. The shutter is enabled only when the face sits inside the circle,
 * or when the phone cannot run face detection at all, so nobody is blocked.
 *
 * The guide geometry matches the detector's default selfie guide (diameter
 * 72% of the screen width, centred 42% down), so the circle drawn here and the
 * readiness check agree.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';
import { useFaceDetector, type FaceGuideStatus } from '@noma4i/vision-camera-face-detector';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { Button, InlineError } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import type { PickedFile } from '../../technicianApp/useAttachmentUpload';
import { AVATAR_MAX_DIMENSION } from '../profileDraft';

/** Portrait 3:4 with the longest edge at AVATAR_MAX_DIMENSION (512 px). */
const AVATAR_TARGET_RESOLUTION = {
  width: (AVATAR_MAX_DIMENSION * 3) / 4,
  height: AVATAR_MAX_DIMENSION,
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (file: PickedFile) => void;
};

const SHUTTER_SIZE = 72;
const CAPTURE_ERROR = 'Could not take the photo. Try again.';
const PERMISSION_TEXT = 'Allow camera access in Settings to take a profile photo.';

/** Default selfie guide, in ratios of the screen (see the detector's presets). */
const GUIDE_CENTER_X = 0.5;
const GUIDE_CENTER_Y = 0.42;
const GUIDE_DIAMETER = 0.72;

/** What the user sees above the shutter, for each detector status. */
const HINT: Record<FaceGuideStatus, string> = {
  unavailable: 'Face guide is not available on this phone',
  idle: 'Looking for your face',
  misaligned: 'Move your face inside the circle',
  ready: 'Hold still',
};

export function SelfieCamera({ visible, onClose, onCaptured }: Props) {
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  // JPEG only: the upload accepts JPEG and PNG for profile photos. The longest
  // edge matches AVATAR_MAX_DIMENSION (512), the same bound the gallery path
  // gets from the picker.
  const photo = usePhotoOutput({
    targetResolution: AVATAR_TARGET_RESOLUTION,
    containerFormat: 'jpeg',
    quality: 0.8,
    qualityPrioritization: 'balanced',
  });
  const face = useFaceDetector({ preset: 'selfie', outputs: photo });
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && !hasPermission && canRequestPermission) {
      void requestPermission();
    }
  }, [visible, hasPermission, canRequestPermission, requestPermission]);

  const canShow = device != null && hasPermission;
  // Face detection missing on this phone must not block the photo.
  const faceReady = face.ready || face.status === 'unavailable';
  const canShoot = canShow && faceReady && !capturing;

  const shoot = async () => {
    if (!canShoot) return;
    setCapturing(true);
    setError('');
    try {
      const file = await photo.capturePhotoToFile({ flashMode: 'off' }, {});
      onCaptured({
        fileUri: `file://${file.filePath}`,
        filename: `selfie-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 0,
      });
    } catch {
      setError(CAPTURE_ERROR);
    } finally {
      setCapturing(false);
    }
  };

  // Circle guide, in screen pixels, matching the detector's default selfie guide.
  const radiusPx = (width * GUIDE_DIAMETER) / 2;
  const cx = width * GUIDE_CENTER_X;
  const cy = height * GUIDE_CENTER_Y;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.root}>
        {canShow ? (
          <Camera
            {...face.camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible}
            onError={() => setError(CAPTURE_ERROR)}
          />
        ) : null}

        <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
          <Defs>
            <Mask id="face-guide-mask">
              <Rect x={0} y={0} width={width} height={height} fill={colors.onPrimary} />
              <Circle cx={cx} cy={cy} r={radiusPx} fill={colors.textStrong} />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={colors.scrim}
            mask="url(#face-guide-mask)"
          />
          <Circle
            cx={cx}
            cy={cy}
            r={radiusPx}
            fill="none"
            stroke={face.ready ? colors.status.done.solid : colors.onPrimary}
            strokeWidth={3}
          />
        </Svg>

        <SafeAreaView style={styles.topBar} edges={['top']}>
          <Text style={styles.hint}>{hintFor(face.status, hasPermission)}</Text>
        </SafeAreaView>

        <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
          {error ? <InlineError message={error} /> : null}
          <View style={styles.controls}>
            <Button variant="secondary" size="md" onPress={onClose} disabled={capturing}>
              Cancel
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ disabled: !canShoot, busy: capturing }}
              disabled={!canShoot}
              onPress={() => void shoot()}
              style={({ pressed }) => [
                styles.shutter,
                !canShoot && styles.shutterDisabled,
                pressed && styles.shutterPressed,
              ]}>
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function hintFor(status: FaceGuideStatus, hasPermission: boolean): string {
  return hasPermission ? HINT[status] : PERMISSION_TEXT;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.textStrong,
  },
  topBar: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s4,
    gap: spacing.s3,
    alignItems: 'center',
  },
  hint: {
    ...typography.body,
    color: colors.onPrimary,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterPressed: {
    opacity: 0.8,
  },
  shutterInner: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: radius.pill,
    backgroundColor: colors.onPrimary,
  },
});
