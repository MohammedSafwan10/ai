import { describe, expect, it } from "vitest";
import { parsePartialDesktopToolCall } from "../src/main/agent/tools/definitions";
import { streamingPatchActivities } from "../src/main/agent/tools/streamingPatchProgress";

describe("streaming patch progress", () => {
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
});
