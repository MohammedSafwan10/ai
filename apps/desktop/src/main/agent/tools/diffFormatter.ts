import type {
  ToolDiffFileRecord,
  ToolDiffFileStatus,
  ToolDiffHunkRecord,
  ToolDiffLineRecord,
  ToolDiffStatsRecord,
} from "../../../shared/types";

const CONTEXT_RADIUS = 3;
const MAX_RENDERED_DIFF_LINES = 420;
const DIFF_HEAD_LINES = 240;
const DIFF_TAIL_LINES = 160;

interface StructuredDiffInput {
  path: string;
  oldPath?: string;
  before: string;
  after: string;
  status?: ToolDiffFileStatus;
}

export interface StructuredDiffResult {
  diff: string;
  diffFiles: ToolDiffFileRecord[];
  additions: number;
  deletions: number;
}

export const createStructuredDiff = (input: StructuredDiffInput): StructuredDiffResult => {
  const file = createDiffFile(input);
  return {
    diff: formatUnifiedDiffFiles([file]),
    diffFiles: [file],
    additions: file.additions,
    deletions: file.deletions,
  };
};

export const createRenameDiff = (oldPath: string, nextPath: string): StructuredDiffResult => {
  const file: ToolDiffFileRecord = {
    path: normalizeDiffPath(nextPath),
    oldPath: normalizeDiffPath(oldPath),
    status: "renamed",
    additions: 0,
    deletions: 0,
    hunks: [],
  };
  return {
    diff: formatUnifiedDiffFiles([file]),
    diffFiles: [file],
    additions: 0,
    deletions: 0,
  };
};

export const formatUnifiedDiffFiles = (files: ToolDiffFileRecord[]) =>
  files
    .map((file) => {
      const beforePath = file.status === "created" ? "/dev/null" : file.oldPath || file.path;
      const afterPath = file.status === "deleted" ? "/dev/null" : file.path;
      const header = [`--- ${beforePath}`, `+++ ${afterPath}`];
      if (file.hunks.length === 0) {
        if (file.status === "renamed") return [...header, "(renamed without content changes)"].join("\n");
        return [...header, "(no changes)"].join("\n");
      }
      return [
        ...header,
        ...file.hunks.flatMap((hunk) => [
          `@@ -${formatRange(hunk.oldStart, hunk.oldLines)} +${formatRange(hunk.newStart, hunk.newLines)} @@${hunk.section ? ` ${hunk.section}` : ""}`,
          ...hunk.lines.map(formatDiffLine),
        ]),
      ].join("\n");
    })
    .join("\n\n");

export const parseUnifiedDiffFiles = (diff?: string): ToolDiffFileRecord[] => {
  if (!diff?.trim()) return [];
  return diff
    .split(/\n\n(?=--- )/g)
    .map((section) => parseUnifiedDiffSection(section))
    .filter(Boolean) as ToolDiffFileRecord[];
};

