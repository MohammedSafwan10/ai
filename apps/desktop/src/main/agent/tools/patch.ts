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
    if (!matched) {
      throw new Error(`Patch hunk did not match ${filePath}. Read the file again and include more context.`);
    }
    const replacement = matched.endsWith("\n") && !newBlock.endsWith("\n") ? `${newBlock}\n` : newBlock;
    next = next.replace(matched, replacement);
  }
  return next;
};
