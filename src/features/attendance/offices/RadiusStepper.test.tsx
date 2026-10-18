/** RadiusStepper — 1 m steps, clamped to the DB range 50–1000, presets set the value. */
import { act, create } from 'react-test-renderer';
import RadiusStepper, { RADIUS_MAX_M, RADIUS_MIN_M } from './RadiusStepper';

function setup(radiusM: number) {
  const onChange = jest.fn();
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<RadiusStepper radiusM={radiusM} onChange={onChange} />);
  });
  const btn = (label: string) =>
    r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  return { onChange, btn, r };
}

describe('RadiusStepper', () => {
  it('+ and − move by exactly 1 m', () => {
    const { onChange, btn } = setup(100);
    act(() => btn('Increase radius').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(101);
    act(() => btn('Decrease radius').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(99);
  });

  it('cannot go below the minimum', () => {
    const { onChange, btn } = setup(RADIUS_MIN_M);
    expect(btn('Decrease radius').props.disabled).toBe(true);
    act(() => btn('Decrease radius').props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot go above the maximum', () => {
    const { onChange, btn } = setup(RADIUS_MAX_M);
    expect(btn('Increase radius').props.disabled).toBe(true);
    act(() => btn('Increase radius').props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the last step before each limit is still allowed', () => {
    const low = setup(RADIUS_MIN_M + 1);
    act(() => low.btn('Decrease radius').props.onPress());
    expect(low.onChange).toHaveBeenCalledWith(RADIUS_MIN_M);
    const high = setup(RADIUS_MAX_M - 1);
    act(() => high.btn('Increase radius').props.onPress());
    expect(high.onChange).toHaveBeenCalledWith(RADIUS_MAX_M);
  });

  it.each([100, 150, 200, 250])('preset %i m sets that radius', (preset) => {
    const { onChange, r } = setup(120);
    const chip = r.root.findAll(
      (n) => typeof n.props?.onPress === 'function' && JSON.stringify(n.props?.accessibilityLabel ?? '').includes(String(preset)),
    )[0];
    expect(chip).toBeDefined();
    act(() => chip.props.onPress());
    expect(onChange).toHaveBeenCalledWith(preset);
  });
});
