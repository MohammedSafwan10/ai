import { Loader2, ShieldAlert, Terminal, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { ApprovalDecisionScope, ToolEventRecord } from "../../shared/types";
import { InlineFileChangeList } from "./InlineDiff";

interface ToolTimelineProps {
  tools: ToolEventRecord[];
  messageStatus: string;
  defaultOpen?: boolean;
  onApprove: (callId: string, approved: boolean, scope?: ApprovalDecisionScope) => void;
  onApproveAll: (callIds: string[]) => void;
}

export function ToolTimeline({ tools, messageStatus, defaultOpen = false, onApprove, onApproveAll }: ToolTimelineProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(() => new Set());
  const messageActive = isActiveMessageStatus(messageStatus);
  const normalizedTools = useMemo(() => normalizeStaleTools(tools, messageActive), [tools, messageActive]);
  const compactedTools = useMemo(() => compactTimelineTools(normalizedTools), [normalizedTools]);
  const hasLive = normalizedTools.some((tool) => tool.status === "running" || tool.status === "preparing");
  const hasBlockingAttention = hasLive || normalizedTools.some((tool) => tool.status === "awaiting_approval");
  const liveGroupOpen = messageActive && (defaultOpen || hasLive);
  const displayTools = useMemo(
    () => liveGroupOpen ? normalizedTools : showAllSteps ? compactedTools : visibleTimelineTools(compactedTools),
    [compactedTools, liveGroupOpen, normalizedTools, showAllSteps],
  );
  const hiddenStepCount = Math.max(0, compactedTools.length - displayTools.length);
  const summary = useMemo(() => {
    const pending = normalizedTools.filter((tool) => tool.status === "awaiting_approval").length;
    const failed = normalizedTools.filter((tool) => tool.status === "failed").length;
    const running = normalizedTools.filter((tool) => tool.status === "running" || tool.status === "preparing").length;
    const done = normalizedTools.filter((tool) => tool.status === "done").length;
    if (pending) return `${done} done · ${pending} need approval`;
    if (failed) return `${failed} failed · ${done} done`;
    if (running) {
      const doneTools = normalizedTools.filter((tool) => tool.status === "done");
      return done ? completedSummary(doneTools, done) : "Working";
    }
    return completedSummary(normalizedTools, done);
  }, [normalizedTools]);

  if (normalizedTools.length === 0) return null;
  const summaryStatus = normalizedTools.some((tool) => tool.status === "failed")
    ? "failed"
    : normalizedTools.some((tool) => tool.status === "awaiting_approval")
      ? "awaiting_approval"
      : normalizedTools.some((tool) => tool.status === "running" || tool.status === "preparing")
        ? "running"
        : "done";
  const shouldShowRows =
    userOpen ?? (
      defaultOpen ||
      hasBlockingAttention ||
      messageStatus === "awaiting_approval"
    );
  const pendingCallIds = normalizedTools.filter((tool) => tool.status === "awaiting_approval").map((tool) => tool.callId);
  const toggleOutput = (toolId: string) => {
    setExpandedOutputIds((current) => {
      const next = new Set(current);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  return (
    <div className="tool-timeline">
      <button
        className="tool-summary"
        onClick={() => setUserOpen((value) => !(value ?? shouldShowRows))}
      >
        {summaryStatus !== "done" && <StatusIcon status={summaryStatus} />}
        <span>{summary}</span>
      </button>
      {shouldShowRows && (
        <div className="tool-rows">
          {pendingCallIds.length > 1 && (
            <div className="approval-bundle-row">
              <span>{pendingCallIds.length} actions need approval</span>
              <button type="button" onClick={() => onApproveAll(pendingCallIds)}>
                Approve all
              </button>
            </div>
          )}
          {hiddenStepCount > 0 && (
            <button type="button" className="tool-hidden-steps" onClick={() => setShowAllSteps(true)}>
              Show {hiddenStepCount} earlier {hiddenStepCount === 1 ? "step" : "steps"}
            </button>
          )}
          {displayTools.map((tool) => (
            <div key={tool.id} className={clsx("tool-row", tool.status, tool.risk === "risky" && "risky")}>
              <StatusIcon status={tool.status} />
              <div className="tool-main">
                {!hasFileDiffs(tool) && (
                  <ToolTitleLine
                    tool={tool}
                    output={displayOutput(tool)}
                    expanded={expandedOutputIds.has(tool.id)}
                    onToggle={() => toggleOutput(tool.id)}
                  />
                )}
                {hasFileDiffs(tool) ? (
                  <InlineFileChangeList
                    files={tool.diffFiles || []}
                    active={isLiveOutput(tool)}
                  />
                ) : shouldShowActivity(tool) && <ToolActivity tool={tool} />}
                {tool.approvalReason && !isNoisyCommandReason(tool.approvalReason) && <p>{tool.approvalReason}</p>}
                {hasUsefulOutput(displayOutput(tool)) && (
                  isTerminalOutputTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <TerminalOutputPanel tool={tool} output={displayOutput(tool)} />
                    )
                  ) : (
                    isLiveOutput(tool)
                      ? <LiveOutput output={displayOutput(tool).slice(-9000)} />
                      : shouldShowOutputDetail(tool) && (
                        <details className="tool-detail">
                          <summary>Output</summary>
                          <pre>{displayOutput(tool).slice(0, 5000)}</pre>
                        </details>
                      )
                  )
                )}
                {tool.diff && shouldShowDiffDetail(tool) && !hasFileDiffs(tool) && (
                  <details className="tool-detail">
                    <summary>Diff</summary>
                    <pre>{tool.diff}</pre>
                  </details>
                )}
              </div>
              {tool.status === "awaiting_approval" && (
                <div className="approval-actions">
                  <button onClick={() => onApprove(tool.callId, true, "once")}>Approve once</button>
                  <button onClick={() => onApprove(tool.callId, true, "this_workspace")}>Trust tool</button>
                  {isTerminalApproval(tool) && (
                    <button onClick={() => onApprove(tool.callId, true, "command_prefix")}>Trust command</button>
                  )}
                  <button onClick={() => onApprove(tool.callId, false)}>Cancel</button>
                </div>
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
  return <span className="tool-status-spacer" aria-hidden="true" />;
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

function ToolTitleLine({
  tool,
  output,
  expanded,
  onToggle,
}: {
  tool: ToolEventRecord;
  output: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = isTerminalOutputTool(tool) && hasUsefulOutput(output);
  const preview = canExpand ? compactOutputPreview(output.trimEnd()) : "";
  if (!canExpand) {
    return (
      <div className="tool-title-line">
        <strong>{primaryToolLabel(tool)}</strong>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={clsx("tool-title-line", "tool-title-button", expanded && "is-open")}
      onClick={onToggle}
      title={expanded ? "Collapse output" : "Expand output"}
    >
      <Terminal size={13} />
      <strong>{primaryToolLabel(tool)}</strong>
      {preview && <code>{preview}</code>}
    </button>
  );
}

function TerminalOutputPanel({ tool, output }: { tool: ToolEventRecord; output: string }) {
  return (
    <div className="terminal-output-wrap">
      <pre className="terminal-output-panel">
        {output.trimEnd() || "(no output)"}
      </pre>
      <TerminalStats tool={tool} />
    </div>
  );
}

function TerminalStats({ tool }: { tool: ToolEventRecord }) {
  const terminal = tool.terminal;
  if (!terminal) return null;
  const parts = [
    terminal.status ? terminal.status.replace(/_/g, " ") : "",
    typeof terminal.processId === "number" ? `pid ${terminal.processId}` : "",
    typeof terminal.exitCode === "number" || terminal.exitCode === null ? `exit ${terminal.exitCode ?? "none"}` : "",
    typeof terminal.operationDurationMs === "number" ? `op ${formatDuration(terminal.operationDurationMs)}` : "",
    typeof terminal.processDurationMs === "number" ? `proc ${formatDuration(terminal.processDurationMs)}` : typeof terminal.durationMs === "number" ? formatDuration(terminal.durationMs) : "",
    terminal.backend ? terminal.backend : "",
    terminal.tty ? "pty" : "",
    terminal.omittedBytes ? `${formatBytes(terminal.omittedBytes)} omitted` : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <div className="terminal-output-stats">{parts.join(" · ")}</div>;
}

const liveLineClass = (line: string) => {
  if (line.startsWith("+ ") || line.startsWith("+")) return "live-add";
  if (line.startsWith("- ") || line.startsWith("-")) return "live-del";
  if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++") || line === "Live diff") return "live-meta";
  return "";
};

const cleanTitle = (title: string) => title.replace(/\s+\.$/, "").trim() || "Tool";

const isTerminalApproval = (tool: ToolEventRecord) =>
  tool.name === "desktop_spawn_process" || tool.name === "desktop_write_process";

const isTerminalOutputTool = (tool: ToolEventRecord) =>
  [
    "desktop_spawn_process",
    "desktop_write_process",
    "desktop_kill_process",
    "desktop_resize_process",
    "desktop_run_diagnostics",
    "desktop_git_status",
    "desktop_git_diff",
  ].includes(tool.name);

const compactOutputPreview = (output: string) => {
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1) || "";
  return line.length <= 140 ? line : `${line.slice(0, 139)}...`;
};

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) return `${Math.max(1, Math.round(durationMs))}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const primaryToolLabel = (tool: ToolEventRecord) => {
  if (tool.diffFiles?.length === 1) {
    const [file] = tool.diffFiles;
    return (
      <>
        {fileVerb(file.status)} {file.path}
        <InlineDelta additions={file.additions} deletions={file.deletions} />
      </>
    );
  }
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
  tool.output || tool.result?.output || tool.result?.error || "";

const isLiveOutput = (tool: ToolEventRecord) =>
  tool.status === "running" || tool.status === "preparing";

const isActiveMessageStatus = (status: string) =>
  [
    "sampling",
    "running",
    "executing_tool",
    "waiting_tool",
    "awaiting_approval",
    "draining",
    "completing",
  ].includes(status);

const hasFileDiffs = (tool: ToolEventRecord) =>
  Boolean(tool.diffFiles?.length);

const shouldShowActivity = (tool: ToolEventRecord) =>
  toolActivityItems(tool).length > 1;

const shouldShowDiffDetail = (tool: ToolEventRecord) =>
  tool.status !== "done" || toolActivityItems(tool).length !== 1;

const shouldShowOutputDetail = (tool: ToolEventRecord) =>
  tool.status !== "done" ||
  Boolean(tool.result?.error);

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
  if (tool.diffFiles?.length) {
    return tool.diffFiles.map((file) => ({
      verb: fileVerb(file.status),
      path: file.oldPath && file.oldPath !== file.path ? `${file.oldPath} -> ${file.path}` : file.path,
      additions: file.additions,
      deletions: file.deletions,
    }));
  }

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

const fileVerb = (status: string) => {
  if (status === "created") return "Created";
  if (status === "deleted") return "Deleted";
  if (status === "renamed") return "Renamed";
  return "Edited";
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
  const changedFiles = new Set(
    tools.flatMap((tool) => tool.status === "done" ? (tool.diffFiles || []).map((file) => file.path) : []),
  );
  const fileChanges = changedFiles.size || tools.filter((tool) =>
    tool.status === "done" &&
    ["desktop_write_file", "desktop_apply_patch", "desktop_delete_path", "desktop_rename_path"].includes(tool.name)
  ).length;
  const commands = tools.filter((tool) =>
    tool.status === "done" &&
    ["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process", "desktop_run_diagnostics", "desktop_git_status", "desktop_git_diff"].includes(tool.name)
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

const compactTimelineTools = (tools: ToolEventRecord[]) => {
  const latestCompletedFileEdit = new Map<string, ToolEventRecord>();
  tools.forEach((tool) => {
    const key = completedSingleFileEditKey(tool);
    if (key) latestCompletedFileEdit.set(key, tool);
  });
  return tools.filter((tool) => {
    const key = completedSingleFileEditKey(tool);
    return !key || latestCompletedFileEdit.get(key)?.id === tool.id;
  });
};

const completedSingleFileEditKey = (tool: ToolEventRecord) => {
  if (tool.status !== "done" || tool.diffFiles?.length !== 1) return "";
  const [file] = tool.diffFiles;
  return `${file.oldPath || ""}->${file.path}`;
};

const visibleTimelineTools = (tools: ToolEventRecord[]) => {
  const active = tools.filter((tool) => tool.status !== "done" && tool.status !== "cancelled");
  const attention = tools.filter((tool) => tool.status === "failed" || tool.status === "awaiting_approval");
  const completed = tools.filter((tool) => tool.status === "done" || tool.status === "cancelled");
  const keepIds = new Set([
    ...active.map((tool) => tool.id),
    ...attention.map((tool) => tool.id),
    ...completed.slice(-18).map((tool) => tool.id),
  ]);
  return tools.filter((tool) => keepIds.has(tool.id));
};

const isNoisyCommandReason = (reason: string) =>
  reason.toLowerCase().includes("mutate files") &&
  reason.toLowerCase().includes("chain shell operations");

const normalizeStaleTools = (tools: ToolEventRecord[], messageActive: boolean): ToolEventRecord[] => {
  if (messageActive) return tools;
  return tools.map((tool) => {
    if (tool.status !== "preparing" && tool.status !== "running") return tool;
    return {
      ...tool,
      status: "done",
      liveStatus: undefined,
      result: tool.result || { success: true },
      endedAt: tool.endedAt || tool.updatedAt,
    };
  });
};
