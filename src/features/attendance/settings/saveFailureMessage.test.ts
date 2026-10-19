/**
 * saveFailureMessage — the banner text for a failed weekly-off / holiday
 * save. Requirement: a failed save always shows SOME readable copy.
 */
import { SAVE_FAILED_MESSAGE, saveFailureMessage } from "./weeklyOffModel";

describe("saveFailureMessage", () => {
  it("status 0 (no network / timeout) shows the approved copy, not the transport message", () => {
    expect(
      saveFailureMessage({ status: 0, message: "Network request failed" })
    ).toBe("Couldn't save. Try again.");
    expect(SAVE_FAILED_MESSAGE).toBe("Couldn't save. Try again.");
  });

  it("a missing, empty or message-less error never yields a blank banner", () => {
    expect(saveFailureMessage({})).toBe(SAVE_FAILED_MESSAGE);
    expect(saveFailureMessage({ status: 500 })).toBe(SAVE_FAILED_MESSAGE);
    expect(saveFailureMessage({ status: 422, message: "" })).toBe(
      SAVE_FAILED_MESSAGE
    );
    expect(saveFailureMessage(new Error())).toBe(SAVE_FAILED_MESSAGE);
  });

  it("a real server message passes through verbatim", () => {
    expect(
      saveFailureMessage({
        status: 422,
        message: "Pick at least one working day.",
      })
    ).toBe("Pick at least one working day.");
    expect(
      saveFailureMessage({ status: 409, message: "Changed on another device" })
    ).toBe("Changed on another device");
  });

  it("a plain Error with a message shows that message", () => {
    expect(saveFailureMessage(new Error("boom"))).toBe("boom");
  });

  it("does not crash on a thrown string or number", () => {
    const f = saveFailureMessage as (e: unknown) => string;
    expect(f("oops")).toBe(SAVE_FAILED_MESSAGE);
    expect(f(42)).toBe(SAVE_FAILED_MESSAGE);
  });

  // Requirement: a failed save must always show SOME copy. A thrown null or
  // undefined (legal in JS) must not turn the error banner into a crash.
  it("does not crash on null or undefined and falls back to the approved copy", () => {
    const f = saveFailureMessage as (e: unknown) => string;
    expect(f(null)).toBe(SAVE_FAILED_MESSAGE);
    expect(f(undefined)).toBe(SAVE_FAILED_MESSAGE);
  });

  // P5: a blank or non-string message must never produce a blank banner.
  it("whitespace-only message falls back to the approved copy", () => {
    expect(saveFailureMessage({ status: 422, message: "   " })).toBe(
      SAVE_FAILED_MESSAGE
    );
    expect(saveFailureMessage({ status: 500, message: "\n\t " })).toBe(
      SAVE_FAILED_MESSAGE
    );
  });

  it("a non-string message (object, number) falls back to the approved copy", () => {
    const f = saveFailureMessage as (e: unknown) => string;
    expect(f({ status: 500, message: { detail: "x" } })).toBe(
      SAVE_FAILED_MESSAGE
    );
    expect(f({ status: 500, message: 42 })).toBe(SAVE_FAILED_MESSAGE);
    expect(f({ status: 500, message: ["a"] })).toBe(SAVE_FAILED_MESSAGE);
  });

  it("a message with surrounding spaces is returned as sent", () => {
    expect(saveFailureMessage({ status: 422, message: " Pick a day " })).toBe(
      " Pick a day "
    );
  });
});
