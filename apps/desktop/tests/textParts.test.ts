import { describe, expect, it } from "vitest";
import { looksLikeProcessNarration } from "../src/main/agent/harness/support/textParts";

describe("text part helpers", () => {
  it("detects model process narration that should not be visible chat", () => {
    expect(looksLikeProcessNarration("Let's check the workspace directory first.")).toBe(true);
    expect(looksLikeProcessNarration("Now we need to write the business logic in src/helpers.ts.")).toBe(true);
    expect(looksLikeProcessNarration("Wait, what does src/test/setup.ts need?")).toBe(true);
    expect(looksLikeProcessNarration("We can use `desktop_run_diagnostics` with kind: \"build\".")).toBe(true);
  });

  it("does not hide normal user-facing summaries", () => {
    expect(looksLikeProcessNarration("Implemented the app and verified tests, lint, and build.")).toBe(false);
    expect(looksLikeProcessNarration("Here are the remaining risks and verification notes.")).toBe(false);
    expect(looksLikeProcessNarration("The build failed because React is imported but never used.")).toBe(false);
  });
});
