import { Check, Loader2, ExternalLink, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { ToolEventRecord } from "../../shared/types";

interface ToolTimelineProps {
  tools: ToolEventRecord[];
  messageStatus: string;
  onApprove: (callId: string, approved: boolean) => void;
  onOpenPath: (path: string) => void;
}

export function ToolTimeline({ tools, messageStatus, onApprove, onOpenPath }: ToolTimelineProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [lastRunActive, setLastRunActive] = useState(false);
  const hasLive = tools.some((tool) => tool.status === "running" || tool.status === "preparing");
  const hasAttention = hasLive || tools.some((tool) => tool.status === "awaiting_approval" || tool.status === "failed");
  const runActive = messageStatus === "running" || messageStatus === "awaiting_approval";
  const summary = useMemo(() => {
    const pending = tools.filter((tool) => tool.status === "awaiting_approval").length;
    const failed = tools.filter((tool) => tool.status === "failed").length;
    const running = tools.filter((tool) => tool.status === "running" || tool.status === "preparing").length;
    const done = tools.filter((tool) => tool.status === "done").length;
    if (pending) return `${done} done · ${pending} need approval`;
    if (failed) return `${failed} failed · ${done} done`;
    if (running) return `${running} running · ${done} done`;
    return completedSummary(tools, done);
  }, [tools]);

  useEffect(() => {
    if (runActive && !lastRunActive) setUserOpen(true);
    if (!runActive && lastRunActive && !hasAttention) setUserOpen(false);
    setLastRunActive(runActive);
  }, [hasAttention, lastRunActive, runActive]);

  if (tools.length === 0) return null;
  const summaryStatus = tools.some((tool) => tool.status === "failed")
    ? "failed"
    : tools.some((tool) => tool.status === "awaiting_approval")
      ? "awaiting_approval"
      : tools.some((tool) => tool.status === "running" || tool.status === "preparing")
        ? "running"
        : "done";
  const shouldShowRows =
    userOpen ?? (
      runActive ||
      hasAttention ||
      messageStatus === "awaiting_approval"
    );

  return (
    <div className="tool-timeline">
      <button
        className="tool-summary"
        onClick={() => setUserOpen((value) => !(value ?? shouldShowRows))}
      >
        <StatusIcon status={summaryStatus} />
        <span>{summary}</span>
      </button>
      {shouldShowRows && (
        <div className="tool-rows">
          {tools.map((tool) => (
            <div key={tool.id} className={clsx("tool-row", tool.status, tool.risk === "risky" && "risky")}>
              <StatusIcon status={tool.status} />
              <div className="tool-main">
                <div className="tool-title-line">
                  <strong>{primaryToolLabel(tool)}</strong>
                  {tool.status !== "done" && <small>{tool.status.replace(/_/g, " ")}</small>}
                </div>
                {shouldShowActivity(tool) && <ToolActivity tool={tool} />}
                {tool.approvalReason && <p>{tool.approvalReason}</p>}
                {hasUsefulOutput(displayOutput(tool)) && (
                  isLiveOutput(tool)
                    ? <LiveOutput output={displayOutput(tool).slice(-9000)} />
                    : shouldShowOutputDetail(tool) && (
                      <details className="tool-detail">
                        <summary>Output</summary>
                        <pre>{displayOutput(tool).slice(0, 5000)}</pre>
                      </details>
                    )
                )}
                {tool.diff && shouldShowDiffDetail(tool) && (
                  <details className="tool-detail">
                    <summary>Diff</summary>
                    <pre>{tool.diff}</pre>
                  </details>
                )}
              </div>
              {tool.status === "awaiting_approval" && (
                <div className="approval-actions">
                  <button onClick={() => onApprove(tool.callId, true)}>Approve</button>
                  <button onClick={() => onApprove(tool.callId, false)}>Cancel</button>
                </div>
              )}
              {typeof tool.result?.data?.path === "string" && (
                <button
                  type="button"
                  className="tool-open-button"
                  title={`Open ${tool.result.data.path}`}
                  onClick={() => onOpenPath(String(tool.result?.data?.path))}
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "failed" || status === "cancelled") return <XCircle size={15} className="status-failed" />;
  if (status === "awaiting_approval") return <ShieldAlert size={15} className="status-pending" />;
  if (status === "running" || status === "preparing") return <Loader2 size={15} className="status-running" />;
  return <Check size={15} className="status-done" />;
}

function LiveOutput({ output }: { output: string }) {
  return (
    <pre className="tool-live-output">
      {output.split(/\r?\n/).map((line, index) => (
        <span className={clsx("live-line", liveLineClass(line))} key={`${index}-${line.slice(0, 16)}`}>
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

const liveLineClass = (line: string) => {
  if (line.startsWith("+ ") || line.startsWith("+")) return "live-add";
  if (line.startsWith("- ") || line.startsWith("-")) return "live-del";
  if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++") || line === "Live diff") return "live-meta";
  return "";
};

const cleanTitle = (title: string) => title.replace(/\s+\.$/, "").trim() || "Tool";

const primaryToolLabel = (tool: ToolEventRecord) => {
  const activity = toolActivityItems(tool);
  if (activity.length === 1) {
    const item = activity[0];
    return (
      <>
        {item.verb} {item.path}
        <InlineDelta additions={item.additions} deletions={item.deletions} />
      </>
    );
  }
  return cleanTitle(tool.title);
};

function InlineDelta({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="tool-inline-delta">
      {additions > 0 && <b className="delta-add">+{additions}</b>}
      {deletions > 0 && <b className="delta-del">-{deletions}</b>}
    </span>
  );
}

const formatToolName = (name: string) =>
  name
    .replace(/^desktop_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const hasUsefulOutput = (output?: string) => {
  const trimmed = output?.trim();
  return Boolean(trimmed && trimmed !== "(empty)");
};

const displayOutput = (tool: ToolEventRecord) =>
  tool.output || tool.result?.error || "";

const isLiveOutput = (tool: ToolEventRecord) =>
  tool.status === "running" || tool.status === "preparing";

const shouldShowActivity = (tool: ToolEventRecord) =>
  tool.status !== "done" || toolActivityItems(tool).length > 1;

const shouldShowDiffDetail = (tool: ToolEventRecord) =>
  tool.status !== "done" || toolActivityItems(tool).length !== 1;

const shouldShowOutputDetail = (tool: ToolEventRecord) =>
  tool.status !== "done" ||
  Boolean(tool.result?.error) ||
  tool.name === "desktop_run_command" ||
  tool.name === "desktop_git_status" ||
  tool.name === "desktop_git_diff" ||
  tool.name === "desktop_search";

function ToolActivity({ tool }: { tool: ToolEventRecord }) {
  const items = toolActivityItems(tool);
  if (items.length === 0) return null;
  return (
    <div className="tool-activity-list">
      {items.map((item, index) => (
        <div className="tool-activity-item" key={`${item.path}-${index}`}>
          <span className="tool-activity-verb">{item.verb}</span>
          <span className="tool-activity-path">{item.path}</span>
          {(item.additions > 0 || item.deletions > 0) && (
            <span className="tool-activity-delta">
              {item.additions > 0 && <b className="delta-add">+{item.additions}</b>}
              {item.deletions > 0 && <b className="delta-del">-{item.deletions}</b>}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface ToolActivityItem {
  verb: string;
  path: string;
  additions: number;
  deletions: number;
}

const toolActivityItems = (tool: ToolEventRecord): ToolActivityItem[] => {
  const fromDiff = diffActivityItems(tool.diff);
  if (fromDiff.length > 0) return fromDiff;

  if (tool.name === "desktop_apply_patch") {
    const patch = normalizePatchText(String(tool.args.patch || ""));
    return patchActivityItems(patch);
  }

  if (tool.name === "desktop_write_file") {
    const path = String(tool.args.path || tool.result?.data?.path || "").trim();
    return path ? [{ verb: tool.status === "done" ? "Wrote" : "Writing", path, additions: 0, deletions: 0 }] : [];
  }

  if (tool.name === "desktop_delete_path") {
    const path = String(tool.args.path || tool.result?.data?.path || "").trim();
    return path ? [{ verb: tool.status === "done" ? "Deleted" : "Deleting", path, additions: 0, deletions: 0 }] : [];
  }

  if (tool.name === "desktop_rename_path") {
    const from = String(tool.args.fromPath || tool.result?.data?.from || "").trim();
    const to = String(tool.args.toPath || tool.result?.data?.to || "").trim();
    return from ? [{ verb: tool.status === "done" ? "Renamed" : "Renaming", path: to ? `${from} -> ${to}` : from, additions: 0, deletions: 0 }] : [];
  }

  return [];
};

const normalizePatchText = (value: string) =>
  value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"");

const patchActivityItems = (patch: string): ToolActivityItem[] => {
  if (!patch.trim()) return [];
  const items: ToolActivityItem[] = [];
  let pendingMoveFrom = "";
  patch.split(/\r?\n/).forEach((line) => {
    const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
    const update = line.match(/^\*\*\* Update File:\s*(.+)$/);
    const del = line.match(/^\*\*\* Delete File:\s*(.+)$/);
    const move = line.match(/^\*\*\* Move to:\s*(.+)$/);
    if (add) items.push({ verb: "Creating", path: add[1].trim(), additions: 0, deletions: 0 });
    if (update) {
      pendingMoveFrom = update[1].trim();
      items.push({ verb: "Editing", path: pendingMoveFrom, additions: 0, deletions: 0 });
    }
    if (del) items.push({ verb: "Deleting", path: del[1].trim(), additions: 0, deletions: 0 });
    if (move && pendingMoveFrom && items.length > 0) {
      items[items.length - 1] = { ...items[items.length - 1], verb: "Moving", path: `${pendingMoveFrom} -> ${move[1].trim()}` };
    }
  });
  return dedupeActivityItems(items);
};

const diffActivityItems = (diff?: string): ToolActivityItem[] => {
  if (!diff) return [];
  const sections = diff
    .split(/\n(?=--- )/g)
    .map((section) => section.trim())
    .filter(Boolean);
  const items = sections.map((section) => {
    const before = section.match(/^---\s+(.+)$/m)?.[1]?.trim() || "";
    const after = section.match(/^\+\+\+\s+(.+)$/m)?.[1]?.trim() || before;
    const additions = section.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length;
    const deletions = section.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length;
    const path = after || before;
    const verb = !before || before === "/dev/null"
      ? "Created"
      : additions === 0 && deletions > 0
        ? "Deleted"
        : "Edited";
    return { verb, path, additions, deletions };
  });
  return dedupeActivityItems(items);
};

const dedupeActivityItems = (items: ToolActivityItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.verb}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.path);
  });
};

const completedSummary = (tools: ToolEventRecord[], done: number) => {
  const fileChanges = tools.filter((tool) =>
    tool.status === "done" &&
    ["desktop_write_file", "desktop_apply_patch", "desktop_delete_path", "desktop_rename_path"].includes(tool.name)
  ).length;
  const commands = tools.filter((tool) =>
    tool.status === "done" &&
    ["desktop_run_command", "desktop_git_status", "desktop_git_diff"].includes(tool.name)
  ).length;
  const reads = tools.filter((tool) =>
    tool.status === "done" &&
    ["desktop_read_file", "desktop_list_dir", "desktop_search"].includes(tool.name)
  ).length;
  const parts = [
    fileChanges ? `${fileChanges} ${fileChanges === 1 ? "file changed" : "files changed"}` : "",
    commands ? `${commands} ${commands === 1 ? "command" : "commands"}` : "",
    !fileChanges && !commands && reads ? `${reads} ${reads === 1 ? "check" : "checks"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : `${done} ${done === 1 ? "tool" : "tools"} done`;
};
