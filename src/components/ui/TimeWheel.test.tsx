/**
 * TimeWheel — the finger path (the screen-reader path is covered by the
 * TimeField tests): a settled scroll reports the row's value, a looped wheel
 * is re-centred when it settles near an end of the stack, an unchanged value
 * reports nothing, and a stray offset never reports an out-of-range index.
 */
import { act, create } from 'react-test-renderer';
import { FlatList } from 'react-native';
import { TimeWheel, WHEEL_ROW_H } from './TimeWheel';

const ITEMS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function setup(props: Partial<React.ComponentProps<typeof TimeWheel>> = {}) {
  const onChange = jest.fn();
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(
      <TimeWheel label="Hour" items={ITEMS} index={0} onChange={onChange} width={72} {...props} />,
    );
  });
  const list = () => r.root.findByType(FlatList);
  const settleAt = (row: number, extraY = 0) =>
    act(() => {
      list().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: row * WHEEL_ROW_H + extraY } } });
    });
  return { onChange, settleAt, r };
}

describe('TimeWheel settle (non-looping, e.g. AM/PM)', () => {
  const PERIODS = ['AM', 'PM'];
  it('reports the settled row as the new value', () => {
    const { onChange, settleAt } = setup({ items: PERIODS, index: 0 });
    settleAt(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('reports nothing when it settles on the value it already had', () => {
    const { onChange, settleAt } = setup({ items: PERIODS, index: 0 });
    settleAt(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps an overscroll past either end (iOS bounce) to a real row', () => {
    const { onChange, settleAt } = setup({ items: PERIODS, index: 0 });
    settleAt(5);
    expect(onChange).toHaveBeenCalledWith(1);
    settleAt(-3);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('rounds a slightly short Android snap to the nearest row', () => {
    const { onChange, settleAt } = setup({ items: PERIODS, index: 0 });
    settleAt(1, -4);
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

describe('TimeWheel settle (looping, e.g. hours)', () => {
  const n = ITEMS.length;
  const MIDDLE = n * 2;

  it('reports the value (row % n) from the middle copy', () => {
    const { onChange, settleAt } = setup({ loop: true, index: 0 });
    settleAt(MIDDLE + 4);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('reports the same value from an outer copy (after a long spin) and still re-centres', () => {
    const { onChange, settleAt } = setup({ loop: true, index: 0 });
    settleAt(n * 4 + 7);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('wraps: the row just above 01 is 12', () => {
    const { onChange, settleAt } = setup({ loop: true, index: 0 });
    settleAt(MIDDLE - 1);
    expect(onChange).toHaveBeenCalledWith(n - 1);
  });

  it('stays quiet when a spin ends on the value already chosen', () => {
    const { onChange, settleAt } = setup({ loop: true, index: 3 });
    settleAt(n * 3 + 3);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TimeWheel accessibility', () => {
  it('is one adjustable control named by its label and valued by the shown item', () => {
    const { r } = setup({ index: 2 });
    const node = r.root.findAll((n) => n.props?.accessibilityRole === 'adjustable')[0];
    expect(node.props.accessibilityLabel).toBe('Hour');
    expect(node.props.accessibilityValue).toEqual({ text: '03' });
  });

  it('increment and decrement step one row, wrapping on a looped wheel', () => {
    const { r, onChange } = setup({ loop: true, index: 11 });
    const node = r.root.findAll((n) => n.props?.accessibilityRole === 'adjustable')[0];
    act(() => node.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    act(() => node.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('does not step past the ends of a non-looping wheel', () => {
    const { r, onChange } = setup({ items: ['AM', 'PM'], index: 1 });
    const node = r.root.findAll((n) => n.props?.accessibilityRole === 'adjustable')[0];
    act(() => node.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
