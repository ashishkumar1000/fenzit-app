/**
 * OtpInput — the Android keyboardDidHide fix (review finding): the back
 * gesture hides the keyboard WITHOUT blurring the field, so the box kept a
 * phantom caret. The effect must register on Android only, survive a fire
 * while the field holds no focus (the ref is null in the test renderer —
 * the real blur path stays device-verified), and clean up on unmount.
 */
import React from 'react';
import { Keyboard, Platform } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { OtpInput } from './OtpInput';

const realOs = Platform.OS;
function useOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function render() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(
      <OtpInput value="" onChange={() => {}} length={4} autoFocus={false} />,
    );
  });
  return r;
}

let addListenerSpy: jest.SpyInstance;

beforeEach(() => {
  useOs('android');
  addListenerSpy = jest.spyOn(Keyboard, 'addListener');
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: realOs, configurable: true });
  addListenerSpy.mockRestore();
});

it('on Android the keyboardDidHide listener is registered', () => {
  const r = render();

  expect(addListenerSpy).toHaveBeenCalledTimes(1);
  expect(addListenerSpy.mock.calls[0][0]).toBe('keyboardDidHide');

  act(() => r.unmount());
});

it('firing keyboardDidHide with no focused field is a no-op, not a crash', () => {
  const r = render();
  const handler = addListenerSpy.mock.calls[0][1] as () => void;

  act(() => {
    handler();
  });

  act(() => r.unmount());
});

it('unmount removes the subscription', () => {
  const remove = jest.fn();
  addListenerSpy.mockReturnValue({ remove } as ReturnType<typeof Keyboard.addListener>);

  const r = render();
  act(() => r.unmount());

  expect(remove).toHaveBeenCalledTimes(1);
});

it('on iOS no keyboard listener is registered (the bug is Android-only)', () => {
  useOs('ios');
  const r = render();

  expect(addListenerSpy).not.toHaveBeenCalled();

  act(() => r.unmount());
});
