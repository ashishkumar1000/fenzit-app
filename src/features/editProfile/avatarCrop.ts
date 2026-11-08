/**
 * avatarCrop — square, circle-previewed crop for a profile photo taken with
 * the in-app selfie camera. The person adjusts the crop, then confirms.
 * Backing out of the cropper is not an error: it returns null.
 */
import { openCropper } from 'react-native-image-crop-picker';
import type { PickedFile } from '../technicianApp/useAttachmentUpload';
import { AVATAR_MAX_DIMENSION } from './profileDraft';

/** The cropper's code when the person backs out without confirming. */
const CANCELLED_CODE = 'E_PICKER_CANCELLED';
/** JPEG quality for the cropped output (matches the camera capture). */
const CROP_QUALITY = 0.8;

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function toLocalPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice('file://'.length) : fileUri;
}

/**
 * Opens the cropper on a local file and returns the square result, or null
 * when the person cancels. Other failures are thrown to the caller.
 */
export async function cropAvatar(fileUri: string): Promise<PickedFile | null> {
  try {
    const image = await openCropper({
      path: toLocalPath(fileUri),
      width: AVATAR_MAX_DIMENSION,
      height: AVATAR_MAX_DIMENSION,
      cropping: true,
      cropperCircleOverlay: true,
      freeStyleCropEnabled: false,
      mediaType: 'photo',
      compressImageQuality: CROP_QUALITY,
    });
    return {
      fileUri: toFileUri(image.path),
      filename: `avatar-${Date.now()}.jpg`,
      mimeType: image.mime || 'image/jpeg',
      fileSize: image.size ?? 0,
    };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === CANCELLED_CODE) return null;
    throw err;
  }
}
