/**
 * useWeeklyOffDefaultForm edge cases: a queued change dated in the past must
 * never seed a past effective date, and an impossible calendar date typed
 * into the effective-date field blocks Save.
 */
import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import type { IsoWeekday, WeeklyOffView } from "../../../services";
import {
  useWeeklyOffDefaultForm,
  type UseWeeklyOffDefaultFormOptions,
} from "./useWeeklyOffDefaultForm";

const TODAY = "2026-10-19";
const view = (days: IsoWeekday[], validFrom = "2026-01-01"): WeeklyOffView => ({
  days,
  validFrom,
  validTo: null,
});
const BASE: UseWeeklyOffDefaultFormOptions = {
  defaultView: view([6, 7]),
  nextView: null,
  history: [],
  configured: true,
  hasLoaded: true,
  isSaving: false,
  today: TODAY,
  saveDefault: jest.fn(),
  onSaved: jest.fn(),
};

let probe: ReturnType<typeof useWeeklyOffDefaultForm>;
function Probe(props: UseWeeklyOffDefaultFormOptions) {
  probe = useWeeklyOffDefaultForm(props);
  return null;
}
let renderer: ReactTestRenderer.ReactTestRenderer;
function mount(over: Partial<UseWeeklyOffDefaultFormOptions> = {}) {
  act(() => {
    renderer = create(<Probe {...BASE} {...over} />);
  });
}
afterEach(() => {
  act(() => renderer?.unmount());
});

describe("effective date seeding", () => {
  it("a queued change dated in the past does not seed a past date", () => {
    mount({ nextView: view([1], "2026-10-01") });
    expect(probe.effectiveFrom === "" || probe.effectiveFrom >= TODAY).toBe(
      true
    );
  });

  it("a stale past queued change leaves Save disabled (nothing the owner changed)", () => {
    mount({ nextView: view([1], "2026-10-01") });
    expect(probe.saveDisabled).toBe(true);
  });

  it("a queued change dated today or later is shown as is", () => {
    mount({ nextView: view([1], TODAY) });
    expect(probe.effectiveFrom).toBe(TODAY);
    act(() => renderer.unmount());
    mount({ nextView: view([1], "2026-10-20") });
    expect(probe.effectiveFrom).toBe("2026-10-20");
  });
});

describe("stale past queued change", () => {
  it("seeds the days from the current rule, not the stale queued one", () => {
    mount({ nextView: view([1], "2026-10-01") });
    expect(probe.selectedDays).toEqual([6, 7]);
  });
});

describe("after a successful save", () => {
  const savedWith = async (fresh: {
    next: WeeklyOffView | null;
    default: WeeklyOffView | null;
  }) => {
    const saveDefault = jest.fn().mockResolvedValue(fresh);
    mount({ saveDefault });
    act(() => probe.onDayToggle([1, 6, 7]));
    await act(async () => {
      await probe.onSave();
    });
    // The screen refetches after a save, so the props carry the fresh view.
    act(() =>
      renderer.update(
        <Probe
          {...BASE}
          saveDefault={saveDefault}
          defaultView={fresh.default}
          nextView={fresh.next}
        />
      )
    );
    return saveDefault;
  };

  it("a past-dated queued change in the fresh view is not re-seeded as the effective date", async () => {
    await savedWith({ default: view([1, 6, 7]), next: view([1], "2026-10-01") });
    expect(probe.effectiveFrom).toBe("");
    expect(probe.saveDisabled).toBe(true);
  });

  it("a queued change dated today or later in the fresh view is kept", async () => {
    await savedWith({ default: view([6, 7]), next: view([1], "2026-10-25") });
    expect(probe.effectiveFrom).toBe("2026-10-25");
  });
});

describe("effective date validation", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-10-1", "abc"])(
    'typed date "%s" is not a real date: Save stays disabled even with a day change',
    (bad) => {
      mount();
      act(() => probe.onDayToggle([1, 6, 7]));
      expect(probe.saveDisabled).toBe(false);
      act(() => probe.onEffectiveFromChange(bad));
      expect(probe.saveDisabled).toBe(true);
    }
  );

  it.each(["2028-02-29", "2026-12-31"])(
    'real date "%s" keeps Save enabled',
    (ok) => {
      mount();
      act(() => probe.onDayToggle([1, 6, 7]));
      act(() => probe.onEffectiveFromChange(ok));
      expect(probe.saveDisabled).toBe(false);
    }
  );

  it("clearing the date back to blank (use today) is valid", () => {
    mount();
    act(() => probe.onDayToggle([1, 6, 7]));
    act(() => probe.onEffectiveFromChange("2026-02-30"));
    act(() => probe.onEffectiveFromChange(""));
    expect(probe.saveDisabled).toBe(false);
  });
});
