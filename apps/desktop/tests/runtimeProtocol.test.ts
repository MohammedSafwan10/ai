import { describe, expect, it } from "vitest";
import { resolveNoToolOutcome } from "../src/main/agent/runtime";

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
