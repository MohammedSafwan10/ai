import { ChevronDown, ChevronRight, GitCompareArrows, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolDiffFileRecord, ToolEventRecord } from "../../shared/types";

interface ParsedDiff {
  key: string;
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}

export function ReviewStrip({ tools, onOpen }: { tools: ToolEventRecord[]; onOpen: () => void }) {
  const stats = useMemo(() => summarizeDiffs(tools), [tools]);
  if (stats.files === 0) return null;
  return (
    <button className="review-strip" onClick={onOpen}>
      <span>{stats.files} files changed</span>
      <strong className="delta-add">+{stats.additions}</strong>
      <em className="delta-del">-{stats.deletions}</em>
      <span className="review-link">Review here</span>
    </button>
  );
}

export function ReviewPanel({ tools, open, onClose }: { tools: ToolEventRecord[]; open: boolean; onClose: () => void }) {
  const diffs = useMemo(() => parseDiffs(tools), [tools]);
  const [expanded, setExpanded] = useState<string | null>(diffs[0]?.key || null);
  if (!open) return null;
  const stats = summarizeDiffs(tools);

  return (
    <aside className="review-panel">
      <header>
        <div>
          <span><GitCompareArrows size={15} /> Review</span>
          <strong>{stats.files} files changed</strong>
          <small><b className="delta-add">+{stats.additions}</b> <b className="delta-del">-{stats.deletions}</b></small>
        </div>
        <button onClick={onClose} aria-label="Close review"><X size={16} /></button>
      </header>
      <div className="review-files">
        {diffs.map((item) => {
          const isOpen = expanded === item.key;
          return (
            <section key={item.key} className="review-file">
              <button onClick={() => setExpanded(isOpen ? null : item.key)}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span>{item.path}</span>
                <strong className="delta-add">+{item.additions}</strong>
                <em className="delta-del">-{item.deletions}</em>
              </button>
              {isOpen && <pre>{item.diff}</pre>}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

const summarizeDiffs = (tools: ToolEventRecord[]) => {
  const diffs = summarizeDiffRecords(tools);
  return {
    files: new Set(diffs.map((diff) => diff.path)).size,
    additions: diffs.reduce((sum, diff) => sum + diff.additions, 0),
    deletions: diffs.reduce((sum, diff) => sum + diff.deletions, 0),
  };
};

const summarizeDiffRecords = (tools: ToolEventRecord[]): ParsedDiff[] =>
  collapseDiffsByPath(tools.flatMap((tool) => {
    if (tool.diffFiles?.length) {
      return tool.diffFiles.map((file, index) => ({
        key: `${tool.id}-${index}`,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        diff: "",
      }));
    }
    if (!tool.diff) return [];
    return tool.diff
      .split(/\n\n(?=--- )/g)
      .filter(Boolean)
      .map((diff, index) => {
        const path = diff.match(/^\+\+\+ (.+)$/m)?.[1] || diff.match(/^--- (.+)$/m)?.[1] || tool.title;
        const additions = diff.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length;
        const deletions = diff.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length;
        return { key: `${tool.id}-${index}`, path, additions, deletions, diff: "" };
      });
  }));

const parseDiffs = (tools: ToolEventRecord[]): ParsedDiff[] =>
  collapseDiffsByPath(tools.flatMap((tool) => {
    if (tool.diffFiles?.length) {
      return tool.diffFiles.map((file, index) => ({
        key: `${tool.id}-${index}`,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        diff: formatDiffFile(file),
      }));
    }
    if (!tool.diff) return [];
    return tool.diff
      .split(/\n\n(?=--- )/g)
      .filter(Boolean)
      .map((diff, index) => {
        const path = diff.match(/^\+\+\+ (.+)$/m)?.[1] || diff.match(/^--- (.+)$/m)?.[1] || tool.title;
        const additions = diff.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length;
        const deletions = diff.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length;
        return { key: `${tool.id}-${index}`, path, additions, deletions, diff };
      });
  }));

const collapseDiffsByPath = (diffs: ParsedDiff[]) => {
  const byPath = new Map<string, ParsedDiff>();
  diffs.forEach((diff) => byPath.set(diff.path, diff));
  return Array.from(byPath.values());
};

const formatDiffFile = (file: ToolDiffFileRecord) => [
  `--- ${file.status === "created" ? "/dev/null" : file.oldPath || file.path}`,
  `+++ ${file.status === "deleted" ? "/dev/null" : file.path}`,
  ...file.hunks.flatMap((hunk) => [
    `@@ -${formatRange(hunk.oldStart, hunk.oldLines)} +${formatRange(hunk.newStart, hunk.newLines)} @@`,
    ...hunk.lines.map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.text}`),
  ]),
].join("\n");

const formatRange = (start: number, count: number) => count === 1 ? String(start) : `${start},${count}`;
