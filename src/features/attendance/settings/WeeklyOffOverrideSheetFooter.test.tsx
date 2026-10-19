/**
 * WeeklyOffOverrideSheetFooter save-error banner: offline / empty-message
 * failures show "Couldn't save. Try again."; a server message shows
 * verbatim; no error, no banner; hidden while saving.
 */
import type ReactTestRenderer from "react-test-renderer";
import { act, create } from "react-test-renderer";
import { Text } from "react-native";
import WeeklyOffOverrideSheetFooter from "./WeeklyOffOverrideSheetFooter";
import type { WeeklyOffOverrideSheetFooterProps } from "./WeeklyOffOverrideSheetFooter";
import { InlineError } from "../../../components/ui";
import type { ApiError } from "../../../services";

const COPY = "Couldn't save. Try again.";
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) {
    const r = mounted.pop();
    act(() => r?.unmount());
  }
});

function err(partial: Partial<ApiError>): ApiError {
  return { status: 500, code: "X", message: "m", ...partial };
}

function renderFooter(over: Partial<WeeklyOffOverrideSheetFooterProps> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(
      <WeeklyOffOverrideSheetFooter
        isEdit={false}
        isSaving={false}
        saveDisabled={false}
        saveError={null}
        onSave={jest.fn()}
        onRemove={jest.fn()}
        onHeight={jest.fn()}
        {...over}
      />
    );
  });
  mounted.push(r);
  return r.root;
}

const banner = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAllByType(InlineError);
const allText = (root: ReactTestRenderer.ReactTestInstance): string[] =>
  root.findAllByType(Text).map((t) => [t.props.children].flat().join(""));

describe("WeeklyOffOverrideSheetFooter error banner", () => {
  it("shows no banner when there is no error", () => {
    expect(banner(renderFooter())).toHaveLength(0);
  });

  it("offline (status 0) shows the approved copy, not the raw message", () => {
    const root = renderFooter({
      saveError: err({ status: 0, code: "NETWORK", message: "Network Error" }),
    });
    expect(banner(root)).toHaveLength(1);
    expect(allText(root)).toContain(COPY);
    expect(allText(root)).not.toContain("Network Error");
  });

  it("a 500 with an empty message never renders a blank banner", () => {
    const root = renderFooter({ saveError: err({ status: 500, message: "" }) });
    expect(allText(root)).toContain(COPY);
  });

  it("a 422 server message shows verbatim", () => {
    const root = renderFooter({
      saveError: err({ status: 422, message: "x" }),
    });
    expect(allText(root)).toContain("x");
    expect(allText(root)).not.toContain(COPY);
  });

  it("hides the banner while a save is in flight", () => {
    const root = renderFooter({
      isSaving: true,
      saveError: err({ status: 0, message: "Network Error" }),
    });
    expect(banner(root)).toHaveLength(0);
  });
});
