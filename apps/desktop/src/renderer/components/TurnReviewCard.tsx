import { useMemo, useState } from "react";
import type { ToolEventRecord, TurnUndoRecord } from "../../shared/types";

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

const summarizeDiffs = (tools: ToolEventRecord[]) => {
  const diffs = tools.flatMap((tool) => tool.diffFiles || []);
  return {
    files: new Set(diffs.map((file) => file.path)).size,
    additions: diffs.reduce((sum, file) => sum + file.additions, 0),
    deletions: diffs.reduce((sum, file) => sum + file.deletions, 0),
  };
};

const hasReversibleTools = (tools: ToolEventRecord[]) =>
  tools.some((tool) => Boolean(tool.result?.data?.undo));
