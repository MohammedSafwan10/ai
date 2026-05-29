import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";
import type { DesktopToolCall } from "../src/shared/types";

let tempDir = "";

const tool = (patch: string): DesktopToolCall => ({
  id: "patch-test",
  name: "desktop_apply_patch",
  arguments: { patch },
});

describe("desktop apply patch tool", () => {
  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("applies update and add sections in one envelope", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-desktop-patch-"));
    fs.mkdirSync(path.join(tempDir, "src"));
    fs.writeFileSync(path.join(tempDir, "src", "app.ts"), "const value = 1;\nconsole.log(value);\n", "utf8");

    const executor = new DesktopToolExecutor();
    const result = await executor.execute(tool([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      " const value = 1;",
      "-console.log(value);",
      "+console.log(value + 1);",
      "*** Add File: src/new.ts",
      "+export const created = true;",
      "*** End Patch",
    ].join("\n")), {
      workspaceRoot: tempDir,
      signal: new AbortController().signal,
      onCommandOutput: () => undefined,
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, "src", "app.ts"), "utf8")).toContain("value + 1");
    expect(fs.readFileSync(path.join(tempDir, "src", "new.ts"), "utf8")).toContain("created");
    expect(result.diff).toContain("src/app.ts");
    expect(result.diffFiles?.map((file) => file.path)).toEqual(["src/app.ts", "src/new.ts"]);
    expect(result.diffFiles?.[0].hunks[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "remove", oldLineNumber: 2 }),
      expect.objectContaining({ kind: "add", newLineNumber: 2 }),
    ]));
  });
});
