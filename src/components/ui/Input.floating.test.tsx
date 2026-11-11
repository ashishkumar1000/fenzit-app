/**
 * Input — floating-label and clear-button behaviour.
 *
 * The defaults must not change for the many screens that use Input without
 * these options. The floating variant puts the label in the border gap and
 * keeps the placeholder visible. The clear button only appears when it can
 * do something: the field has text, is editable and is not disabled.
 */
import { act, create } from 'react-test-renderer';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Input, type InputProps } from './Input';
import { FloatingLabel } from './FloatingLabel';
import { colors } from '../../theme';

function render(props: InputProps) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<Input {...props} />);
  });
  return r.root;
}

/** The clear button is the only Pressable with an onPress and a "Clear" label. */
function clearButton(root: ReturnType<typeof render>) {
  return root.findAll(
    n =>
      n.props.accessibilityRole === 'button' &&
      typeof n.props.onPress === 'function' &&
      /^Clear/.test(n.props.accessibilityLabel ?? ''),
  );
}

describe('Input default (no floating label, no clear)', () => {
  it('shows the label above the field as before', () => {
    const root = render({ label: 'City', value: '' });
    expect(root.findAllByType(FloatingLabel)).toHaveLength(0);
    expect(root.findAllByType(Text).some(t => [t.props.children].flat().join('') === 'City')).toBe(true);
  });

  it('never shows a clear button, even with text', () => {
    expect(clearButton(render({ label: 'City', value: 'Pune' }))).toHaveLength(0);
  });
});

describe('Input floatingLabel', () => {
  it('renders the label in the border gap and not above the field', () => {
    const root = render({ label: 'Customer name', value: '', floatingLabel: true });
    const floating = root.findByType(FloatingLabel);
    expect(floating.props.label).toBe('Customer name');
    // Exactly one text node carries the label: the one inside FloatingLabel.
    const labelTexts = root.findAllByType(Text).filter(t => [t.props.children].flat().join('') === 'Customer name');
    expect(labelTexts).toHaveLength(1);
  });

  it('keeps the placeholder visible while empty (the label does not replace it)', () => {
    const root = render({ label: 'Name', value: '', placeholder: 'e.g. Suresh Kumar', floatingLabel: true });
    expect(root.findByType(TextInput).props.placeholder).toBe('e.g. Suresh Kumar');
  });

  it('passes the required flag through so the asterisk shows in the notch', () => {
    const root = render({ label: 'Phone number', value: '', required: true, floatingLabel: true });
    expect(root.findByType(FloatingLabel).props.required).toBe(true);
  });

  it('names the field by its label for screen readers', () => {
    const root = render({ label: 'Name', value: '', floatingLabel: true });
    expect(root.findByType(TextInput).props.accessibilityLabel).toBe('Name');
  });

  it('shows no label when none is given', () => {
    expect(render({ value: '', floatingLabel: true }).findAllByType(FloatingLabel)).toHaveLength(0);
  });
});

describe('Input clearable', () => {
  it('shows no clear button while the field is empty', () => {
    expect(clearButton(render({ label: 'Name', value: '', clearable: true }))).toHaveLength(0);
  });

  it('shows a clear button named after the field once it has text', () => {
    const buttons = clearButton(render({ label: 'Name', value: 'Vel', clearable: true }));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.accessibilityLabel).toBe('Clear name');
  });

  it('tapping it empties the field through onChangeText', () => {
    const onChangeText = jest.fn();
    const root = render({ label: 'Name', value: 'Vel', clearable: true, onChangeText });
    act(() => clearButton(root)[0].props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
    expect(onChangeText).toHaveBeenCalledTimes(1);
  });

  it('is hidden when the field is disabled', () => {
    expect(clearButton(render({ label: 'Name', value: 'Vel', clearable: true, disabled: true }))).toHaveLength(0);
  });

  it('is hidden when the field is not editable (a tap target, not text entry)', () => {
    expect(clearButton(render({ label: 'Name', value: 'Vel', clearable: true, editable: false }))).toHaveLength(0);
  });

  it('is off unless asked for, even with text', () => {
    expect(clearButton(render({ label: 'Name', value: 'Vel' }))).toHaveLength(0);
  });
});

describe('FloatingLabel focus colour', () => {
  it('uses the brand colour while focused and the text colour otherwise', () => {
    const textOf = (element: React.ReactElement) => {
      let r!: ReturnType<typeof create>;
      act(() => {
        r = create(element);
      });
      return r.root.findByType(Text);
    };
    const idle = textOf(<FloatingLabel label="Name" focused={false} maskColor="#fff" />);
    const focused = textOf(<FloatingLabel label="Name" focused maskColor="#fff" />);
    expect(StyleSheet.flatten(focused.props.style).color).toBe(colors.primary);
    expect(StyleSheet.flatten(idle.props.style).color).toBe(colors.textStrong);
  });
});
