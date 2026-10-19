/**
 * WeeklyOffUpcomingPanel edge cases: nothing queued, an unparseable date,
 * and duplicate rows (no React duplicate-key warning). The panel is
 * presentational and shows rows in the order the server sends them (the BE
 * sorts ascending), so it deliberately does not re-sort.
 */
import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import { WeeklyOffUpcomingPanel } from "./WeeklyOffUpcomingPanel";
import type { IsoWeekday, WeeklyOffView } from "../../../services";

const row = (days: IsoWeekday[], validFrom: string): WeeklyOffView => ({
  days,
  validFrom,
  validTo: null,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
  jest.restoreAllMocks();
});
function mount(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  mounted.push(r);
  return r;
}
const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(""));

describe("WeeklyOffUpcomingPanel edges", () => {
  it('with nothing queued it renders nothing, not a "0 changes coming up" header', () => {
    const r = mount(<WeeklyOffUpcomingPanel rows={[]} currentDays={[7]} />);
    expect(texts(r)).toEqual([]);
    expect(r.toJSON()).toBeNull();
  });

  it("an unparseable validFrom does not crash and the row still shows", () => {
    const r = mount(
      <WeeklyOffUpcomingPanel
        rows={[row([7], "not-a-date"), row([6], "")]}
        currentDays={[]}
      />
    );
    expect(texts(r).filter((x) => x === "EVERYONE")).toHaveLength(2);
    expect(texts(r)).toContain("2 changes coming up");
  });

  it('shows rows in the order given and chains "Till then" along that order', () => {
    const r = mount(
      <WeeklyOffUpcomingPanel
        rows={[row([5], "2099-01-01"), row([6], "2099-02-01")]}
        currentDays={[7]}
      />
    );
    const metas = texts(r).filter((x) => x.includes("Till then"));
    expect(metas).toEqual([
      "Fri off from this date. Till then: Sun off.",
      "Sat off from this date. Till then: Fri off.",
    ]);
  });

  it("duplicate rows raise no React duplicate-key warning", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const dup = row([7], "2099-01-01");
    const r = mount(
      <WeeklyOffUpcomingPanel rows={[dup, { ...dup }, dup]} currentDays={[6]} />
    );
    expect(texts(r).filter((x) => x === "EVERYONE")).toHaveLength(3);
    const keyWarnings = spy.mock.calls.filter((c) =>
      String(c[0]).includes("same key")
    );
    expect(keyWarnings).toEqual([]);
  });
});
