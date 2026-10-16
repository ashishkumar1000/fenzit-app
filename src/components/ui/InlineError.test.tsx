/**
 * Tests for InlineError — the danger banner. Pinned here:
 *  - Renders the message inside an accessibilityRole="alert" container.
 *  - The root carries a definite-height floor (touch.min): inside native-
 *    sheet content (TrueSheet) an unfloored text row mis-measured on device
 *    and the address picker's resolve-failure banner rendered as an
 *    icon-only ~19dp sliver with no text. If the floor regresses, that
 *    ships again with the whole suite green.
 *  - The optional dismiss button renders only when `onDismiss` is provided.
 */
import type ReactTestRenderer from 'react-test-renderer';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { InlineError } from './InlineError';
import { touch } from '../../theme';

function renderError(
  props: React.ComponentProps<typeof InlineError>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<InlineError {...props} />);
  });
  return renderer;
}

function alertContainer(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityRole: 'alert' });
}

function messageText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return alertContainer(renderer).findByType(Text);
}

/** Resolve nested style arrays to a flat object so we can read minHeight. */
function flatStyle(node: { props: { style?: StyleProp<ViewStyle> } }) {
  return StyleSheet.flatten(node.props.style) as Record<string, unknown> | null;
}

describe('InlineError', () => {
  it('renders the message in an alert container', () => {
    const renderer = renderError({ message: 'Could not reach the server.' });
    expect(messageText(renderer).props.children).toBe('Could not reach the server.');
    expect(alertContainer(renderer)).toBeDefined();
  });

  it('floors the banner at the touch minimum', () => {
    const renderer = renderError({ message: 'floor' });
    const style = flatStyle(alertContainer(renderer));
    expect(style?.minHeight).toBe(touch.min);
  });

  it('no dismiss button when onDismiss is omitted', () => {
    const renderer = renderError({ message: 'x' });
    expect(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Dismiss' }),
    ).toThrow();
  });

  it('dismiss button renders when onDismiss is provided and fires it on tap', () => {
    const onDismiss = jest.fn();
    const renderer = renderError({ message: 'x', onDismiss });
    const btn = renderer.root.findByProps({ accessibilityLabel: 'Dismiss' });
    act(() => {
      btn.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
