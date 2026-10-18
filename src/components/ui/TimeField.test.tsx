/**
 * Tests for the DS `TimeField` (Story 18-4 §10, D-TP1/D-TP4 + the triage
 * patches): the labeled tap-to-open time field. A press opens the
 * TimePickerSheet — hour / minute / am-pm wheels on a DRAFT that commits
 * only on Done. A drag can't be driven in jest, so the wheels are exercised
 * through their screen-reader "increment"/"decrement" actions (the same
 * onChange path a scroll settle takes).
 *
 * Pins: label/value/error/helper slots; the opening time (value →
 * placeholder → 09:00) shown in 12-hour form; 12 am / 12 pm ↔ 00:xx / 12:xx;
 * minute 59→00 and hour 12→1 wraps; am/pm clamps; Done commits zero-padded
 * 24-hour "HH:mm"; closing without Done commits nothing and the next open
 * re-seeds; the Clear action (clearable optional
 * times — empty MEANS removal on the 18-2 wire); the a11y contract.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Modal, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from './Button';
import { TimeField } from './TimeField';

const realOs = Platform.OS;

function renderField(
  props: React.ComponentProps<typeof TimeField>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    // The rendered Sheet now carries the system bottom inset in its footer
    // (SafeAreaProvider contract, as at app root) — zero insets here.
    renderer = create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}>
        <TimeField {...props} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

/** The field row's Pressable: role button + onPress + our a11y label
 *  (the composite Pressable is mirrored by a host View in the test tree,
 *  so require an onPress — only the composite carries one). */
function findFieldButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  const matches = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(matches.length).toBeGreaterThanOrEqual(1);
  return matches[0];
}

/** The "Clear" action: role button whose a11y label starts with "Clear".
 *  The onPress requirement collapses the RTR host mirrors (the findFieldButton idiom). */
function findClearButton(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Clear'),
  );
}

