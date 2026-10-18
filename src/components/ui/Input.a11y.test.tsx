/**
 * Input accessibility (UX finding 28): the visible label is a separate Text,
 * so the field itself must carry the label (TalkBack otherwise reads only
 * the value) and the error / helper as its hint.
 */
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { Input } from './Input';

function field(props: React.ComponentProps<typeof Input>) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<Input {...props} />);
  });
  return r.root.findByType(TextInput);
}

describe('Input accessibility', () => {
  it('names the field by its label', () => {
    expect(field({ label: 'Late after (minutes)', value: '15' }).props.accessibilityLabel).toBe(
      'Late after (minutes)',
    );
  });

  it('reads the helper as the hint', () => {
    const f = field({ label: 'Name', helper: 'As staff see it' });
    expect(f.props.accessibilityHint).toBe('As staff see it');
  });

  it('the error replaces the helper as the hint', () => {
    const f = field({ label: 'Name', helper: 'As staff see it', error: 'Name is required' });
    expect(f.props.accessibilityHint).toBe('Name is required');
  });

  it('has no hint when there is neither helper nor error (not an empty string)', () => {
    expect(field({ label: 'Name' }).props.accessibilityHint).toBeUndefined();
  });

  it("a caller's own accessibilityLabel wins over the visible label", () => {
    const f = field({ label: 'Search', accessibilityLabel: 'Search offices' });
    expect(f.props.accessibilityLabel).toBe('Search offices');
  });

  it('with no label, adds none of its own', () => {
    expect(field({ value: 'x' }).props.accessibilityLabel).toBeUndefined();
  });
});
