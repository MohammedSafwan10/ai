import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import type { ToolDiffFileRecord, ToolDiffLineRecord } from "../../shared/types";

interface InlineFileChangeListProps {
  files: ToolDiffFileRecord[];
  active: boolean;
}

export function InlineFileChangeList({ files, active }: InlineFileChangeListProps) {
  const uniqueFiles = useMemo(() => dedupeDiffFiles(files), [files]);
  const firstKey = useMemo(() => fileKey(uniqueFiles[0]), [uniqueFiles]);
  const [selected, setSelected] = useState<string | null>(active ? firstKey : null);
  const [userTouched, setUserTouched] = useState(false);

  useEffect(() => {
    if (userTouched) return;
    setSelected((current) => {
      const next = active && firstKey ? firstKey : null;
      return current === next ? current : next;
    });
  }, [active, firstKey, userTouched]);

  if (uniqueFiles.length === 0) return null;

  return (
    <div className="inline-file-list">
      {uniqueFiles.map((file) => {
        const key = fileKey(file);
        const isOpen = selected === key;
        return (
          <div className="inline-file-change" key={key}>
            <button
              type="button"
              className={clsx("inline-file-row", isOpen && "is-open")}
              onClick={() => {
                setUserTouched(true);
                setSelected(isOpen ? null : key);
              }}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className={clsx("inline-file-label", active && "active-text-shimmer")}>{fileVerb(file)} {file.path}</span>
              <InlineDelta additions={file.additions} deletions={file.deletions} />
              {file.truncated && <span className="inline-diff-truncated-tag">truncated</span>}
            </button>
            {isOpen && <InlineDiffPanel file={file} />}
          </div>
        );
      })}
    </div>
  );
}

function InlineDelta({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="inline-diff-delta">
      {additions > 0 && <b className="delta-add">+{additions}</b>}
      {deletions > 0 && <b className="delta-del">-{deletions}</b>}
    </span>
  );
}

function InlineDiffPanel({ file }: { file: ToolDiffFileRecord }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => diffRows(file), [file]);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 22,
    overscan: 16,
  });

  if (file.hunks.length === 0) {
    return (
      <div className="inline-diff-panel">
        <div className="inline-diff-empty">
          {file.status === "renamed" && file.oldPath ? `Renamed from ${file.oldPath}` : "No content diff."}
        </div>
      </div>
    );
  }

  return (
    <div className="inline-diff-panel" ref={scrollerRef}>
      {file.oldPath && file.oldPath !== file.path && (
        <div className="inline-diff-rename">{file.oldPath} {"->"} {file.path}</div>
      )}
      <div className="inline-diff-virtual-spacer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;
          return (
            <div
              key={row.key}
              className="inline-diff-virtual-row"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {row.type === "hunk" ? (
                <div className="inline-diff-hunk-header">
                  -{formatRange(row.hunk.oldStart, row.hunk.oldLines)} +{formatRange(row.hunk.newStart, row.hunk.newLines)}
                  {row.hunk.section && <span>{row.hunk.section}</span>}
                </div>
              ) : (
                <DiffLine line={row.line} />
              )}
            </div>
          );
        })}
      </div>
      {file.truncated && (
        <div className="inline-diff-empty">Diff truncated. Open Review for the full change.</div>
      )}
    </div>
  );
}

function DiffLine({ line }: { line: ToolDiffLineRecord }) {
  return (
    <div className={clsx("diff-line", line.kind)}>
      <span className="diff-line-number">{line.oldLineNumber ?? ""}</span>
      <span className="diff-line-number">{line.newLineNumber ?? ""}</span>
      <span className="diff-marker">{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}</span>
      <code className="diff-code">{line.text || " "}</code>
    </div>
  );
}

const fileKey = (file?: ToolDiffFileRecord) => file ? `${file.oldPath || ""}->${file.path}` : "";

const dedupeDiffFiles = (files: ToolDiffFileRecord[]) => {
  const map = new Map<string, ToolDiffFileRecord>();
  files.forEach((file) => map.set(fileKey(file), file));
  return Array.from(map.values());
};

const fileVerb = (file: ToolDiffFileRecord) => {
  if (file.status === "created") return "Created";
  if (file.status === "deleted") return "Deleted";
  if (file.status === "renamed") return "Renamed";
  return "Edited";
};

const formatRange = (start: number, count: number) => count === 1 ? String(start) : `${start},${count}`;

type DiffRenderRow =
  | { type: "hunk"; key: string; hunk: ToolDiffFileRecord["hunks"][number] }
  | { type: "line"; key: string; line: ToolDiffLineRecord };

const diffRows = (file: ToolDiffFileRecord): DiffRenderRow[] =>
  file.hunks.flatMap((hunk, hunkIndex) => [
    {
      type: "hunk" as const,
      key: `${file.path}-hunk-${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`,
      hunk,
    },
    ...hunk.lines.map((line, lineIndex) => ({
      type: "line" as const,
      key: `${file.path}-line-${hunkIndex}-${lineIndex}-${line.kind}-${line.oldLineNumber ?? ""}-${line.newLineNumber ?? ""}`,
      line,
    })),
  ]);
