/** GradientSurface — SVG ids are document-wide, so two surfaces must not share a gradient id. */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LinearGradient } from 'react-native-svg';
import { GradientSurface } from './GradientSurface';

describe('GradientSurface', () => {
  it('renders its children', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <GradientSurface>
          <Text>hello</Text>
        </GradientSurface>,
      );
    });
    expect(r.root.findAllByType(Text).map((t) => t.props.children)).toContain('hello');
  });

  it('gives each surface its own gradient id', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <>
          <GradientSurface pattern="pulse">
            <Text>a</Text>
          </GradientSurface>
          <GradientSurface pattern="map">
            <Text>b</Text>
          </GradientSurface>
        </>,
      );
    });
    const ids = r.root.findAllByType(LinearGradient).map((g) => g.props.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
