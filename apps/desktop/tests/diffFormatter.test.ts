import { describe, expect, it } from "vitest";
import {
  createRenameDiff,
  createStructuredDiff,
  parseUnifiedDiffFiles,
} from "../src/main/agent/tools/diffFormatter";

describe("desktop structured diffs", () => {
  it("creates line-numbered modified file hunks", () => {
    const result = createStructuredDiff({
      path: "game.js",
      before: "const a = 1;\nconst b = 2;\nconsole.log(a + b);\n",
      after: "const a = 1;\nconst b = 3;\nconsole.log(a + b);\n",
      status: "modified",
    });

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.diffFiles[0].path).toBe("game.js");
    expect(result.diffFiles[0].hunks[0].oldStart).toBe(1);
    expect(result.diffFiles[0].hunks[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "remove", oldLineNumber: 2, text: "const b = 2;" }),
      expect.objectContaining({ kind: "add", newLineNumber: 2, text: "const b = 3;" }),
    ]));
    expect(result.diff).toContain("@@ -1,3 +1,3 @@");
  });

  it("handles created, deleted, and renamed files", () => {
    const created = createStructuredDiff({
      path: "src/new.ts",
      before: "",
      after: "export const value = true;\n",
      status: "created",
    }).diffFiles[0];
    const deleted = createStructuredDiff({
      path: "src/old.ts",
      before: "export const old = true;\n",
      after: "",
      status: "deleted",
    }).diffFiles[0];
    const renamed = createRenameDiff("src/a.ts", "src/b.ts").diffFiles[0];

    expect(created.status).toBe("created");
    expect(created.additions).toBe(1);
    expect(created.hunks[0].oldStart).toBe(0);
    expect(deleted.status).toBe("deleted");
    expect(deleted.deletions).toBe(1);
    expect(deleted.hunks[0].newStart).toBe(0);
    expect(renamed).toMatchObject({ status: "renamed", oldPath: "src/a.ts", path: "src/b.ts" });
  });

  it("parses unified diff sections back into file records", () => {
    const original = createStructuredDiff({
      path: "src/app.ts",
      before: "one\ntwo\nthree\n",
      after: "one\nTWO\nthree\n",
      status: "modified",
    });
    const parsed = parseUnifiedDiffFiles(original.diff);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      path: "src/app.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(parsed[0].hunks[0].lines.some((line) => line.kind === "add" && line.newLineNumber === 2)).toBe(true);
  });

  it("does not inflate counts for scattered edits", () => {
    const before = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`);
    const after = [...before];
    after[4] = "line 5 changed";
    after[74] = "line 75 changed";

    const result = createStructuredDiff({
      path: "src/scattered.ts",
      before: `${before.join("\n")}\n`,
      after: `${after.join("\n")}\n`,
      status: "modified",
    });

    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(2);
    expect(result.diffFiles[0].hunks.length).toBe(2);
  });

  it("counts inserted lines without treating surrounding content as replaced", () => {
    const result = createStructuredDiff({
      path: "src/insert.ts",
      before: "one\ntwo\nthree\nfour\n",
      after: "one\ntwo\ninserted\nthree\nfour\n",
      status: "modified",
    });

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.diffFiles[0].hunks[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "add", newLineNumber: 3, text: "inserted" }),
      expect.objectContaining({ kind: "context", oldLineNumber: 3, newLineNumber: 4, text: "three" }),
    ]));
  });
});
