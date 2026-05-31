import { describe, expect, it } from "vitest";
import { createThreadTitleFilterState, fallbackThreadTitle, filterThreadTitleDelta, resolveNoToolOutcome } from "../src/main/agent/runtime";
import { isPlaceholderThreadTitle, normalizeThreadTitle } from "../src/main/db/store";

describe("desktop runtime protocol recovery", () => {
  it("completes when the provider returned visible assistant text without tools", () => {
    expect(resolveNoToolOutcome({
      iterationText: "Done.",
      iterationThought: "",
      afterToolResults: false,
      recoveryAttempts: 0,
    })).toEqual({ action: "complete" });
  });

  it("continues protocol-only when tool results have no summary", () => {
    const outcome = resolveNoToolOutcome({
      iterationText: "",
      iterationThought: "",
      afterToolResults: true,
      recoveryAttempts: 0,
    });

    expect(outcome.action).toBe("recover");
    if (outcome.action === "recover") {
      expect(outcome.message).toContain("tool results");
    }
  });

  it("does not inspect visible text intent", () => {
    expect(resolveNoToolOutcome({
      iterationText: "I will inspect the files now.",
      iterationThought: "",
      afterToolResults: false,
      recoveryAttempts: 0,
    })).toEqual({ action: "complete" });
  });
});

describe("thread title metadata filtering", () => {
  it("strips a complete title tag and returns the normalized title", () => {
    const titles: string[] = [];
    const state = createThreadTitleFilterState(true);
    const visible = filterThreadTitleDelta(
      "<thread_title>  Fix sidebar scroll  </thread_title>I checked the layout.",
      state,
      (title) => titles.push(title),
    );

    expect(visible).toBe("I checked the layout.");
    expect(titles).toEqual(["Fix sidebar scroll"]);
  });

  it("handles title tags split across streaming deltas", () => {
    const titles: string[] = [];
    const state = createThreadTitleFilterState(true);

    expect(filterThreadTitleDelta("<thread_", state, (title) => titles.push(title))).toBe("");
    expect(filterThreadTitleDelta("title>Deep repo", state, (title) => titles.push(title))).toBe("");
    expect(filterThreadTitleDelta(" map</thread_title>Done.", state, (title) => titles.push(title))).toBe("Done.");

    expect(titles).toEqual(["Deep repo map"]);
  });

  it("does not filter titles once disabled", () => {
    const state = createThreadTitleFilterState(false);

    expect(filterThreadTitleDelta("<thread_title>Keep visible</thread_title>", state, () => {
      throw new Error("title callback should not run");
    })).toBe("<thread_title>Keep visible</thread_title>");
  });
});

describe("thread title normalization", () => {
  it("normalizes title text and placeholder state", () => {
    expect(normalizeThreadTitle("  Fix   the sidebar\nignore me  ")).toBe("Fix the sidebar");
    expect(fallbackThreadTitle("Please fix the composer scroll bug and verify it works")).toBe("Please fix the composer scroll bug and verify it");
    expect(isPlaceholderThreadTitle({ title: "New local agent chat" })).toBe(true);
    expect(isPlaceholderThreadTitle({ title: "New chat", titleSource: "placeholder" })).toBe(true);
    expect(isPlaceholderThreadTitle({ title: "Manual title", titleSource: "user" })).toBe(false);
  });
});
