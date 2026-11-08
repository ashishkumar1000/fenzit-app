/**
 * useAvatarUpload — change the signed-in person's own photo.
 *
 * Flow: pick (camera → square crop, or gallery downscaled to 512 px) → check type and size
 * on the device → ask the server for an upload link → PUT the file to storage
 * → confirm, so the server checks the file and saves it → store the fresh
 * profile. The server's check on confirm is the real gate; this one only
 * saves a wasted upload.
 */
import { useCallback, useState } from 'react';
import { usersApi, type ApiError } from '../../services';
import { currentResetEpoch } from '../../services/resetRegistry';
import { putToPresignedUrl } from '../../utils/r2Upload';
import { showPhotoSourceAlert, type PickOutcome } from '../technicianApp/photoPicker';
import type { PickedFile } from '../technicianApp/useAttachmentUpload';
import { setProfileFromServer } from '../profile';
import { AVATAR_MAX_BYTES, AVATAR_MAX_DIMENSION } from './profileDraft';
import { cropAvatar } from './avatarCrop';

const WRONG_TYPE = 'Use a JPG or PNG photo.';
const TOO_BIG = 'Photo must be 2 MB or smaller. Try a smaller photo.';
const GENERIC = 'Could not save your photo. Try again.';

/** A server message is shown as-is; anything else gets the generic copy. */
function uploadErrorMessage(err: unknown): string {
  const apiError = err as Partial<ApiError> | null;
  if (apiError && typeof apiError.status === 'number' && apiError.message) {
    return apiError.message;
  }
  return GENERIC;
}

export function useAvatarUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  const upload = useCallback(async (file: { fileUri: string; mimeType: string; fileSize: number }) => {
    if (file.mimeType !== 'image/jpeg' && file.mimeType !== 'image/png') {
      setError(WRONG_TYPE);
      return;
    }
    if (file.fileSize > AVATAR_MAX_BYTES) {
      setError(TOO_BIG);
      return;
    }
    const mimeType = file.mimeType;
    setBusy(true);
    setError('');
    const epochAtStart = currentResetEpoch();
    try {
      // An unknown size (0) is sent as 1; the server measures the real file
      // on confirm and rejects anything over 2 MB.
      const ticket = await usersApi.requestAvatarUpload({
        mimeType,
        sizeBytes: Math.max(1, file.fileSize),
      });
      await putToPresignedUrl(ticket.uploadUrl, file.fileUri, mimeType, ticket.maxBytes);
      const profile = await usersApi.confirmAvatar({ key: ticket.key });
      if (currentResetEpoch() !== epochAtStart) return;
      setProfileFromServer(profile);
    } catch (err) {
      if (currentResetEpoch() === epochAtStart) setError(uploadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const onPicked = useCallback(
    (outcome: PickOutcome) => {
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      const file = outcome.files[0];
      if (file) void upload(file);
    },
    [upload],
  );

  const changePhoto = useCallback(() => {
    showPhotoSourceAlert(1, onPicked, {
      maxDimension: AVATAR_MAX_DIMENSION,
      // "Take photo" opens the in-app camera with a face guide, not the
      // system camera.
      onTakePhoto: () => setCameraOpen(true),
    });
  }, [onPicked]);

  const closeCamera = useCallback(() => setCameraOpen(false), []);

  // The camera photo is cropped to a square first; the person can back out of
  // the cropper, which sends nothing.
  const onCaptured = useCallback(
    (file: PickedFile) => {
      setCameraOpen(false);
      cropAvatar(file.fileUri)
        .then((cropped) => {
          if (cropped) void upload(cropped);
        })
        .catch(() => setError(GENERIC));
    },
    [upload],
  );

  return { busy, error, changePhoto, cameraOpen, closeCamera, onCaptured };
}
