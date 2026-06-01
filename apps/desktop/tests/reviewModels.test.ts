import { describe, expect, it } from "vitest";
import { buildReviewSession } from "../src/renderer/reviewModels";
import type { ToolDiffFileRecord, ToolEventRecord, TurnUndoOperationRecord } from "../src/shared/types";

describe("review model builder", () => {
  it("builds full before/after models from restore_file undo metadata", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [tool({
        diffFiles: [diffFile({ path: "src/app.ts", additions: 1, deletions: 1 })],
        undo: [restore({ path: "src/app.ts", previous: "const value = 1;\n", expectedCurrent: "const value = 2;\n" })],
      })],
    });

    expect(session.files[0]).toMatchObject({
      path: "src/app.ts",
      original: "const value = 1;\n",
      modified: "const value = 2;\n",
      language: "typescript",
      partial: false,
    });
    expect(session.additions).toBe(1);
    expect(session.deletions).toBe(1);
  });

  it("builds created file models", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [tool({
        diffFiles: [diffFile({ path: "README.md", status: "created", additions: 1, deletions: 0 })],
        undo: [restore({ path: "README.md", existed: false, previous: "", expectedCurrent: "# hello\n" })],
      })],
    });

    expect(session.files[0]).toMatchObject({
      status: "created",
      original: "",
      modified: "# hello\n",
      partial: false,
    });
  });

  it("builds deleted file models", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [tool({
        diffFiles: [diffFile({ path: "old.txt", status: "deleted", additions: 0, deletions: 1 })],
        undo: [restore({ path: "old.txt", previous: "old\n", expectedCurrent: "" })],
      })],
    });

    expect(session.files[0]).toMatchObject({
      status: "deleted",
      original: "old\n",
      modified: "",
      partial: false,
    });
  });

  it("builds renamed file summaries from restorePath metadata", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [tool({
        diffFiles: [diffFile({ path: "new.ts", oldPath: "old.ts", status: "renamed", additions: 0, deletions: 0 })],
        undo: [restore({ path: "new.ts", restorePath: "old.ts", previous: "export {}\n", expectedCurrent: "export {}\n" })],
      })],
    });

    expect(session.files[0]).toMatchObject({
      path: "new.ts",
      oldPath: "old.ts",
      status: "renamed",
      original: "export {}\n",
      modified: "export {}\n",
    });
  });

  it("falls back to partial hunk content when undo content is missing", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [tool({
        diffFiles: [diffFile({
          path: "src/app.ts",
          additions: 1,
          deletions: 1,
          hunks: [{
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 2,
            lines: [
              { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "const a = 1;" },
              { kind: "remove", oldLineNumber: 2, newLineNumber: null, text: "const b = 2;" },
              { kind: "add", oldLineNumber: null, newLineNumber: 2, text: "const b = 3;" },
            ],
          }],
        })],
        undo: [],
      })],
    });

    expect(session.files[0]).toMatchObject({
      original: "const a = 1;\nconst b = 2;",
      modified: "const a = 1;\nconst b = 3;",
      partial: true,
    });
  });

  it("collapses duplicate file changes into one latest-path model", () => {
    const session = buildReviewSession({
      messageId: "message-1",
      tools: [
        tool({
          id: "tool-1",
          createdAt: 1,
          diffFiles: [diffFile({ path: "src/app.ts", additions: 1, deletions: 1 })],
          undo: [restore({ path: "src/app.ts", previous: "one\n", expectedCurrent: "two\n" })],
        }),
        tool({
          id: "tool-2",
          createdAt: 2,
          diffFiles: [diffFile({ path: "src/app.ts", additions: 1, deletions: 1 })],
          undo: [restore({ path: "src/app.ts", previous: "two\n", expectedCurrent: "three\n" })],
        }),
      ],
    });

    expect(session.files).toHaveLength(1);
    expect(session.files[0]).toMatchObject({
      path: "src/app.ts",
      original: "one\n",
      modified: "three\n",
      additions: 2,
      deletions: 2,
    });
  });
});

const restore = (input: Partial<Extract<TurnUndoOperationRecord, { type: "restore_file" }>>): Extract<TurnUndoOperationRecord, { type: "restore_file" }> => ({
  type: "restore_file",
  path: "src/app.ts",
  existed: true,
  previous: "",
  expectedCurrent: "",
  encoding: "utf8",
  ...input,
});

const diffFile = (input: Partial<ToolDiffFileRecord>): ToolDiffFileRecord => ({
  path: "src/app.ts",
  status: "modified",
  additions: 0,
  deletions: 0,
  hunks: [],
  ...input,
});

const tool = (input: {
  id?: string;
  createdAt?: number;
  diffFiles: ToolDiffFileRecord[];
  undo: TurnUndoOperationRecord[];
}): ToolEventRecord => ({
  id: input.id || "tool-1",
  threadId: "thread-1",
  messageId: "message-1",
  callId: input.id || "call-1",
  name: "desktop_edit_file",
  title: "Edited file",
  status: "done",
  risk: "safe",
  args: {},
  result: { success: true, data: { undo: input.undo } },
  diffFiles: input.diffFiles,
  createdAt: input.createdAt || 1,
  updatedAt: input.createdAt || 1,
});
