/**
 * Avatar — probe for the variant contract: the default tint variant keeps
 * its name-derived pair, and the `onColor` variant (for sitting on a
 * brand-colored surface) renders the white disc with primary initials.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { colors } from '../../theme';
import { Avatar } from './Avatar';

function render(element: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

/** Flattened backgroundColor of a node's (possibly array) style. */
function backgroundColorOf(node: ReactTestRenderer.ReactTestInstance): unknown {
  const style = node.props?.style;
  const bg = Array.isArray(style)
    ? style.find(s => s?.backgroundColor)?.backgroundColor
    : style?.backgroundColor;
  return bg;
}

describe('Avatar', () => {
  it('onColor variant: white disc with primary initials', () => {
    const renderer = render(
      React.createElement(Avatar, { name: 'Priya', size: 'sm', variant: 'onColor' }),
    );
    const discs = renderer.root.findAll(
      node => typeof node.type === 'string' && backgroundColorOf(node) === colors.onPrimary,
    );
    expect(discs).toHaveLength(1);
    const initials = renderer.root.findByProps({ children: 'P' });
    expect(initials.props.style.color).toBe(colors.primary);
  });

  it('default tint variant: name-derived background (not the onColor white)', () => {
    const renderer = render(React.createElement(Avatar, { name: 'Priya', size: 'sm' }));
    const parent = renderer.root.findByProps({ children: 'P' }).parent;
    if (!parent) throw new Error('initials Text has no parent disc');
    const bg = backgroundColorOf(parent);
    expect(bg).not.toBe(colors.onPrimary);
    expect(typeof bg).toBe('string');
  });

  describe('malformed name', () => {
    const cases: Array<[string, unknown]> = [
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['a number', 42],
      ['an object', { a: 1 }],
    ];
    it.each(cases)('name %s does not throw and shows the ? placeholder', (_label, name) => {
      expect(() =>
        render(React.createElement(Avatar, { name } as unknown as React.ComponentProps<typeof Avatar>)),
      ).not.toThrow();
      const renderer = render(
        React.createElement(Avatar, { name } as unknown as React.ComponentProps<typeof Avatar>),
      );
      // Blank name -> the single '?' placeholder, never 'undefined'/'null'/'42'.
      const shown = renderer.root
        .findAllByType(Text)
        .map(t => [t.props.children].flat().join(''))
        .join('');
      expect(shown).toBe('?');
    });
  });
});
