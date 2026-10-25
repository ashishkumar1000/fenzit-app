/**
 * Guard for the Animated pin in jest.setup.js: that patch covers only the
 * timing/spring/decay factories (plus loop), so a useNativeDriver: true
 * animation entering through any OTHER entry point (Animated.event,
 * Animated.delay, a future API) would re-open the crash class the pin
 * closed — delayed native animations crash findNodeHandle in RN 0.87's
 * jest environment (getNativeTagFromPublicInstance missing; CI run #6).
 *
 * This test fails when a new native-driver call site appears anywhere in
 * src/, forcing a conscious choice: build it on the pinned factories
 * (update the allowlist here) or extend the jest.setup.js patch.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// Every file allowed to carry `useNativeDriver: true`, with its occurrence
// count — all of them route through the pinned timing/spring/decay factories.
const ALLOWED = {
  'src/components/ui/Button.tsx': 2,
  'src/components/ui/Card.tsx': 1,
  'src/components/ui/IconButton.tsx': 1,
  'src/components/ui/Skeleton.tsx': 3,
  'src/features/attendance/home/SetupPending.tsx': 1,
  'src/features/attendance/offices/PickerCentrePin.tsx': 2,
};

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Count matches on code lines only — a commented-out call site is not one. */
function countNativeDriverTrue(file) {
  const code = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
  return (code.match(/useNativeDriver:\s*true/g) ?? []).length;
}

describe('native-driver animation allowlist', () => {
  it('keeps every useNativeDriver: true on the pinned-factory allowlist', () => {
    const actual = {};
    for (const file of collectFiles(SRC)) {
      const count = countNativeDriverTrue(file);
      if (count > 0) {
        actual[path.relative(path.join(__dirname, '..'), file).split(path.sep).join('/')] =
          count;
      }
    }
    expect(actual).toEqual(ALLOWED);
  });
});

describe('Animated pin (jest.setup.js)', () => {
  it('completes native-driver animations instantly with the end value applied', () => {
    const { Animated } = require('react-native');
    const value = new Animated.Value(0);
    let result;
    Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }).start(
      ({ finished }) => {
        result = finished;
      },
    );
    // Synchronous completion proves the patch is active: without it this
    // animation schedules RAF frames and the crash class returns under load.
    expect(value.__getValue()).toBe(1);
    expect(result).toBe(true);
  });
});
