/**
 * OtpInput — N boxes backed by ONE hidden TextInput (the source of truth).
 *
 * Why a single input rather than N inputs: it lets the OS autofill drop the
 * whole code in at once (iOS Security Code AutoFill via textContentType
 * "oneTimeCode"; Android SMS Retriever via autoComplete "sms-otp"), supports
 * clipboard paste, and removes all the brittle per-box focus/back-space logic.
 * The boxes are plain Views that render the digits; tapping anywhere focuses
 * the hidden field. (Built from core RN — no extra dependency.)
 */
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import {colors, palette, radius, shadow, typography} from '../../../theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  length: number;
  autoFocus?: boolean;
  error?: boolean;
  /** Fires once the user has entered the full code. */
  onFilled?: (code: string) => void;
};

const BOX = 62;

export function OtpInput({
  value,
  onChange,
  length,
  autoFocus = true,
  error = false,
  onFilled,
}: Props) {
  // RN 0.87: the input's instance type (focus()/clear()/…), not the
  // component's props type.
  const inputRef = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  // Guards against re-firing onFilled when its identity changes (e.g. the
  // parent's callback is recreated mid-verification) while `value` hasn't.
  const firedFor = useRef<string | null>(null);

  const focus = () => inputRef.current?.focus();

  // Android's back gesture hides the keyboard WITHOUT blurring the field —
  // the box would keep its caret/"selected" look while nothing can be typed.
  // When the keyboard hides, drop the active state (blur only if THIS input
  // still holds focus, never stealing it from another field).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (inputRef.current?.isFocused()) {
        inputRef.current.blur();
        setFocused(false);
      }
    });
    return () => sub.remove();
  }, []);

  // R-09: when sign-in succeeds the auth screens unmount while this input is
  // still focused; on Android the keyboard can outlive it and cover the home
  // tab bar. Blur + dismiss on unmount so it never leaks past this screen.
  useEffect(() => {
    const input = inputRef.current;
    return () => {
      // Only when THIS input still holds focus, so we never hide the
      // keyboard of a field the next screen has just focused.
      if (input?.isFocused()) {
        input.blur();
        Keyboard.dismiss();
      }
    };
  }, []);

  // Fire onFilled exactly once per completed code, not on every render where
  // the callback identity happens to change.
  useEffect(() => {
    if (value.length === length && firedFor.current !== value) {
      firedFor.current = value;
      onFilled?.(value);
    }
    if (value.length < length) {
      firedFor.current = null;
    }
  }, [value, length, onFilled]);

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(digits);
  };

  const cells = Array.from({ length }, (_, i) => i);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={focus} style={styles.wrap}>
      {cells.map(i => {
        const char = value[i] ?? '';
        const isActive = focused && i === activeIndex;
        // The design's box states: a filled box shows its digit over a
        // primary underline; the active box is white (lifted) with a dark
        // caret/underline; an untouched box shows a quiet dot.
        return (
          <View
            key={i}
            style={[
              styles.box,
              isActive ? styles.boxActive : null,
              error ? styles.boxError : null,
            ]}>
            {char ? (
              <Text style={[styles.digit, error ? styles.digitError : null]}>
                {char}
              </Text>
            ) : isActive ? (
              <View style={[styles.caret, error ? styles.caretError : null]} />
            ) : (
              <View style={styles.dot} />
            )}
            <View
              style={[
                styles.underline,
                char ? styles.underlineFilled : null,
                isActive ? styles.underlineActive : null,
                error ? styles.underlineError : null,
              ]}
            />
          </View>
        );
      })}

      {/* The real input — overlaid and invisible. Captures keystrokes,
          paste, and OS autofill for every box at once. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        importantForAutofill="yes"
        caretHidden
        style={styles.hiddenInput}
        accessibilityLabel="One-time password"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.lg,
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    backgroundColor: colors.surfaceCard,
    ...shadow.sm,
  },
  boxError: {
    backgroundColor: palette.red50,
  },
  digit: {
    ...typography.display,
    fontSize: 26,
    color: colors.textStrong,
  },
  digitError: {
    color: colors.danger,
  },
  caret: {
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: colors.textStrong,
  },
  caretError: {
    backgroundColor: colors.danger,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.gray300,
  },
  underline: {
    position: 'absolute',
    bottom: 10,
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.blue200,
  },
  underlineFilled: {
    backgroundColor: colors.primary,
  },
  underlineActive: {
    backgroundColor: colors.textStrong,
  },
  underlineError: {
    backgroundColor: colors.danger,
  },
  // Invisible but present in the layout so the keyboard targets it.
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: BOX,
    opacity: 0,
  },
});
