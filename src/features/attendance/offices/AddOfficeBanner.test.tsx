/** AddOfficeBanner — the whole banner is one "Add office" button. */
import { act, create } from 'react-test-renderer';
import AddOfficeBanner from './AddOfficeBanner';

describe('AddOfficeBanner', () => {
  it('is a single button labelled "Add office" that fires onPress', () => {
    const onPress = jest.fn();
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(<AddOfficeBanner onPress={onPress} />);
    });
    const buttons = r.root.findAll(
      (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === 'Add office' && typeof n.props.onPress === 'function',
    );
    expect(buttons.length).toBeGreaterThan(0);
    act(() => buttons[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
