export type ParsedPatchOperation =
  | { kind: "add"; path: string; content: string }
  | { kind: "delete"; path: string }
  | { kind: "update"; path: string; moveTo?: string; hunks: PatchHunk[] };

export interface PatchHunk {
  lines: PatchLine[];
}

type PatchLine =
  | { type: "context"; text: string }
  | { type: "add"; text: string }
  | { type: "remove"; text: string };

const isFileHeader = (line: string) =>
  line.startsWith("*** Add File: ") ||
  line.startsWith("*** Delete File: ") ||
  line.startsWith("*** Update File: ");

export const parsePatchEnvelope = (patch: string): ParsedPatchOperation[] => {
  const lines = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines[0] !== "*** Begin Patch") throw new Error("Patch must start with *** Begin Patch.");
  const endIndex = lines.findIndex((line, index) => index > 0 && line === "*** End Patch");
  if (endIndex === -1) throw new Error("Patch must end with *** End Patch.");

  const operations: ParsedPatchOperation[] = [];
  let index = 1;
  while (index < endIndex) {
    const line = lines[index];
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim();
      if (!filePath) throw new Error("Add File patch is missing a path.");
      index += 1;
      const contentLines: string[] = [];
      while (index < endIndex && !isFileHeader(lines[index])) {
        const addLine = lines[index];
        if (!addLine.startsWith("+")) throw new Error(`Add File ${filePath} contains a non-added line.`);
        contentLines.push(addLine.slice(1));
        index += 1;
      }
      operations.push({ kind: "add", path: filePath, content: contentLines.join("\n") });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim();
      if (!filePath) throw new Error("Delete File patch is missing a path.");
      operations.push({ kind: "delete", path: filePath });
      index += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      if (!filePath) throw new Error("Update File patch is missing a path.");
      index += 1;
      let moveTo: string | undefined;
      if (lines[index]?.startsWith("*** Move to: ")) {
        moveTo = lines[index].slice("*** Move to: ".length).trim();
        if (!moveTo) throw new Error(`Move target for ${filePath} is empty.`);
        index += 1;
      }

      const hunks: PatchHunk[] = [];
      let current: PatchLine[] = [];
      const pushHunk = () => {
        if (current.length) {
          hunks.push({ lines: current });
          current = [];
        }
      };

      while (index < endIndex && !isFileHeader(lines[index])) {
        const hunkLine = lines[index];
        if (hunkLine.startsWith("@@")) {
          pushHunk();
        } else if (hunkLine === "*** End of File") {
          pushHunk();
        } else if (hunkLine.startsWith(" ")) {
          current.push({ type: "context", text: hunkLine.slice(1) });
        } else if (hunkLine.startsWith("+")) {
          current.push({ type: "add", text: hunkLine.slice(1) });
        } else if (hunkLine.startsWith("-")) {
          current.push({ type: "remove", text: hunkLine.slice(1) });
        } else if (hunkLine === "") {
          current.push({ type: "context", text: "" });
        } else {
          throw new Error(`Unsupported patch line in ${filePath}: ${hunkLine}`);
        }
        index += 1;
      }
      pushHunk();
      if (!moveTo && hunks.length === 0) throw new Error(`Update File ${filePath} has no hunks or move target.`);
      operations.push({ kind: "update", path: filePath, moveTo, hunks });
      continue;
    }

    throw new Error(`Unsupported patch header: ${line}`);
  }

  if (operations.length === 0) throw new Error("Patch contains no file operations.");
  return operations;
};

