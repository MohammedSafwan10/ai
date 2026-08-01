import { describe, expect, it } from "vitest";
import { parsePartialDesktopToolCall } from "../src/main/agent/tools/definitions";
import { streamingPatchActivities } from "../src/main/agent/tools/streamingPatchProgress";
import { activityItemsForTool, reconcileToolActivities, titleForTool } from "../src/main/agent/harness/support/toolActivity";
import { normalizeStaleTools } from "../src/renderer/components/ToolTimeline";
import type { ToolEventRecord } from "../src/shared/types";

describe("streaming patch progress", () => {
  it("extracts streamed file contents before a write call is complete", () => {
    expect(parsePartialDesktopToolCall(
      "desktop_write_file",
      '{"path":"src/new.ts","content":"export const answer = 4',
    )).toMatchObject({
      arguments: { path: "src/new.ts", content: "export const answer = 4" },
    });
  });

  it("extracts the active structured edit operation", () => {
    expect(parsePartialDesktopToolCall(
      "desktop_edit_file",
      '{"path":"src/app.ts","operations":[{"type":"replace_text","match":"old","replacement":"new',
    )).toMatchObject({
      arguments: {
        path: "src/app.ts",
        operations: [{ type: "replace_text", match: "old", replacement: "new" }],
      },
    });
  });

  it("extracts patch activity from partial JSON arguments", () => {
    const draft = parsePartialDesktopToolCall(
      "desktop_apply_patch",
      "{\"patch\":\"*** Begin Patch\\n*** Update File: src/app.ts\\n@@\\n-const a = 1;\\n+const a = 2;",
    );

    expect(draft).toMatchObject({
      name: "desktop_apply_patch",
      arguments: {
        patch: expect.stringContaining("*** Update File: src/app.ts"),
      },
    });
    expect(streamingPatchActivities(String(draft?.arguments.patch))).toEqual([
      expect.objectContaining({
        verb: "Editing",
        path: "src/app.ts",
        additions: 1,
        deletions: 1,
      }),
    ]);
  });

  it("tracks moves and multiple files while a patch is incomplete", () => {
    expect(streamingPatchActivities([
      "*** Begin Patch",
      "*** Update File: old.ts",
      "*** Move to: new.ts",
      "@@",
      "-old",
      "+new",
      "*** Add File: created.ts",
      "+export {};",
    ].join("\n"))).toEqual([
      expect.objectContaining({ verb: "Moving", path: "old.ts -> new.ts", additions: 1, deletions: 1 }),
      expect.objectContaining({ verb: "Creating", path: "created.ts", additions: 1, deletions: 0 }),
    ]);
  });

  it("shows provisional line counts while a structured edit is streaming", () => {
    expect(activityItemsForTool({
      id: "draft-edit",
      name: "desktop_edit_file",
      arguments: {
        path: "src/app.ts",
        operations: [
          { type: "replace_text", match: "old one\nold two", replacement: "new one\nnew two\nnew three" },
          { type: "append", content: "export {};" },
        ],
      },
    })).toEqual([
      expect.objectContaining({ path: "src/app.ts", additions: 4, deletions: 2 }),
    ]);
  });

  it("replaces an empty draft activity list when streamed edit details arrive", () => {
    const computed = [{ verb: "Editing", path: "src/app.ts", additions: 4, deletions: 2 }];

    expect(reconcileToolActivities(undefined, computed, [], false)).toEqual(computed);
  });

  it("discards an orphaned live draft when its completed replacement exists", () => {
    const draft = toolEvent("draft", "provider-item-id", "preparing", 1);
    const completed = toolEvent("completed", "provider-call-id", "done", 2);

    expect(normalizeStaleTools([draft, completed], true)[0]).toMatchObject({
      status: "cancelled",
      liveStatus: undefined,
    });
  });

  it("uses concise browser activity labels", () => {
    expect(titleForTool({ id: "search", name: "browser_search", arguments: { query: "browser reliability" } }))
      .toBe("Search web for browser reliability");
    expect(titleForTool({ id: "fill", name: "browser_act", arguments: { action: "fill", ref: "b2" } }))
      .toBe("Fill b2");
  });
});

const toolEvent = (
  id: string,
  callId: string,
  status: ToolEventRecord["status"],
  createdAt: number,
): ToolEventRecord => ({
  id,
  threadId: "thread",
  messageId: "assistant",
  callId,
  name: "desktop_write_file",
  title: "Write file",
  status,
  risk: "safe",
  args: { path: "src/app.ts" },
  liveStatus: status === "preparing" ? "Receiving edit from model" : undefined,
  result: status === "done" ? { success: true } : undefined,
  createdAt,
  updatedAt: createdAt,
});
