/**
 * Tests for the front-camera path used by the avatar "Take photo" option:
 * `takePhoto(..., 'front')` must ask for the front lens, the default call must
 * not ask for any lens, a denied permission or a camera error must never reach
 * the camera, and the `onTakePhoto` hook must replace the default camera path.
 * The default camera options are pinned in photoPicker.test.ts.
 */
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { showPhotoSourceAlert, takePhoto, type PickOutcome } from './photoPicker';

const alertSpy = jest.spyOn(Alert, 'alert');
const launchCameraMock = launchCamera as jest.Mock;
const permissionRequestMock = jest.spyOn(PermissionsAndroid, 'request');

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

beforeEach(() => {
  jest.resetAllMocks();
  alertSpy.mockImplementation(() => {});
  setPlatform('ios');
  permissionRequestMock.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as never);
});

/** Runs takePhoto and resolves with the outcome it reports. */
function runTakePhoto(cameraType?: 'front' | 'back'): Promise<PickOutcome> {
  return new Promise((resolve) => {
    void takePhoto((outcome) => resolve(outcome), 512, cameraType);
  });
}

describe('takePhoto front camera', () => {
  it('asks the camera for the front lens, at the given size', async () => {
    launchCameraMock.mockResolvedValue({ assets: [] });
    await runTakePhoto('front');
    expect(launchCameraMock).toHaveBeenCalledWith(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 512,
        maxHeight: 512,
        saveToPhotos: false,
        cameraType: 'front',
      },
      undefined,
    );
  });

  it('sends no cameraType at all when none is given (default camera)', async () => {
    launchCameraMock.mockResolvedValue({ assets: [] });
    await runTakePhoto();
    const options = launchCameraMock.mock.calls[0][0];
    expect(Object.keys(options)).not.toContain('cameraType');
  });

  it('never opens the camera when Android denies the permission', async () => {
    setPlatform('android');
    permissionRequestMock.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED as never);
    const outcome = await runTakePhoto('front');
    expect(launchCameraMock).not.toHaveBeenCalled();
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBe('Camera permission is needed to take photos');
  });

  it('reports the camera error message when the front lens is unavailable', async () => {
    launchCameraMock.mockResolvedValue({
      errorCode: 'camera_unavailable',
      errorMessage: 'No front camera',
    });
    const outcome = await runTakePhoto('front');
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBe('No front camera');
  });

  it('falls back to generic copy when the camera error has no message', async () => {
    launchCameraMock.mockResolvedValue({ errorCode: 'camera_unavailable' });
    const outcome = await runTakePhoto('front');
    expect(outcome.files).toEqual([]);
    expect(outcome.error).toBe('Could not open the camera');
  });

  it('returns the captured photo as a JPEG with its file URI', async () => {
    launchCameraMock.mockResolvedValue({
      assets: [{ uri: 'file:///cache/selfie.jpg', type: 'image/jpeg', fileName: 'selfie.jpg', fileSize: 1200 }],
    });
    const outcome = await runTakePhoto('front');
    expect(outcome.error).toBeUndefined();
    expect(outcome.files).toHaveLength(1);
    expect(outcome.files[0]).toMatchObject({
      fileUri: 'file:///cache/selfie.jpg',
      mimeType: 'image/jpeg',
    });
  });
});

describe('showPhotoSourceAlert onTakePhoto hook', () => {
  it('calls the hook instead of the default camera when Take photo is pressed', () => {
    const onTakePhoto = jest.fn();
    showPhotoSourceAlert(1, () => {}, { maxDimension: 512, onTakePhoto });
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    buttons[0].onPress?.();
    expect(onTakePhoto).toHaveBeenCalledTimes(1);
    expect(launchCameraMock).not.toHaveBeenCalled();
  });
});
