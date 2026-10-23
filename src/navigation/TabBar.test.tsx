/**
 * TabBar labels at large system font (R-17): capped at 1.3x, one line,
 * shrinking a little (adjustsFontSizeToFit) rather than truncating. Also
 * unknown routes, label fallback and press behaviour.
 */
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { TabBar } from './TabBar';

function setup(names: string[], labels: Record<string, string | undefined> = {}, index = 0) {
  const routes = names.map((name) => ({ key: `${name}-k`, name }));
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: { tabBarLabel: labels[r.name] } }]),
  );
  const navigation = {
    emit: jest.fn().mockReturnValue({ defaultPrevented: false }),
    navigate: jest.fn(),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(
      <TabBar
        state={{ index, routes } as never}
        descriptors={descriptors as never}
        navigation={navigation as never}
        insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
      />,
    );
  });
  return { root: r.root, navigation, r };
}

const labelNode = (root: ReactTestRenderer.ReactTestInstance, text: string) =>
  root.findAllByType(Text).find((t) => t.props.children === text)!;

describe('TabBar labels', () => {
  it('every label caps at 1.3x, one line, and shrinks to fit instead of truncating', () => {
    // The shipped owner footer (2026-10: Attendance took Customers' slot).
    const { root, r } = setup(['Home', 'Jobs', 'Attendance', 'More'], { More: 'Account' });
    for (const t of ['Home', 'Jobs', 'Attendance', 'Account']) {
      const n = labelNode(root, t);
      expect(n.props.maxFontSizeMultiplier).toBe(1.3);
      expect(n.props.adjustsFontSizeToFit).toBe(true);
      expect(n.props.numberOfLines).toBe(1);
      expect(n.props.minimumFontScale).toBeGreaterThan(0);
      expect(n.props.minimumFontScale).toBeLessThan(1);
    }
    act(() => r.unmount());
  });

  it('a very long label keeps the same caps (nothing special-cased)', () => {
    const { root, r } = setup(['Home'], { Home: 'Attendance and leave approvals' });
    const n = labelNode(root, 'Attendance and leave approvals');
    expect(n.props.maxFontSizeMultiplier).toBe(1.3);
    expect(n.props.adjustsFontSizeToFit).toBe(true);
    act(() => r.unmount());
  });

  it('falls back to the route name when no string label is set; unknown routes do not crash', () => {
    const { root, r } = setup(['Home', 'MysteryRoute']);
    expect(labelNode(root, 'MysteryRoute')).toBeTruthy();
    act(() => r.unmount());
  });

  it('pressing an inactive tab navigates; pressing the active one does not', () => {
    const { root, navigation, r } = setup(['Home', 'Jobs'], {}, 0);
    const press = (label: string) =>
      root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    act(() => press('Home').props.onPress());
    expect(navigation.navigate).not.toHaveBeenCalled();
    act(() => press('Jobs').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('Jobs');
    act(() => r.unmount());
  });
});