export const diffStatsFromFiles = (files?: ToolDiffFileRecord[]): ToolDiffStatsRecord | undefined => {
  if (!files?.length) return undefined;
  return {
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
};

export const activityItemsFromDiffFiles = (files?: ToolDiffFileRecord[]) =>
  files?.map((file) => ({
    verb: diffVerb(file),
    path: file.oldPath && file.oldPath !== file.path ? `${file.oldPath} -> ${file.path}` : file.path,
    additions: file.additions,
    deletions: file.deletions,
  })) || [];

export const formatDeltaFromDiffFiles = (files: ToolDiffFileRecord[]) => {
  const stats = diffStatsFromFiles(files) || { additions: 0, deletions: 0 };
  return `+${stats.additions} -${stats.deletions}`;
};

const createDiffFile = (input: StructuredDiffInput): ToolDiffFileRecord => {
  const beforeLines = splitContentLines(input.before);
  const afterLines = splitContentLines(input.after);
  const status = input.status || inferStatus(input.before, input.after, input.oldPath);
  const diffLines = createLineDiff(beforeLines, afterLines);
  const additions = diffLines.filter((line) => line.kind === "add").length;
  const deletions = diffLines.filter((line) => line.kind === "remove").length;
  const hunks = createHunks(diffLines);
  return {
    path: normalizeDiffPath(input.path),
    oldPath: input.oldPath ? normalizeDiffPath(input.oldPath) : undefined,
    status,
    additions,
    deletions,
    hunks,
    truncated: hunks.some((hunk) => hunk.truncated),
  };
};

const normalizeDiffPath = (value: string) => value.replace(/\\/g, "/");

const inferStatus = (before: string, after: string, oldPath?: string): ToolDiffFileStatus => {
  if (oldPath) return "renamed";
  if (!before && after) return "created";
  if (before && !after) return "deleted";
  return "modified";
};

const splitContentLines = (value: string) => {
  if (!value) return [];
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
};

const LCS_CELL_LIMIT = 4_000_000;

const createLineDiff = (beforeLines: string[], afterLines: string[]): ToolDiffLineRecord[] => {
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const lines: ToolDiffLineRecord[] = [];
  for (let index = 0; index < prefix; index += 1) {
    lines.push({
      kind: "context",
      oldLineNumber: index + 1,
      newLineNumber: index + 1,
      text: beforeLines[index],
    });
  }

  lines.push(...diffMiddleLines(beforeLines, afterLines, prefix, suffix));

  const beforeSuffixStart = beforeLines.length - suffix;
  const afterSuffixStart = afterLines.length - suffix;
  for (let index = 0; index < suffix; index += 1) {
    lines.push({
      kind: "context",
      oldLineNumber: beforeSuffixStart + index + 1,
      newLineNumber: afterSuffixStart + index + 1,
      text: beforeLines[beforeSuffixStart + index],
    });
  }

  return lines;
};

const diffMiddleLines = (
  beforeLines: string[],
  afterLines: string[],
  prefix: number,
  suffix: number,
): ToolDiffLineRecord[] => {
  const beforeMiddle = beforeLines.slice(prefix, beforeLines.length - suffix);
  const afterMiddle = afterLines.slice(prefix, afterLines.length - suffix);
  if (beforeMiddle.length === 0 && afterMiddle.length === 0) return [];

  const cellCount = (beforeMiddle.length + 1) * (afterMiddle.length + 1);
  if (cellCount > LCS_CELL_LIMIT) {
    return createFallbackReplacement(beforeMiddle, afterMiddle, prefix);
  }

  const width = afterMiddle.length + 1;
  const table = new Uint32Array((beforeMiddle.length + 1) * width);

  for (let oldIndex = beforeMiddle.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = afterMiddle.length - 1; newIndex >= 0; newIndex -= 1) {
      const offset = oldIndex * width + newIndex;
      table[offset] = beforeMiddle[oldIndex] === afterMiddle[newIndex]
        ? table[(oldIndex + 1) * width + newIndex + 1] + 1
        : Math.max(table[(oldIndex + 1) * width + newIndex], table[oldIndex * width + newIndex + 1]);
    }
  }

  const lines: ToolDiffLineRecord[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < beforeMiddle.length || newIndex < afterMiddle.length) {
    if (
      oldIndex < beforeMiddle.length &&
      newIndex < afterMiddle.length &&
      beforeMiddle[oldIndex] === afterMiddle[newIndex]
    ) {
      lines.push({
        kind: "context",
        oldLineNumber: prefix + oldIndex + 1,
        newLineNumber: prefix + newIndex + 1,
        text: beforeMiddle[oldIndex],
      });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      oldIndex < beforeMiddle.length &&
      (newIndex >= afterMiddle.length ||
        table[(oldIndex + 1) * width + newIndex] >= table[oldIndex * width + newIndex + 1])
    ) {
      lines.push({
        kind: "remove",
        oldLineNumber: prefix + oldIndex + 1,
        newLineNumber: null,
        text: beforeMiddle[oldIndex],
      });
      oldIndex += 1;
    } else {
      lines.push({
        kind: "add",
        oldLineNumber: null,
        newLineNumber: prefix + newIndex + 1,
        text: afterMiddle[newIndex],
      });
      newIndex += 1;
    }
  }

  return lines;
};

const createFallbackReplacement = (
  beforeMiddle: string[],
  afterMiddle: string[],
  prefix: number,
): ToolDiffLineRecord[] => [
  ...beforeMiddle.map((text, index) => ({
    kind: "remove" as const,
    oldLineNumber: prefix + index + 1,
    newLineNumber: null,
    text,
  })),
  ...afterMiddle.map((text, index) => ({
    kind: "add" as const,
    oldLineNumber: null,
    newLineNumber: prefix + index + 1,
    text,
  })),
];

