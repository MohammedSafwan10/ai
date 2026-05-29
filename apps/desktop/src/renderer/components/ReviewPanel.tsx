import { ChevronDown, ChevronRight, GitCompareArrows, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ToolDiffFileRecord, ToolEventRecord, TurnUndoRecord } from "../../shared/types";

interface ParsedDiff {
  key: string;
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}

export function TurnReviewCard({
  tools,
  undo,
  onOpen,
  onPrepareUndo,
  onUndo,
}: {
  tools: ToolEventRecord[];
  undo: TurnUndoRecord | null;
  onOpen: () => void;
  onPrepareUndo: () => Promise<TurnUndoRecord | null>;
  onUndo: () => Promise<TurnUndoRecord | null>;
}) {
  const stats = useMemo(() => summarizeDiffs(tools), [tools]);
  const [confirming, setConfirming] = useState(false);
  const [localUndo, setLocalUndo] = useState<TurnUndoRecord | null>(null);
  const activeUndo = undo || localUndo;
  const canUndo = hasReversibleTools(tools) && !["undoing", "undone"].includes(activeUndo?.status || "");
  if (stats.files === 0) return null;
  return (
    <div className="turn-review-shell">
      <div className="turn-review-card">
        <button type="button" className="turn-review-main" onClick={onOpen}>
          <span>{stats.files} {stats.files === 1 ? "file changed" : "files changed"}</span>
          <strong className="delta-add">+{stats.additions}</strong>
          <em className="delta-del">-{stats.deletions}</em>
          <span className="review-link">Review</span>
        </button>
        {canUndo && (
          <button
            type="button"
            className="turn-undo-link"
            onClick={async () => {
              const prepared = activeUndo || await onPrepareUndo();
              setLocalUndo(prepared);
              if (prepared) setConfirming(true);
            }}
          >
            Undo
          </button>
        )}
        {activeUndo?.status === "undoing" && <span className="turn-undo-status">Undoing...</span>}
        {activeUndo?.status === "undone" && <span className="turn-undo-status">Undone</span>}
        {activeUndo?.status === "partially_undone" && <span className="turn-undo-status warning">Partially undone</span>}
      </div>
      {confirming && activeUndo && (
        <div className="turn-undo-confirm">
          <span>Undo {activeUndo.summary.files} {activeUndo.summary.files === 1 ? "file change" : "file changes"}?</span>
          <button
            type="button"
            onClick={async () => {
              setConfirming(false);
              setLocalUndo({ ...activeUndo, status: "undoing", updatedAt: Date.now() });
              const result = await onUndo();
              setLocalUndo(result);
            }}
          >
            Undo changes
          </button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
      {activeUndo?.status === "partially_undone" && activeUndo.conflicts.length > 0 && (
        <details className="turn-undo-conflicts">
          <summary>{activeUndo.conflicts.length} skipped</summary>
          {activeUndo.conflicts.map((conflict) => (
            <div key={`${conflict.path}-${conflict.reason}`}>
              <code>{conflict.path}</code> {conflict.reason}
            </div>
          ))}
        </details>
      )}
      {activeUndo?.status === "failed" && activeUndo.error && (
        <div className="turn-undo-error">{activeUndo.error}</div>
      )}
    </div>
  );
}

export function ReviewPanel({ tools, open, onClose }: { tools: ToolEventRecord[]; open: boolean; onClose: () => void }) {
  const diffs = useMemo(() => parseDiffs(tools), [tools]);
  const firstDiffKey = diffs[0]?.key || null;
  const [expanded, setExpanded] = useState<string | null>(diffs[0]?.key || null);
  useEffect(() => {
    setExpanded(firstDiffKey);
  }, [firstDiffKey]);
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

const hasReversibleTools = (tools: ToolEventRecord[]) =>
  tools.some((tool) => Boolean(tool.result?.data?.undo));

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
