import { describe, expect, it } from "vitest";
import { initialGeminiFunctionArguments, geminiStepStartText } from "../src/main/agent/providers/gemini";
import { diffStats } from "../src/main/agent/harness/support/toolActivity";
import { mergeToolDetail } from "../src/renderer/components/ToolTimeline";
import { mergeUniqueByFreshness } from "../src/renderer/state/useDesktopState";
import { isActiveTurnStatus } from "../src/shared/runStatus";
import type { ToolEventRecord } from "../src/shared/types";

describe("deep bug regressions", () => {
  it("keeps verification in the active streaming lifecycle", () => {
    expect(isActiveTurnStatus("waiting_verification")).toBe(true);
    expect(isActiveTurnStatus("completed")).toBe(false);
  });

  it("does not let a stale refresh overwrite a newer streamed record", () => {
    const result = mergeUniqueByFreshness(
      [{ id: "tool-1", status: "done", updatedAt: 20 }],
      [{ id: "tool-1", status: "running", updatedAt: 10 }],
      false,
    );
    expect(result[0]).toMatchObject({ status: "done", updatedAt: 20 });
  });

  it("does not let stale fetched detail revive a completed tool", () => {
    const live = tool({ status: "done", updatedAt: 20, diff: "+const done = true;" });
    const staleDetail = tool({ status: "running", updatedAt: 10, output: "Receiving edit" });
    expect(mergeToolDetail(live, staleDetail)).toMatchObject({
      status: "done",
      updatedAt: 20,
      diff: "+const done = true;",
    });
  });

  it("counts normal unified diff lines without requiring a space", () => {
    expect(diffStats("--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-const oldValue = 1;\n+const newValue = 2;"))
      .toEqual({ additions: 1, deletions: 1 });
  });

  it("keeps Gemini step-start content and does not prefix argument deltas with an empty object", () => {
    expect(geminiStepStartText({ type: "text", text: "Initial answer. " })).toBe("Initial answer. ");
    expect(geminiStepStartText({ type: "thought_summary", content: { text: "Planning." } })).toBe("Planning.");
    expect(initialGeminiFunctionArguments({})).toBe("");
    expect(`${initialGeminiFunctionArguments({})}{\"path\":\"README.md\"}`).toBe('{"path":"README.md"}');
  });
});

const tool = (overrides: Partial<ToolEventRecord>): ToolEventRecord => ({
  id: "tool-1",
  threadId: "thread-1",
  messageId: "message-1",
  callId: "call-1",
  name: "edit_file",
  title: "Edit file",
  args: {},
  risk: "safe",
  status: "running",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
