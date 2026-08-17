import type { ToolDiffFileRecord, ToolEventRecord, TurnUndoOperationRecord } from "../shared/types";

export interface ReviewFileModel {
  path: string;
  oldPath?: string;
  status: ToolDiffFileRecord["status"];
  additions: number;
  deletions: number;
  original: string;
  modified: string;
  language: string;
  partial: boolean;
  note?: string;
}

export interface ReviewSession {
  messageId: string;
  title: string;
  files: ReviewFileModel[];
  selectedPath: string | null;
  additions: number;
  deletions: number;
}

export const buildReviewSession = (input: {
  messageId: string;
  title?: string;
  tools: ToolEventRecord[];
}): ReviewSession => {
  const files = buildReviewFiles(input.tools);
  return {
    messageId: input.messageId,
    title: input.title || "Last turn",
    files,
    selectedPath: files[0]?.path || null,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
};

const buildReviewFiles = (tools: ToolEventRecord[]): ReviewFileModel[] => {
  const entries: Array<{ order: number; file: ToolDiffFileRecord; undo: RestoreUndo[] }> = [];
  tools
    .filter((tool) => tool.status === "done" && tool.result?.success !== false)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((tool, toolIndex) => {
      const undoOperations = normalizeUndoPayload(tool.result?.data?.undo);
      (tool.diffFiles || []).forEach((file, fileIndex) => {
        entries.push({
          order: toolIndex * 1000 + fileIndex,
          file,
          undo: matchingRestoreOperations(file, undoOperations),
        });
      });
    });

  const grouped = new Map<string, Array<typeof entries[number]>>();
  entries.forEach((entry) => {
    const key = entry.file.path;
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  });

  return Array.from(grouped.values()).map((group) => modelFromGroup(group)).filter(Boolean) as ReviewFileModel[];
};

const modelFromGroup = (group: Array<{ order: number; file: ToolDiffFileRecord; undo: RestoreUndo[] }>): ReviewFileModel | null => {
  const ordered = [...group].sort((a, b) => a.order - b.order);
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  if (!first || !latest) return null;
  const restoreOperations = ordered.flatMap((entry) => entry.undo);
  const firstRestore = restoreOperations[0];
  const lastRestore = restoreOperations[restoreOperations.length - 1];
  const hasFullText = firstRestore && lastRestore && firstRestore.encoding !== "base64" && lastRestore.encoding !== "base64";
  const fallback = fallbackContent(latest.file);
  const original = hasFullText ? firstRestore.previous : fallback.original;
  const modified = hasFullText ? String(lastRestore.expectedCurrent ?? "") : fallback.modified;
  const partial = !hasFullText || latest.file.truncated === true || latest.file.hunks.some((hunk) => hunk.truncated);

  return {
    path: latest.file.path,
    oldPath: latest.file.oldPath,
    status: latest.file.status,
    additions: ordered.reduce((sum, entry) => sum + entry.file.additions, 0),
    deletions: ordered.reduce((sum, entry) => sum + entry.file.deletions, 0),
    original,
    modified,
    language: languageForPath(latest.file.path),
    partial,
    note: partial ? "Partial diff preview. Full before/after content was not retained for this file." : undefined,
  };
};

const fallbackContent = (file: ToolDiffFileRecord) => {
  const original: string[] = [];
  const modified: string[] = [];
  file.hunks.forEach((hunk) => {
    hunk.lines.forEach((line) => {
      if (line.kind !== "add") original.push(line.text);
      if (line.kind !== "remove") modified.push(line.text);
    });
  });
  return {
    original: original.join("\n"),
    modified: modified.join("\n"),
  };
};

type RestoreUndo = Extract<TurnUndoOperationRecord, { type: "restore_file" }>;

const normalizeUndoPayload = (value: unknown): RestoreUndo[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((operation): operation is RestoreUndo =>
    Boolean(operation) &&
    typeof operation === "object" &&
    (operation as { type?: unknown }).type === "restore_file" &&
    typeof (operation as { path?: unknown }).path === "string" &&
    typeof (operation as { previous?: unknown }).previous === "string"
  );
};

const matchingRestoreOperations = (file: ToolDiffFileRecord, operations: RestoreUndo[]) =>
  operations.filter((operation) =>
    operation.path === file.path ||
    operation.restorePath === file.path ||
    operation.path === file.oldPath ||
    operation.restorePath === file.oldPath
  );

export const languageForPath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "html") return "html";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "yml" || ext === "yaml") return "yaml";
  if (ext === "toml") return "toml";
  if (ext === "py") return "python";
  if (ext === "rs") return "rust";
  if (ext === "go") return "go";
  if (ext === "java") return "java";
  if (ext === "sh" || ext === "zsh" || ext === "bash") return "shell";
  return "plaintext";
};
