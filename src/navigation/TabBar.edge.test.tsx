/**
 * TabBar edge behaviour: a tab press another listener cancelled, the already
 * active tab, long press, an empty route list, an out-of-range active index
 * and which tab is announced as selected.
 */
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});

import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import { TabBar } from "./TabBar";

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});

function setup(names: string[], index: number, defaultPrevented = false) {
  const routes = names.map((name) => ({ key: `${name}-k`, name }));
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: {} }])
  );
  const navigation = {
    emit: jest.fn().mockReturnValue({ defaultPrevented }),
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
      />
    );
  });
  mounted.push(r);
  return { root: r.root, navigation };
}

const tab = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAll(
    (n) =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === "function"
  )[0];

describe("TabBar press handling", () => {
  it("does not switch tab when another listener cancelled the press", () => {
    const { root, navigation } = setup(["Home", "Jobs"], 0, true);
    act(() => tab(root, "Jobs").props.onPress());
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tabPress",
        target: "Jobs-k",
        canPreventDefault: true,
      })
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("pressing the tab you are already on does not switch (but still tells listeners)", () => {
    const { root, navigation } = setup(["Home", "Jobs"], 1);
    act(() => tab(root, "Jobs").props.onPress());
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tabPress" })
    );
  });

  it("a long press tells listeners (tabLongPress) and never switches tab by itself", () => {
    const { root, navigation } = setup(["Home", "Jobs"], 0);
    const node = tab(root, "Jobs");
    expect(typeof node.props.onLongPress).toBe("function");
    act(() => node.props.onLongPress());
    expect(navigation.emit).toHaveBeenCalledWith({
      type: "tabLongPress",
      target: "Jobs-k",
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe("TabBar odd state", () => {
  it("an empty route list renders without crashing", () => {
    expect(() => setup([], 0)).not.toThrow();
  });

  it.each([5, -1])(
    "an out-of-range active index (%i) crashes nothing and selects no tab",
    (i) => {
      const { root } = setup(["Home", "Jobs"], i);
      expect(
        root.findAll((n) => n.props.accessibilityState?.selected === true)
      ).toHaveLength(0);
    }
  );

  it("only the active tab is announced as selected", () => {
    const { root } = setup(["Home", "Jobs", "Customers"], 1);
    const selected = (label: string) =>
      tab(root, label).props.accessibilityState?.selected;
    expect(selected("Jobs")).toBe(true);
    expect(selected("Home")).not.toBe(true);
    expect(selected("Customers")).not.toBe(true);
  });
});
