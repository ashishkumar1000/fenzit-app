/**
 * TodayPulseCard edges. The card only ever receives a loaded ("ready") pulse:
 * loading (shimmer) and error (plain Attendance tile) are decided by
 * HomeScreen and covered in HomeScreen.test.tsx. Here: nobody tracked, share
 * rounding, tapping, and the spoken summary.
 * (checkedIn > tracked is a pending product decision, deliberately not tested.)
 */
import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import { TodayPulseCard } from "./TodayPulseCard";

type Pulse = Parameters<typeof TodayPulseCard>[0]["pulse"];
const pulse = (counts: Partial<Pulse["counts"]> = {}): Pulse =>
  ({
    status: "ready",
    date: "2026-10-24",
    counts: {
      tracked: 3,
      checkedIn: 1,
      notCheckedIn: 2,
      onLeave: 0,
      late: 0,
      ...counts,
    },
  } as Pulse);

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});
function mount(p: Pulse, onPress = jest.fn()) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(<TodayPulseCard pulse={p} onPress={onPress} />);
  });
  mounted.push(r);
  return { root: r.root, onPress };
}
const texts = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(""));

describe("TodayPulseCard edges", () => {
  it("nobody tracked but someone checked in shows 0%, never NaN or Infinity", () => {
    const { root } = mount(pulse({ tracked: 0, checkedIn: 2 }));
    const t = texts(root);
    expect(t).toContain("0%");
    expect(t.join("|")).not.toMatch(/NaN|Infinity/);
  });

  it("the share rounds to a whole percent (1 of 3 is 33%, 2 of 3 is 67%)", () => {
    expect(texts(mount(pulse({ tracked: 3, checkedIn: 1 })).root)).toContain(
      "33%"
    );
    expect(texts(mount(pulse({ tracked: 3, checkedIn: 2 })).root)).toContain(
      "67%"
    );
  });

  it("everyone checked in shows 100%", () => {
    expect(
      texts(mount(pulse({ tracked: 5, checkedIn: 5, notCheckedIn: 0 })).root)
    ).toContain("100%");
  });

  it("tapping the card calls onPress once", () => {
    const { root, onPress } = mount(pulse());
    const card = root.findAll(
      (n) =>
        n.props.accessibilityRole === "button" &&
        typeof n.props.onPress === "function"
    )[0];
    act(() => card.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("the spoken summary carries all four counts and says it opens attendance", () => {
    const { root } = mount(
      pulse({ checkedIn: 4, notCheckedIn: 3, onLeave: 2, late: 1 })
    );
    const card = root.findAll(
      (n) => typeof n.props.accessibilityLabel === "string"
    )[0];
    expect(card.props.accessibilityLabel).toBe(
      "Today's Pulse. Present 4, Not in yet 3, On Leave 2, Late 1. Open attendance"
    );
  });
});