const createHunks = (diffLines: ToolDiffLineRecord[]): ToolDiffHunkRecord[] => {
  const changeIndexes = diffLines
    .map((line, index) => line.kind === "context" ? -1 : index)
    .filter((index) => index >= 0);
  if (changeIndexes.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  for (const changeIndex of changeIndexes) {
    const start = Math.max(0, changeIndex - CONTEXT_RADIUS);
    const end = Math.min(diffLines.length - 1, changeIndex + CONTEXT_RADIUS);
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end + 1) {
      previous.end = Math.max(previous.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  return ranges.map(({ start, end }) => createHunk(diffLines, start, end));
};

const createHunk = (diffLines: ToolDiffLineRecord[], start: number, end: number): ToolDiffHunkRecord => {
  const lines = diffLines.slice(start, end + 1);
  const oldLines = lines.filter((line) => line.kind !== "add").length;
  const newLines = lines.filter((line) => line.kind !== "remove").length;
  const oldStart = oldLines === 0 ? fallbackLineStart(diffLines, start, "old") : firstLineNumber(lines, "old");
  const newStart = newLines === 0 ? fallbackLineStart(diffLines, start, "new") : firstLineNumber(lines, "new");
  return truncateHunk({
    oldStart,
    oldLines,
    newStart,
    newLines,
    lines,
  });
};

const firstLineNumber = (lines: ToolDiffLineRecord[], side: "old" | "new") => {
  const key = side === "old" ? "oldLineNumber" : "newLineNumber";
  return lines.find((line) => typeof line[key] === "number")?.[key] || 0;
};

const fallbackLineStart = (lines: ToolDiffLineRecord[], start: number, side: "old" | "new") => {
  const key = side === "old" ? "oldLineNumber" : "newLineNumber";
  for (let index = start - 1; index >= 0; index -= 1) {
    const value = lines[index][key];
    if (typeof value === "number") return value;
  }
  return 0;
};

const truncateHunk = (hunk: ToolDiffHunkRecord): ToolDiffHunkRecord => {
  if (hunk.lines.length <= MAX_RENDERED_DIFF_LINES) return hunk;
  return {
    ...hunk,
    truncated: true,
    lines: [
      ...hunk.lines.slice(0, DIFF_HEAD_LINES),
      { kind: "context", oldLineNumber: null, newLineNumber: null, text: "... diff truncated ..." },
      ...hunk.lines.slice(-DIFF_TAIL_LINES),
    ],
  };
};

const formatRange = (start: number, count: number) => count === 1 ? String(start) : `${start},${count}`;

const formatDiffLine = (line: ToolDiffLineRecord) => {
  const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
  return `${prefix}${line.text}`;
};

const parseUnifiedDiffSection = (section: string): ToolDiffFileRecord | null => {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const oldHeader = lines.find((line) => line.startsWith("--- "));
  const newHeader = lines.find((line) => line.startsWith("+++ "));
  if (!oldHeader && !newHeader) return null;
  const oldPath = oldHeader?.slice(4).trim() || "";
  const newPath = newHeader?.slice(4).trim() || oldPath;
  const path = newPath === "/dev/null" ? oldPath : newPath;
  const status: ToolDiffFileStatus = oldPath === "/dev/null"
    ? "created"
    : newPath === "/dev/null"
      ? "deleted"
      : oldPath && newPath && oldPath !== newPath
        ? "renamed"
        : "modified";
  const hunks: ToolDiffHunkRecord[] = [];
  let index = 0;

  while (index < lines.length) {
    const header = lines[index].match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@\s?(.*)$/);
    if (!header) {
      index += 1;
      continue;
    }
    const hunk: ToolDiffHunkRecord = {
      oldStart: Number(header[1]),
      oldLines: Number(header[2] || 1),
      newStart: Number(header[3]),
      newLines: Number(header[4] || 1),
      section: header[5] || undefined,
      lines: [],
    };
    let oldLineNumber = hunk.oldStart || null;
    let newLineNumber = hunk.newStart || null;
    index += 1;
    while (index < lines.length && !lines[index].startsWith("@@ ")) {
      const raw = lines[index];
      if (raw.startsWith("+") && !raw.startsWith("+++")) {
        hunk.lines.push({ kind: "add", oldLineNumber: null, newLineNumber, text: raw.slice(1) });
        if (newLineNumber !== null) newLineNumber += 1;
      } else if (raw.startsWith("-") && !raw.startsWith("---")) {
        hunk.lines.push({ kind: "remove", oldLineNumber, newLineNumber: null, text: raw.slice(1) });
        if (oldLineNumber !== null) oldLineNumber += 1;
      } else if (!raw.startsWith("\\ No newline")) {
        const text = raw.startsWith(" ") ? raw.slice(1) : raw;
        hunk.lines.push({ kind: "context", oldLineNumber, newLineNumber, text });
        if (oldLineNumber !== null) oldLineNumber += 1;
        if (newLineNumber !== null) newLineNumber += 1;
      }
      index += 1;
    }
    hunks.push(truncateHunk(hunk));
  }

  const additions = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === "add").length, 0);
  const deletions = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === "remove").length, 0);
  return {
    path,
    oldPath: status === "renamed" ? oldPath : undefined,
    status,
    additions,
    deletions,
    hunks,
    truncated: hunks.some((hunk) => hunk.truncated),
  };
};

const diffVerb = (file: ToolDiffFileRecord) => {
  if (file.status === "created") return "Created";
  if (file.status === "deleted") return "Deleted";
  if (file.status === "renamed") return "Renamed";
  return "Edited";
};