export const applyPatchHunks = (content: string, hunks: PatchHunk[], filePath: string) => {
  let next = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const hunk of hunks) {
    const oldBlock = hunk.lines
      .filter((line) => line.type !== "add")
      .map((line) => line.text)
      .join("\n");
    const newBlock = hunk.lines
      .filter((line) => line.type !== "remove")
      .map((line) => line.text)
      .join("\n");

    if (!oldBlock) {
      next = next ? `${next.replace(/\n?$/, "\n")}${newBlock}` : newBlock;
      continue;
    }

    const candidates = oldBlock.endsWith("\n") ? [oldBlock] : [oldBlock, `${oldBlock}\n`];
    const matched = candidates.find((candidate) => next.includes(candidate));
    if (matched) {
      const replacement = matched.endsWith("\n") && !newBlock.endsWith("\n") ? `${newBlock}\n` : newBlock;
      next = next.replace(matched, replacement);
      continue;
    }

    const indentMatch = applyIndentTolerantReplacement(next, oldBlock, newBlock);
    if (indentMatch) {
      next = indentMatch;
      continue;
    }

    throw new Error([
      `Patch hunk did not match ${filePath}.`,
      "Nearest current file snippets:",
      nearestSnippets(next, oldBlock),
      "Read the file again and retry with one of the shown line ranges as fresh context.",
      `Expected ${oldBlock.split("\n").length} line(s), starting with: ${previewLine(oldBlock)}`,
    ].join("\n\n"));
  }
  return next;
};

const applyIndentTolerantReplacement = (content: string, oldBlock: string, newBlock: string) => {
  const contentLines = content.split("\n");
  const oldLines = oldBlock.split("\n");
  const normalizedOld = stripCommonIndent(oldLines).join("\n");
  if (!normalizedOld.trim()) return null;

  const matches: Array<{ start: number; end: number; indent: string }> = [];
  for (let start = 0; start <= contentLines.length - oldLines.length; start += 1) {
    const window = contentLines.slice(start, start + oldLines.length);
    if (stripCommonIndent(window).join("\n") === normalizedOld) {
      matches.push({ start, end: start + oldLines.length, indent: commonIndent(window) });
      if (matches.length > 1) break;
    }
  }
  if (matches.length !== 1) return null;

  const [match] = matches;
  const normalizedNew = stripCommonIndent(newBlock.split("\n"));
  const replacement = normalizedNew.map((line) => line ? `${match.indent}${line}` : line);
  return [
    ...contentLines.slice(0, match.start),
    ...replacement,
    ...contentLines.slice(match.end),
  ].join("\n");
};

const stripCommonIndent = (lines: string[]) => {
  const indent = commonIndent(lines);
  return indent ? lines.map((line) => line.startsWith(indent) ? line.slice(indent.length) : line) : lines;
};

const commonIndent = (lines: string[]) => {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0] || "");
  if (indents.length === 0) return "";
  let prefix = indents[0];
  for (const indent of indents.slice(1)) {
    while (prefix && !indent.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
};

const previewLine = (block: string) =>
  JSON.stringify(block.split("\n").find((line) => line.trim())?.trim().slice(0, 120) || "");

const nearestSnippets = (content: string, oldBlock: string) => {
  const lines = content.split("\n");
  const oldLines = oldBlock.split("\n").filter((line) => line.trim());
  const firstNeedle = oldLines[0]?.trim().toLowerCase() || "";
  const windowSize = Math.max(1, oldBlock.split("\n").length);
  const scored = lines.map((line, index) => ({
    index,
    score: similarity(line.trim().toLowerCase(), firstNeedle),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);
  if (scored.length === 0) return "(no similar lines found)";
  const seen = new Set<string>();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const usedNormalizedLines = new Set<string>();
  const snippets = scored.flatMap(({ index, score }) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(lines.length, start + windowSize + 2);
    if (usedRanges.some((range) => rangesOverlap(start, end, range.start, range.end))) return [];
    const windowLines = lines.slice(start, end);
    const normalizedLines = windowLines.map(normalizeSnippetLine).filter(Boolean);
    if (normalizedLines.length > 0 && normalizedLines.every((line) => usedNormalizedLines.has(line))) return [];
    const body = windowLines.map((line, offset) => `${start + offset + 1}: ${line}`).join("\n");
    if (seen.has(body)) return [];
    seen.add(body);
    usedRanges.push({ start, end });
    normalizedLines.forEach((line) => usedNormalizedLines.add(line));
    return [`[score ${score.toFixed(2)}]\n${body}`];
  });
  return snippets.length > 0 ? snippets.join("\n---\n") : "(no non-overlapping similar snippets found)";
};

const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

const normalizeSnippetLine = (line: string) =>
  line.trim().replace(/\s+/g, " ").toLowerCase();

const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aTokens = new Set(a.split(/\W+/).filter(Boolean));
  const bTokens = new Set(b.split(/\W+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  return shared / Math.max(aTokens.size, bTokens.size);
};