function sheetVisible(renderer: ReactTestRenderer.ReactTestRenderer): boolean {
  const modals = renderer.root.findAllByType(Modal);
  expect(modals.length).toBe(1);
  return Boolean(modals[0].props.visible);
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

beforeEach(() => {
  Platform.OS = realOs;
});

afterEach(() => {
  Platform.OS = realOs;
});

describe('TimeField', () => {
  it('renders label, value, error INSTEAD of helper; nothing open', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
      placeholder: '09:00',
      error: 'Check-out must be after check-in',
      helper: 'Pick a check-in time',
    });
    const shown = texts(renderer);
    expect(shown).toContain('Check-in time');
    expect(shown).toContain('08:57');
    expect(shown).toContain('Check-out must be after check-in');
    // Error replaces helper (the Input anatomy).
    expect(shown).not.toContain('Pick a check-in time');
  });

  it('the helper renders when there is no error', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '',
      onChangeValue: jest.fn(),
      helper: 'Pick a check-in time',
    });
    expect(texts(renderer)).toContain('Pick a check-in time');
  });

  /** A wheel by its a11y name. */
  function wheel(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
    const found = renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'adjustable' &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onAccessibilityAction === 'function',
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
    return found[0];
  }

  function step(
    renderer: ReactTestRenderer.ReactTestRenderer,
    label: 'Hour' | 'Minute' | 'AM or PM',
    action: 'increment' | 'decrement',
  ) {
    act(() => {
      wheel(renderer, label).props.onAccessibilityAction({ nativeEvent: { actionName: action } });
    });
  }

  /** What the wheels currently show, e.g. "9:05 am". */
  function shown(renderer: ReactTestRenderer.ReactTestRenderer): string {
    const v = (label: string) => wheel(renderer, label).props.accessibilityValue.text;
    return `${Number(v('Hour'))}:${v('Minute')} ${v('AM or PM')}`;
  }

  function pressDone(renderer: ReactTestRenderer.ReactTestRenderer) {
    const done = renderer.root.findAllByType(Button).find(b => b.props.children === 'Done');
    expect(done).toBeTruthy();
    act(() => {
      done!.props.onPress();
    });
  }

  function open(props: React.ComponentProps<typeof TimeField>) {
    const renderer = renderField(props);
    expect(sheetVisible(renderer)).toBe(false);
    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(sheetVisible(renderer)).toBe(true);
    return renderer;
  }

  const base = { label: 'Start time', onChangeValue: jest.fn() };

  it('opens at the value in 12-hour form; empty → placeholder; no placeholder → 09:00', () => {
    expect(shown(open({ ...base, value: '08:57' }))).toBe('8:57 AM');
    expect(shown(open({ ...base, value: '', placeholder: '18:00' }))).toBe('6:00 PM');
    expect(shown(open({ ...base, value: '' }))).toBe('9:00 AM');
    // A malformed value is never shown to the owner as the starting time.
    expect(shown(open({ ...base, value: '9:5' }))).toBe('9:00 AM');
  });

  it('maps midnight, noon and the last minute of the day correctly', () => {
    expect(shown(open({ ...base, value: '00:00' }))).toBe('12:00 AM');
    expect(shown(open({ ...base, value: '12:00' }))).toBe('12:00 PM');
    expect(shown(open({ ...base, value: '23:59' }))).toBe('11:59 PM');
  });

  it('Done commits the stepped time as zero-padded 24-hour HH:mm', () => {
    const onChangeValue = jest.fn();
    const renderer = open({ ...base, onChangeValue, value: '09:05' });
    step(renderer, 'Minute', 'increment');
    step(renderer, 'Minute', 'increment');
    step(renderer, 'Hour', 'decrement');
    expect(shown(renderer)).toBe('8:07 AM');
    expect(onChangeValue).not.toHaveBeenCalled();
    pressDone(renderer);
    expect(onChangeValue).toHaveBeenCalledTimes(1);
    expect(onChangeValue).toHaveBeenCalledWith('08:07');
    expect(sheetVisible(renderer)).toBe(false);
  });

  it('pm is 12 hours later and 12 am is hour 00', () => {
    const toPm = jest.fn();
    const r1 = open({ ...base, onChangeValue: toPm, value: '09:30' });
    step(r1, 'AM or PM', 'increment');
    pressDone(r1);
    expect(toPm).toHaveBeenCalledWith('21:30');

    const midnight = jest.fn();
    const r2 = open({ ...base, onChangeValue: midnight, value: '01:15' });
    step(r2, 'Hour', 'decrement');
    expect(shown(r2)).toBe('12:15 AM');
    pressDone(r2);
    expect(midnight).toHaveBeenCalledWith('00:15');

    const noon = jest.fn();
    const r3 = open({ ...base, onChangeValue: noon, value: '12:15' });
    step(r3, 'Hour', 'increment');
    expect(shown(r3)).toBe('1:15 PM');
    pressDone(r3);
    expect(noon).toHaveBeenCalledWith('13:15');
  });

  it('wraps round: minute 59→00 and 00→59 keep the hour; hour 12→1 and 1→12 keep am/pm', () => {
    const renderer = open({ ...base, value: '23:59' });
    step(renderer, 'Minute', 'increment');
    expect(shown(renderer)).toBe('11:00 PM');
    step(renderer, 'Minute', 'decrement');
    expect(shown(renderer)).toBe('11:59 PM');
    step(renderer, 'Hour', 'increment');
    expect(shown(renderer)).toBe('12:59 PM');
    step(renderer, 'Hour', 'increment');
    expect(shown(renderer)).toBe('1:59 PM');
    step(renderer, 'Hour', 'decrement');
    expect(shown(renderer)).toBe('12:59 PM');
  });

  it('am/pm does not wrap: pm cannot go past pm, am cannot go before am', () => {
    const renderer = open({ ...base, value: '09:00' });
    step(renderer, 'AM or PM', 'decrement');
    expect(shown(renderer)).toBe('9:00 AM');
    step(renderer, 'AM or PM', 'increment');
    step(renderer, 'AM or PM', 'increment');
    expect(shown(renderer)).toBe('9:00 PM');
  });

  it('a chip sets the wheels but commits nothing until Done; it is marked only while the wheels match', () => {
    const onChangeValue = jest.fn();
    const renderer = open({
      ...base,
      onChangeValue,
      value: '08:57',
      placeholder: '09:00',
      presets: ['08:30', '09:00', '09:30'],
    });
    const chip = (label: string) =>
      renderer.root.findAll(
        n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
      )[0];
    // Chips read as plain times; nothing is marked while the wheels are on 08:57.
    expect(texts(renderer)).toContain('09:00 AM');
    expect(texts(renderer).join(' ')).not.toContain('Default');
    expect(chip('Set Start time to 09:30 AM').props.accessibilityState.selected).toBe(false);

    act(() => {
      chip('Set Start time to 09:30 AM').props.onPress();
    });
    expect(shown(renderer)).toBe('9:30 AM');
    expect(chip('Set Start time to 09:30 AM').props.accessibilityState.selected).toBe(true);
    expect(onChangeValue).not.toHaveBeenCalled();

    // Nudging the wheels off the chip's time un-marks it.
    step(renderer, 'Minute', 'increment');
    expect(chip('Set Start time to 09:30 AM').props.accessibilityState.selected).toBe(false);

    act(() => {
      chip('Set Start time to 09:00 AM').props.onPress();
    });
    pressDone(renderer);
    expect(onChangeValue).toHaveBeenCalledWith('09:00');
  });

  it('shows the subtitle under the title', () => {
    const renderer = open({
      ...base,
      value: '09:00',
      pickerSubtitle: 'Select official clock-in schedule',
    });
    expect(texts(renderer)).toContain('Select official clock-in schedule');
  });

  it('closing without Done commits nothing, and the next open starts from the saved value', () => {
    const onChangeValue = jest.fn();
    const renderer = open({ ...base, onChangeValue, value: '08:57' });
    step(renderer, 'Hour', 'increment');
    expect(shown(renderer)).toBe('9:57 AM');
    act(() => {
      renderer.root.findByType(Modal).props.onRequestClose();
    });
    expect(sheetVisible(renderer)).toBe(false);
    expect(onChangeValue).not.toHaveBeenCalled();

    act(() => {
      findFieldButton(renderer).props.onPress();
    });
    expect(shown(renderer)).toBe('8:57 AM');
  });

  it('CLEAR: a filled clearable field offers the action; pressing empties it', () => {
    const onChangeValue = jest.fn();
    const renderer = renderField({
      label: 'Check-out time (optional)',
      value: '18:00',
      onChangeValue,
      clearable: true,
    });
    const clears = findClearButton(renderer);
    expect(clears).toHaveLength(1);
    expect(clears[0].props.accessibilityLabel).toBe(
      'Clear Check-out time (optional)',
    );
    act(() => {
      clears[0].props.onPress();
    });
    expect(onChangeValue).toHaveBeenCalledWith('');
  });

  it('CLEAR: an empty clearable field and a non-clearable field offer no action', () => {
    const empty = renderField({
      label: 'Check-out time (optional)',
      value: '',
      onChangeValue: jest.fn(),
      clearable: true,
      placeholder: '18:00',
    });
    expect(findClearButton(empty)).toHaveLength(0);

    const required = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
    });
    expect(findClearButton(required)).toHaveLength(0);
  });

  it('carries the a11y contract: role button, "{label}, {value}" label, open hint', () => {
    const renderer = renderField({
      label: 'Check-in time',
      value: '08:57',
      onChangeValue: jest.fn(),
      placeholder: '09:00',
    });
    const btn = findFieldButton(renderer);
    expect(btn.props.accessibilityLabel).toBe('Check-in time, 08:57');
    expect(btn.props.accessibilityHint).toBe('Opens the time picker.');
  });

  it('an empty value shows the placeholder in the row and in the a11y label', () => {
    const renderer = renderField({
      label: 'Check-out time (optional)',
      value: '',
      onChangeValue: jest.fn(),
      placeholder: '18:00',
    });
    expect(texts(renderer)).toContain('18:00');
    expect(findFieldButton(renderer).props.accessibilityLabel).toBe(
      'Check-out time (optional), 18:00',
    );
  });
});
