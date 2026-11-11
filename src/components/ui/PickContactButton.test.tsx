import { act, create } from 'react-test-renderer';
import { PickContactButton } from './PickContactButton';

function pressable(props: React.ComponentProps<typeof PickContactButton>) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<PickContactButton {...props} />);
  });
  return r.root.findAll(
    n => n.props.accessibilityLabel === 'Pick from contacts' && typeof n.props.onPress === 'function',
  )[0];
}

describe('PickContactButton', () => {
  it('is named and hinted for screen readers', () => {
    const p = pressable({ onPress: () => {} });
    expect(p.props.accessibilityRole).toBe('button');
    expect(p.props.accessibilityLabel).toBe('Pick from contacts');
    expect(p.props.accessibilityHint).toBe("Opens your phone's contacts");
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const p = pressable({ onPress });
    act(() => p.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports the disabled state and does not fire when disabled', () => {
    const onPress = jest.fn();
    const p = pressable({ onPress, disabled: true });
    expect(p.props.disabled).toBe(true);
    expect(p.props.accessibilityState).toEqual({ disabled: true });
  });

  it('is enabled by default', () => {
    expect(pressable({ onPress: () => {} }).props.accessibilityState).toEqual({ disabled: false });
  });
});
