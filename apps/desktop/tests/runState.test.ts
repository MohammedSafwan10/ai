import { describe, expect, it } from "vitest";
import { isValidRunTransition, markRunProgress, toActiveRunState, transitionRun, type AgentRunTracker } from "../src/main/agent/runState";

const run = (phase: AgentRunTracker["phase"] = "sampling"): AgentRunTracker => ({
  threadId: "thread",
  assistantMessageId: "assistant",
  controller: new AbortController(),
  phase,
  startedAt: 100,
  updatedAt: 100,
  iteration: 0,
  toolCount: 0,
  lastProgressAt: 100,
  recoveryAttempts: 0,
});

describe("desktop agent run state", () => {
  it("allows the Codex-style sample tool drain path", () => {
    const tracker = run();
    transitionRun(tracker, "executing_tool", { iteration: 1 });
    transitionRun(tracker, "draining", { toolCount: 1 });
    transitionRun(tracker, "sampling", { iteration: 2 });
    transitionRun(tracker, "draining");
    transitionRun(tracker, "completed");

    expect(toActiveRunState(tracker)).toMatchObject({
      phase: "completed",
      status: "completed",
      iteration: 2,
      toolCount: 1,
    });
  });

  it("rejects impossible transitions", () => {
    expect(isValidRunTransition("completed", "executing_tool")).toBe(false);
    expect(() => transitionRun(run("completed"), "executing_tool")).toThrow(/Invalid agent run transition/);
  });

  it("tracks progress timestamps", () => {
    const tracker = run();
    markRunProgress(tracker);
    expect(tracker.lastProgressAt).toBeGreaterThan(100);
    expect(tracker.updatedAt).toBe(tracker.lastProgressAt);
  });
});
