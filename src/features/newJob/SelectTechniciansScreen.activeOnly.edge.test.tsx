/**
 * SelectTechniciansScreen (activeOnly, weekly-off employee picker) edges:
 * empty / invited-only rosters, search by employee code and phone, picking a
 * row and applying, blank search, and stable order for duplicate names.
 */
jest.mock("../profile", () => ({
  useMyProfile: jest.fn(),
}));

import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import SelectTechniciansScreen from "./SelectTechniciansScreen";
import { useMyProfile } from "../profile";

const tech = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  name,
  countryCode: "+91",
  phoneNumber: "9000000000",
  status: "active",
  skills: [],
  skillIds: [],
  createdAt: "2026-09-01T10:00:00Z",
  ...extra,
});

const EMPTY_COPY =
  "No active employees yet. Employees appear here once they accept their invite.";

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});

function setRoster(technicians: unknown[]) {
  (useMyProfile as jest.Mock).mockReturnValue({
    profile: { technicians },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });
}

function renderScreen() {
  const navigation = {
    goBack: jest.fn(),
    popTo: jest.fn(),
    navigate: jest.fn(),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(
      <SelectTechniciansScreen
        navigation={navigation as never}
        route={{ params: { activeOnly: true } } as never}
      />
    );
  });
  mounted.push(r);
  return { root: r.root, navigation };
}

type Root = ReactTestRenderer.ReactTestInstance;
const flat = (c: unknown): string =>
  Array.isArray(c)
    ? c.map(flat).join("")
    : typeof c === "string" || typeof c === "number"
    ? String(c)
    : "";
const allTexts = (root: Root) =>
  root.findAllByType(Text).map((t) => flat(t.props.children));
const names = (root: Root, list: string[]) =>
  allTexts(root).filter((t) => list.includes(t));
const search = (root: Root, q: string) =>
  act(() => {
    root.findByType(TextInput).props.onChangeText(q);
  });
const row = (root: Root, name: string) =>
  root.findAll(
    (n) =>
      typeof n.props.onPress === "function" &&
      typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.startsWith(name)
  )[0];
const apply = (root: Root) =>
  root.findAll(
    (n) =>
      typeof n.props.onPress === "function" &&
      flat(n.props.children) === "Apply selection"
  )[0];

describe("empty states", () => {
  it("an empty roster says there are no active employees yet", () => {
    setRoster([]);
    expect(allTexts(renderScreen().root)).toContain(EMPTY_COPY);
  });

  it("only invited or inactive staff gives the same empty copy and a zero total", () => {
    setRoster([
      tech("1", "Aaron", { status: "invited" }),
      tech("2", "Bina", { status: "inactive" }),
    ]);
    const t = allTexts(renderScreen().root);
    expect(t).toContain(EMPTY_COPY);
    expect(t).toContain("0 total");
    expect(t).not.toContain("Aaron");
    expect(t).not.toContain("Bina");
  });
});

describe("search", () => {
  beforeEach(() =>
    setRoster([
      tech("1", "Asha", { employeeCode: "EMP-1", phoneNumber: "9811122233" }),
      tech("2", "Bala", { employeeCode: "EMP-2", phoneNumber: "9722211100" }),
    ])
  );

  it("finds an employee by employee code", () => {
    // Phones here contain no "1": a code query's digits are also matched
    // against phone digits (shared digit search), which is reported separately.
    setRoster([
      tech("1", "Asha", { employeeCode: "EMP-1", phoneNumber: "9833322233" }),
      tech("2", "Bala", { employeeCode: "EMP-2", phoneNumber: "9722222200" }),
    ]);
    const { root } = renderScreen();
    search(root, "EMP-1");
    expect(names(root, ["Asha", "Bala"])).toEqual(["Asha"]);
  });

  it("finds an employee by phone digits", () => {
    const { root } = renderScreen();
    search(root, "97222");
    expect(names(root, ["Asha", "Bala"])).toEqual(["Bala"]);
  });

  it("a whitespace-only search shows the full list", () => {
    const { root } = renderScreen();
    search(root, "   ");
    expect(names(root, ["Asha", "Bala"])).toEqual(["Asha", "Bala"]);
  });

  it("a search with no match says so (not the empty-roster copy)", () => {
    const { root } = renderScreen();
    search(root, "zzz");
    const t = allTexts(root);
    expect(t.some((x) => x.startsWith("No technicians match"))).toBe(true);
    expect(t).not.toContain(EMPTY_COPY);
  });
});

describe("picking", () => {
  it("Apply is disabled until a row is picked; picking then applying returns that employee", () => {
    setRoster([tech("1", "Asha"), tech("2", "Bala")]);
    const { root, navigation } = renderScreen();
    expect(apply(root).props.disabled).toBe(true);
    act(() => row(root, "Bala").props.onPress());
    expect(row(root, "Bala").props.accessibilityState.selected).toBe(true);
    expect(row(root, "Asha").props.accessibilityState.selected).toBe(false);
    act(() => apply(root).props.onPress());
    expect(navigation.popTo).toHaveBeenCalledWith(
      expect.anything(),
      { selectedTechnicianId: "2" },
      { merge: true }
    );
  });

  it("picking a second row moves the selection (one employee at a time)", () => {
    setRoster([tech("1", "Asha"), tech("2", "Bala")]);
    const { root } = renderScreen();
    act(() => row(root, "Asha").props.onPress());
    act(() => row(root, "Bala").props.onPress());
    expect(row(root, "Asha").props.accessibilityState.selected).toBe(false);
    expect(row(root, "Bala").props.accessibilityState.selected).toBe(true);
  });
});

describe("duplicate names", () => {
  it("two employees with the same name both show, in a stable order on every render", () => {
    setRoster([
      tech("1", "Ravi", { employeeCode: "EMP-7" }),
      tech("2", "Ravi", { employeeCode: "EMP-8" }),
      tech("3", "Anil"),
    ]);
    const metas = (root: Root) =>
      allTexts(root).filter((t) => t.startsWith("EMP-"));
    const first = metas(renderScreen().root);
    expect(names(renderScreen().root, ["Ravi", "Anil"])).toEqual([
      "Anil",
      "Ravi",
      "Ravi",
    ]);
    expect(first).toHaveLength(2);
    expect(metas(renderScreen().root)).toEqual(first);
    expect(first).toEqual(["EMP-7 · +91 9000000000", "EMP-8 · +91 9000000000"]);
  });
});
