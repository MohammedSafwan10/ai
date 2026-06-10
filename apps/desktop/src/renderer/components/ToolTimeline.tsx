import { Minus, Plus, X, Bot, Globe2, ImageIcon, MessageSquareMore, MonitorCog, ShieldAlert, Terminal, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import type { ApprovalDecisionScope, SubagentRecord, ToolEventRecord } from "../../shared/types";
import { InlineFileChangeList } from "./InlineDiff";

interface ToolTimelineProps {
  tools: ToolEventRecord[];
  subagents?: SubagentRecord[];
  messageStatus: string;
  defaultOpen?: boolean;
  onApprove: (callId: string, approved: boolean, scope?: ApprovalDecisionScope) => void;
  onApproveAll: (callIds: string[]) => void;
}

export function ToolTimeline({ tools, subagents = [], messageStatus, defaultOpen = false, onApprove, onApproveAll }: ToolTimelineProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(() => new Set());
  const [detailedTools, setDetailedTools] = useState<Record<string, ToolEventRecord>>({});
  const [imagePreview, setImagePreview] = useState<GeneratedImagePreview | null>(null);
  const messageActive = isActiveMessageStatus(messageStatus);
  const resolvedTools = useMemo(
    () => tools.map((tool) => detailedTools[tool.id] ? { ...tool, ...detailedTools[tool.id] } : tool),
    [detailedTools, tools],
  );
  const normalizedTools = useMemo(() => normalizeStaleTools(resolvedTools, messageActive), [resolvedTools, messageActive]);
  const compactedTools = useMemo(() => compactTimelineTools(normalizedTools), [normalizedTools]);
  const hasLive = normalizedTools.some((tool) => tool.status === "running" || tool.status === "preparing");
  const currentLiveToolId = useMemo(() => latestLiveToolId(normalizedTools), [normalizedTools]);
  const hasBlockingAttention = hasLive || normalizedTools.some((tool) => tool.status === "awaiting_approval");
  const liveGroupOpen = messageActive && (defaultOpen || hasLive);
  useEffect(() => {
    if (userOpen === null && (defaultOpen || hasBlockingAttention || messageStatus === "awaiting_approval")) {
      setUserOpen(true);
    }
  }, [defaultOpen, hasBlockingAttention, messageStatus, userOpen]);
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
    const opening = !expandedOutputIds.has(toolId);
    setExpandedOutputIds((current) => {
      const next = new Set(current);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
    const tool = tools.find((item) => item.id === toolId);
    if (opening && tool?.detailAvailable && !detailedTools[toolId]) {
      void window.privoraDesktop.getToolEventDetail(toolId)
        .then(({ tool: detail }) => setDetailedTools((current) => ({ ...current, [toolId]: detail })))
        .catch((error) => console.error("Could not load tool detail", error));
    }
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
                    subagents={subagents}
                    output={displayOutput(tool)}
                    expanded={expandedOutputIds.has(tool.id)}
                    live={tool.id === currentLiveToolId}
                    onToggle={() => toggleOutput(tool.id)}
                  />
                )}
                {hasFileDiffs(tool) ? (
                  <InlineFileChangeList
                    files={tool.diffFiles || []}
                    active={tool.id === currentLiveToolId}
                  />
                ) : shouldShowActivity(tool) && <ToolActivity tool={tool} active={tool.id === currentLiveToolId} />}
                {tool.approvalReason && !isNoisyCommandReason(tool.approvalReason) && <p>{tool.approvalReason}</p>}
                {(hasUsefulOutput(displayOutput(tool)) || isSubagentTool(tool) || isBrowserTool(tool) || isComputerTool(tool) || isImageTool(tool)) && (
                  isTerminalOutputTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <TerminalOutputPanel tool={tool} output={displayOutput(tool)} />
                    )
                  ) : isImageTool(tool) ? (
                    (expandedOutputIds.has(tool.id) || isLiveOutput(tool)) && (
                      <ImageOutputPanel tool={tool} onPreview={setImagePreview} />
                    )
                  ) : isBrowserTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <BrowserOutputPanel tool={tool} />
                    )
                  ) : isComputerTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <ComputerOutputPanel tool={tool} />
                    )
                  ) : isQuestionTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <QuestionAnswerPanel tool={tool} />
                    )
                  ) : isSubagentTool(tool) ? (
                    expandedOutputIds.has(tool.id) && (
                      <SubagentInspector tool={tool} subagents={subagents} />
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
      {imagePreview && (
        <GeneratedImageLightbox image={imagePreview} onClose={() => setImagePreview(null)} />
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "failed" || status === "cancelled") return <XCircle size={15} className="status-failed" />;
  if (status === "awaiting_approval") return <ShieldAlert size={15} className="status-pending" />;
  if (status === "running" || status === "preparing") return <span className="tool-status-live" aria-hidden="true" />;
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
  subagents,
  output,
  expanded,
  live,
  onToggle,
}: {
  tool: ToolEventRecord;
  subagents: SubagentRecord[];
  output: string;
  expanded: boolean;
  live: boolean;
  onToggle: () => void;
}) {
  const canExpand = (
    (isTerminalOutputTool(tool) && hasTerminalOutput(tool, output)) ||
    (isQuestionTool(tool) && hasUsefulOutput(output))
  ) || isSubagentTool(tool) || isBrowserTool(tool) || isComputerTool(tool) || isImageTool(tool);
  const preview = canExpand && !isQuestionTool(tool) && !isSubagentTool(tool) && !isImageTool(tool)
    ? compactOutputPreview(output.trimEnd())
    : "";
  if (!canExpand) {
    return (
      <div className="tool-title-line">
        <strong className={clsx(live && "active-text-shimmer")}>{primaryToolLabel(tool)}</strong>
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
      {isQuestionTool(tool) ? <MessageSquareMore size={13} /> : isSubagentTool(tool) ? <Bot size={13} /> : isImageTool(tool) ? <ImageIcon size={13} /> : isBrowserTool(tool) ? <Globe2 size={13} /> : isComputerTool(tool) ? <MonitorCog size={13} /> : <Terminal size={13} />}
      <strong className={clsx(live && "active-text-shimmer")}>{primaryToolLabel(tool)}</strong>
      {preview && <code>{preview}</code>}
    </button>
  );
}

function SubagentInspector({ tool, subagents }: { tool: ToolEventRecord; subagents: SubagentRecord[] }) {
  const agents = subagentsForTool(tool, subagents);
  const fallback = subagentRecordFromTool(tool);
  const visibleAgents = agents.length > 0 ? agents : fallback ? [fallback] : [];
  if (visibleAgents.length === 0) {
    return (
      <div className="subagent-inspector">
        <p>{displayOutput(tool).trim() || "No subagent details available yet."}</p>
      </div>
    );
  }
  return (
    <div className="subagent-inspector">
      {visibleAgents.map((agent) => {
        const preview = usefulSubagentPreview(agent, tool);
        const compactSingleAgent = visibleAgents.length === 1 && tool.name !== "list_agents" && tool.name !== "wait_agent";
        const showHeading = !compactSingleAgent && hasMeaningfulSubagentHeading(agent);
        const showPath = !compactSingleAgent && hasMeaningfulSubagentPath(agent);
        const showTask = hasMeaningfulSubagentPrompt(agent);
        const showEmptyState = !showHeading && !showPath && !showTask && !preview;
        return (
          <section key={agent.id || agent.threadId || agent.agentPath}>
            {showHeading && (
              <div className="subagent-inspector-head">
                <span className={clsx("subagent-dot", agent.status)} />
                <strong>{formatSubagentName(agent)}</strong>
                <code>{agent.status}</code>
              </div>
            )}
            {(showPath || showTask) && (
              <dl>
                {showPath && (
                  <div>
                    <dt>Path</dt>
                    <dd>{agent.agentPath}</dd>
                  </div>
                )}
                {showTask && (
                  <div>
                    <dt>Task</dt>
                    <dd>{agent.prompt}</dd>
                  </div>
                )}
              </dl>
            )}
            {preview && (
              <pre>{compactSubagentPreview(preview)}</pre>
            )}
            {showEmptyState && <p className="subagent-empty">No agent updates yet.</p>}
          </section>
        );
      })}
    </div>
  );
}

function TerminalOutputPanel({ tool, output }: { tool: ToolEventRecord; output: string }) {
  const sections = terminalOutputSections(tool, output);
  return (
    <div className="terminal-output-wrap">
      {sections.map((section) => (
        <section className="terminal-output-section" key={section.label}>
          <small>{section.label}</small>
          <pre className="terminal-output-panel">
            {section.value.trimEnd() || "(no output)"}
          </pre>
        </section>
      ))}
      <TerminalStats tool={tool} />
    </div>
  );
}

function TerminalStats({ tool }: { tool: ToolEventRecord }) {
  return null;
}

function BrowserOutputPanel({ tool }: { tool: ToolEventRecord }) {
  const details = browserDetails(tool);
  return (
    <div className="browser-tool-panel">
      {details.map((detail) => (
        <section key={detail.label}>
          <small>{detail.label}</small>
          <pre>{detail.value}</pre>
        </section>
      ))}
    </div>
  );
}

type GeneratedImagePreview = ReturnType<typeof generatedImagesFromTool>[number];

function ImageOutputPanel({ tool, onPreview }: { tool: ToolEventRecord; onPreview: (image: GeneratedImagePreview) => void }) {
  const images = generatedImagesFromTool(tool);
  const running = isLiveOutput(tool);
  if (images.length === 0) {
    if (running) {
      return (
        <div className="image-tool-panel">
          <section className="generated-image-card is-generating">
            <div className="generated-image-shimmer" aria-hidden="true" />
          </section>
        </div>
      );
    }
    return (
      <div className="image-tool-panel">
        <section className="generated-image-card">
          <div>
            <small>Output</small>
            <pre>{displayOutput(tool).trim() || "(no generated images)"}</pre>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="image-tool-panel">
      {images.map((image, index) => (
        <section className="generated-image-card" key={image.id || image.path || index}>
          {image.previewUrl && (
            <button
              type="button"
              className="generated-image-preview-button"
              title="Open image preview"
              onClick={() => onPreview(image)}
            >
              <img src={image.previewUrl} alt={image.prompt ? `Generated image: ${image.prompt}` : "Generated image"} />
            </button>
          )}
          <div>
            <small>{image.provider || "image"} {image.model ? `· ${image.model}` : ""}</small>
            <pre>{[
              image.path,
              image.workspacePath ? `workspace: ${image.workspacePath}` : "",
              image.mimeType ? `mime: ${image.mimeType}` : "",
              image.sizeBytes ? `size: ${formatBytes(Number(image.sizeBytes))}` : "",
              image.id ? `id: ${image.id}` : "",
            ].filter(Boolean).join("\n")}</pre>
          </div>
        </section>
      ))}
    </div>
  );
}

function GeneratedImageLightbox({ image, onClose }: { image: GeneratedImagePreview; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<"reveal" | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = image.workspacePath || image.path || image.id || "Generated image";
  const imageInput = image.id ? { id: image.id } : { sourcePath: image.path || undefined };
  const revealImage = async () => {
    setBusy("reveal");
    try {
      await window.privoraDesktop.revealGeneratedImage(imageInput);
    } catch (error) {
      console.error("Could not reveal generated image", error);
    } finally {
      setBusy(null);
    }
  };
  return createPortal(
    <div
      className="image-lightbox generated-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Generated image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="image-lightbox-topbar">
        <div className="image-lightbox-title">
          <strong>{image.model || "Generated image"}</strong>
          <span>{title}</span>
        </div>
        <div className="image-lightbox-actions">
          {(image.id || image.path) && (
            <button type="button" onClick={() => void revealImage()} disabled={busy !== null} title="Show saved file" aria-label="Show saved file">
              <ImageIcon size={18} />
            </button>
          )}
          <button type="button" onClick={onClose} title="Close" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="image-lightbox-stage">
        {image.previewUrl && (
          <img src={image.previewUrl} alt={image.prompt || "Generated image preview"} style={{ transform: `scale(${zoom})` }} />
        )}
      </div>
      <div className="image-lightbox-zoom" aria-label="Image zoom">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} title="Zoom out">
          <Minus size={18} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))} title="Zoom in">
          <Plus size={18} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ComputerOutputPanel({ tool }: { tool: ToolEventRecord }) {
  const details = computerDetails(tool);
  return (
    <div className="browser-tool-panel computer-tool-panel">
      {details.map((detail) => (
        <section key={detail.label}>
          <small>{detail.label}</small>
          <pre>{detail.value}</pre>
        </section>
      ))}
    </div>
  );
}

function QuestionAnswerPanel({ tool }: { tool: ToolEventRecord }) {
  const questions = normalizeQuestionArgs(tool.args.questions);
  const answers = normalizeAnswerResult(tool.result?.data, tool.result?.output || tool.output || "");
  const ids = Array.from(new Set([...questions.map((question) => question.id), ...Object.keys(answers)]));
  if (ids.length === 0) {
    return (
      <div className="question-answer-panel">
        <pre>{displayOutput(tool).trim() || "(no answers)"}</pre>
      </div>
    );
  }
  return (
    <div className="question-answer-panel">
      {ids.map((id, index) => {
        const question = questions.find((item) => item.id === id);
        const selected = answers[id] || [];
        return (
          <section key={id || index}>
            <small>{question?.header || id || `Question ${index + 1}`}</small>
            {question?.question && <p>{question.question}</p>}
            <div className="question-answer-values">
              {selected.length > 0 ? selected.map((answer) => (
                <span key={answer}>{answer}</span>
              )) : <span>No answer</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const liveLineClass = (line: string) => {
  if (line.startsWith("+ ") || line.startsWith("+")) return "live-add";
  if (line.startsWith("- ") || line.startsWith("-")) return "live-del";
  if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++") || line === "Live diff") return "live-meta";
  return "";
};

const cleanTitle = (title: string) => title.replace(/\s+\.$/, "").trim() || "Tool";

const isTerminalApproval = (tool: ToolEventRecord) =>
  tool.name === "exec_command" || tool.name === "write_stdin";

const isTerminalOutputTool = (tool: ToolEventRecord) =>
  [
    "exec_command",
    "write_stdin",
    "terminal_stop",
    "terminal_resize",
    "terminal_read",
    "terminal_list",
    "desktop_run_diagnostics",
    "desktop_git_status",
    "desktop_git_diff",
  ].includes(tool.name);

const isBrowserTool = (tool: ToolEventRecord) =>
  tool.name.startsWith("browser_");

const isComputerTool = (tool: ToolEventRecord) =>
  tool.name.startsWith("computer_");

const isImageTool = (tool: ToolEventRecord) =>
  ["generate_image", "edit_image", "list_generated_images", "save_generated_image"].includes(tool.name);

const isQuestionTool = (tool: ToolEventRecord) =>
  tool.name === "request_user_input";

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
  if (tool.name === "web_search") {
    const query = typeof tool.args.query === "string" ? tool.args.query.trim() : "";
    if (tool.status === "done") return query ? `Searched web for ${query}` : "Searched web";
    return query ? `Searching web for ${query}` : "Searching web";
  }
  if (tool.name === "request_user_input") {
    return tool.status === "done" ? "Answered questions" : cleanTitle(tool.title);
  }
  if (isSubagentTool(tool)) {
    const label = subagentLabelFromTool(tool);
    if (tool.name === "spawn_agent") return tool.status === "done" ? `Spawned ${label}` : `Spawning ${label}`;
    if (tool.name === "send_message") return `Sent input to ${label}`;
    if (tool.name === "assign_task") return tool.status === "done" ? `Assigned ${label}` : `Assigning ${label}`;
    if (tool.name === "wait_agent") return tool.status === "done" ? "Finished waiting" : "Waiting for agents";
    if (tool.name === "list_agents") return "Listed agents";
    if (tool.name === "close_agent") return `Closed ${label}`;
  }
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

const hasTerminalOutput = (tool: ToolEventRecord, output: string) =>
  terminalOutputSections(tool, output).some((section) => hasUsefulOutput(section.value));

const terminalOutputSections = (tool: ToolEventRecord, fallbackOutput: string): Array<{ label: string; value: string }> => {
  const data = objectValue(tool.result?.data);
  const stdout = stringValue(data.stdout);
  const stderr = stringValue(data.stderr);
  const resultOutput = stringValue(tool.result?.output);
  const resultError = stringValue(tool.result?.error);
  const session = objectValue(data.session);
  const sessionOutput = stringValue(session.outputPreview) || stringValue(session.output);
  const liveOutput = stringValue(fallbackOutput);
  const sections: Array<{ label: string; value: string }> = [];
  const streamsMerged = data.streamsMerged === true || data.streams_merged === true;

  if (stdout) sections.push({ label: streamsMerged ? "Terminal output" : "Stdout", value: stdout });
  if (stderr) sections.push({ label: "Stderr", value: stderr });
  if (!stdout && !stderr && sessionOutput) sections.push({ label: "Terminal output", value: sessionOutput });

  const primary = stdout || stderr || sessionOutput;
  if (!primary && resultOutput) sections.push({ label: "Output", value: resultOutput });
  if (resultError && resultError !== resultOutput) sections.push({ label: "Error", value: resultError });

  if (sections.length === 0 && liveOutput) {
    sections.push({ label: tool.status === "running" || tool.status === "preparing" ? "Live output" : "Output", value: liveOutput });
  }

  return sections.length > 0 ? sections : [{ label: "Output", value: "" }];
};

const browserDetails = (tool: ToolEventRecord): Array<{ label: string; value: string }> => {
  const data = tool.result?.data || {};
  const output = displayOutput(tool).trim();
  const details: Array<{ label: string; value: string }> = [];
  const url = stringValue(data.url) || stringValue((data.after as Record<string, unknown> | undefined)?.url);
  const title = stringValue(data.title) || stringValue((data.after as Record<string, unknown> | undefined)?.title);
  if (url || title) details.push({ label: "Page", value: [url, title].filter(Boolean).join("\n") });
  if (output) details.push({ label: tool.result?.success === false ? "Error" : "Output", value: compactBrowserText(output) });
  const finding = stringValue(data.finding);
  if (finding && finding !== output) details.push({ label: "Finding", value: compactBrowserText(finding) });
  const snapshot = stringValue(data.snapshot);
  if (snapshot) details.push({ label: "Snapshot", value: compactBrowserText(snapshot, 3200) });
  const visibleText = stringValue(data.visibleText) || stringValue(data.text);
  if (visibleText) details.push({ label: "Visible text", value: compactBrowserText(visibleText, 3200) });
  const results = arraySummary(data.results, (item) => {
    const entry = objectValue(item);
    return [stringValue(entry.text), stringValue(entry.href)].filter(Boolean).join(" — ");
  });
  if (results) details.push({ label: "Results", value: results });
  const links = arraySummary(data.links, (item) => {
    const entry = objectValue(item);
    return [stringValue(entry.text), stringValue(entry.href)].filter(Boolean).join(" — ");
  });
  if (links) details.push({ label: "Links", value: links });
  const tables = arraySummary(data.tables, (item) => {
    const table = objectValue(item);
    const columns = Array.isArray(table.columns) ? table.columns.map(String).join(" | ") : "";
    const rows = Array.isArray(table.rows) ? `${table.rows.length} row${table.rows.length === 1 ? "" : "s"}` : "";
    return [stringValue(table.caption), columns, rows].filter(Boolean).join("\n");
  });
  if (tables) details.push({ label: "Tables", value: tables });
  const forms = arraySummary(data.forms, (item) => {
    const form = objectValue(item);
    const controls = Array.isArray(form.controls) ? `${form.controls.length} control${form.controls.length === 1 ? "" : "s"}` : "";
    return [stringValue(form.method).toUpperCase(), stringValue(form.action), controls].filter(Boolean).join(" ");
  });
  if (forms) details.push({ label: "Forms", value: forms });
  if (data.metadata && typeof data.metadata === "object") {
    details.push({ label: "Metadata", value: compactBrowserText(JSON.stringify(data.metadata, null, 2), 2400) });
  }
  const consoleEntries = arraySummary(data.console, (item) => {
    const entry = objectValue(item);
    return [stringValue(entry.level), stringValue(entry.message)].filter(Boolean).join(": ");
  });
  if (consoleEntries) details.push({ label: "Console", value: consoleEntries });
  const requests = arraySummary(data.requests || data.failedRequests || data.failed_requests, (item) => {
    const entry = objectValue(item);
    return [stringValue(entry.method), stringValue(entry.url), stringValue(entry.status) || stringValue(entry.errorText)].filter(Boolean).join(" ");
  });
  if (requests) details.push({ label: "Network", value: requests });
  const screenshotPath = stringValue(data.screenshotPath) || stringValue(data.screenshot_path);
  if (screenshotPath) details.push({ label: "Screenshot", value: screenshotPath });
  if (details.length === 0) details.push({ label: "Details", value: "(no browser details)" });
  return dedupeBrowserDetails(details).slice(0, 8);
};

const computerDetails = (tool: ToolEventRecord): Array<{ label: string; value: string }> => {
  const data = objectValue(tool.result?.data);
  const result = objectValue(data.result);
  const trace = objectValue(data.trace);
  const traceResult = objectValue(trace.result);
  const output = displayOutput(tool).trim();
  const details: Array<{ label: string; value: string }> = [];
  const backend = stringValue(data.backend) || stringValue(result.backend) || stringValue(trace.backend);
  if (backend) details.push({ label: "Backend", value: backend });
  const window = firstRecord(
    result.window,
    data.window,
    objectValue(trace.after).window,
    objectValue(trace.before).window,
  );
  if (window) {
    details.push({
      label: "Window",
      value: [
        stringValue(window.title),
        stringValue(window.processName) || stringValue(window.process),
        stringValue(window.id) || stringValue(window.handle),
      ].filter(Boolean).join("\n"),
    });
  }
  const diagnosis = firstRecord(
    data.diagnosis,
    result.diagnosis,
    trace.diagnosis,
    traceResult.diagnosis,
  );
  if (diagnosis) {
    details.push({ label: "Diagnosis", value: compactBrowserText(formatComputerRecord(diagnosis), 2600) });
  }
  const finding = stringValue(data.finding) || stringValue(result.finding) || stringValue(trace.finding);
  if (finding) details.push({ label: "Finding", value: compactBrowserText(finding, 1800) });
  const action = stringValue(data.action) || stringValue(result.action) || stringValue(trace.action);
  const success = booleanLabel(data.success ?? result.success ?? trace.success ?? tool.result?.success);
  if (action || success) details.push({ label: "Action", value: [action, success].filter(Boolean).join("\n") });
  if (output) details.push({ label: tool.result?.success === false ? "Error" : "Output", value: compactBrowserText(output, 2600) });
  const windows = arraySummary(data.windows || result.windows, (item) => {
    const entry = objectValue(item);
    return [
      stringValue(entry.title) || "(untitled)",
      stringValue(entry.processName) || stringValue(entry.process),
      stringValue(entry.capability),
    ].filter(Boolean).join(" — ");
  });
  if (windows) details.push({ label: "Windows", value: windows });
  const apps = arraySummary(data.apps || result.apps, (item) => {
    const entry = objectValue(item);
    return [
      stringValue(entry.name),
      stringValue(entry.source) && `[${stringValue(entry.source)}]`,
      stringValue(entry.executablePath) || stringValue(entry.shortcutPath) || stringValue(entry.installLocation),
      typeof entry.score === "number" ? `score ${entry.score}` : "",
    ].filter(Boolean).join(" ");
  });
  if (apps) details.push({ label: "Apps", value: apps });
  const artifacts = arraySummary([
    ...stringArray(data.artifactPaths),
    ...stringArray(result.artifactPaths),
    ...stringArray(trace.artifactPaths),
    stringValue(data.artifactPath),
    stringValue(result.artifactPath),
    stringValue(trace.artifactPath),
  ].filter(Boolean), (item) => String(item));
  if (artifacts) details.push({ label: "Artifacts", value: artifacts });
  if (details.length === 0) details.push({ label: "Details", value: "(no computer-use details)" });
  return dedupeBrowserDetails(details).slice(0, 8);
};

const firstRecord = (...values: unknown[]): Record<string, unknown> | null => {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return null;
};

const formatComputerRecord = (value: Record<string, unknown>) => {
  const lines = [
    stringValue(value.classification) && `classification: ${stringValue(value.classification)}`,
    stringValue(value.summary) && `summary: ${stringValue(value.summary)}`,
    stringValue(value.reason) && `reason: ${stringValue(value.reason)}`,
    stringValue(value.capability) && `capability: ${stringValue(value.capability)}`,
    stringValue(value.nextStep) && `next: ${stringValue(value.nextStep)}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(value, null, 2);
};

const booleanLabel = (value: unknown) =>
  typeof value === "boolean" ? `success: ${value ? "yes" : "no"}` : "";

const stringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

const dedupeBrowserDetails = (details: Array<{ label: string; value: string }>) => {
  const output = details.find((detail) => detail.label === "Output");
  if (!output) return details;
  const outputKey = normalizeBrowserDetailText(output.value);
  return details.filter((detail) =>
    detail.label === "Output" ||
    !sameBrowserDetail(outputKey, normalizeBrowserDetailText(detail.value))
  );
};

const sameBrowserDetail = (first: string, second: string) =>
  Boolean(first && second && (first === second || first.includes(second) || second.includes(first)));

const normalizeBrowserDetailText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const arraySummary = (value: unknown, format: (item: unknown) => string) => {
  if (!Array.isArray(value) || value.length === 0) return "";
  const lines = value.map(format).filter(Boolean).slice(0, 12);
  const omitted = Math.max(0, value.length - lines.length);
  return `${lines.join("\n")}${omitted > 0 ? `\n... ${omitted} more` : ""}`;
};

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const generatedImagesFromTool = (tool: ToolEventRecord) => {
  const data = objectValue(tool.result?.data);
  const images = Array.isArray(data.images) ? data.images : data.record ? [data.record] : [];
  return images
    .map((item) => objectValue(item))
    .filter((item) => stringValue(item.previewUrl) || stringValue(item.path))
    .map((item) => ({
      id: stringValue(item.id),
      provider: stringValue(item.provider),
      model: stringValue(item.model),
      prompt: stringValue(item.prompt),
      path: stringValue(item.path),
      workspacePath: stringValue(item.workspacePath),
      previewUrl: stringValue(item.previewUrl),
      mimeType: stringValue(item.mimeType),
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : undefined,
    }));
};

const compactBrowserText = (value: string, max = 1800) => {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
};

const normalizeQuestionArgs = (value: unknown): Array<{ id: string; header: string; question: string }> => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      id: String(record.id || ""),
      header: String(record.header || ""),
      question: String(record.question || ""),
    }];
  });
};

const normalizeAnswerResult = (data: unknown, output: string): Record<string, string[]> => {
  const fromData = answersFromObject(data);
  if (Object.keys(fromData).length > 0) return fromData;
  try {
    const parsed = JSON.parse(output) as unknown;
    return answersFromObject(parsed);
  } catch {
    return {};
  }
};

const answersFromObject = (value: unknown): Record<string, string[]> => {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const answers = root.answers && typeof root.answers === "object" ? root.answers as Record<string, unknown> : root;
  return Object.fromEntries(Object.entries(answers).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const answerValues = (raw as Record<string, unknown>).answers;
    if (!Array.isArray(answerValues)) return [];
    return [[id, answerValues.map((item) => String(item)).filter(Boolean)]];
  }));
};

const isLiveOutput = (tool: ToolEventRecord) =>
  tool.status === "running" || tool.status === "preparing";

const isSubagentTool = (tool: ToolEventRecord) =>
  ["spawn_agent", "send_message", "assign_task", "wait_agent", "list_agents", "close_agent"].includes(tool.name);

const subagentLabelFromTool = (tool: ToolEventRecord) => {
  const data = tool.result?.data || {};
  const nickname = typeof data.nickname === "string" ? data.nickname : "";
  const role = typeof data.role === "string" ? data.role : "";
  const taskName = typeof data.taskName === "string" ? data.taskName : String(tool.args.taskName || tool.args.task_name || tool.args.target || "agent");
  const base = nickname || taskName;
  return role ? `${base} [${role}]` : base;
};

const subagentRecordFromTool = (tool: ToolEventRecord): SubagentRecord | null => {
  const data = tool.result?.data || {};
  const threadId = stringValue(data.threadId);
  const taskName = stringValue(data.taskName) || stringValue(tool.args.taskName) || stringValue(tool.args.task_name) || stringValue(tool.args.target) || "agent";
  const agentPath = stringValue(data.agentPath) || stringValue(data.agent_path) || stringValue(data.task_name) || taskName;
  return {
    id: stringValue(data.id) || threadId || agentPath,
    parentThreadId: tool.threadId,
    parentMessageId: tool.messageId,
    threadId: threadId || "",
    workspaceId: null,
    taskName,
    agentPath,
    agentRole: stringValue(data.role) || undefined,
    agentNickname: stringValue(data.nickname) || undefined,
    prompt: stringValue(tool.args.message) || stringValue(data.prompt) || "",
    model: undefined,
    reasoningEffort: undefined,
    status: normalizeSubagentStatus(data.status),
    finalMessage: stringValue(data.finalMessage) || undefined,
    lastPreview: stringValue(data.lastPreview) || displayOutput(tool) || undefined,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
};

const subagentsForTool = (tool: ToolEventRecord, subagents: SubagentRecord[]) => {
  const data = tool.result?.data || {};
  const listed = Array.isArray(data.agents)
    ? data.agents.flatMap((item) => subagentRecordFromRaw(item, tool) || [])
    : [];
  if (listed.length > 0) return listed;
  const ids = new Set([
    stringValue(data.id),
    stringValue(data.threadId),
    stringValue(data.agentPath),
    stringValue(data.agent_path),
    stringValue(data.taskName),
    stringValue(data.task_name),
    stringValue(tool.args.taskName),
    stringValue(tool.args.task_name),
    stringValue(tool.args.target),
  ].filter(Boolean));
  return subagents.filter((agent) =>
    ids.has(agent.id) ||
    ids.has(agent.threadId) ||
    ids.has(agent.taskName) ||
    ids.has(agent.agentPath) ||
    Boolean(agent.agentNickname && ids.has(agent.agentNickname))
  );
};

const subagentRecordFromRaw = (value: unknown, tool: ToolEventRecord): SubagentRecord | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const taskName = stringValue(data.taskName) || stringValue(data.task_name) || "agent";
  const agentPath = stringValue(data.agentPath) || stringValue(data.agent_path) || stringValue(data.task_name) || taskName;
  return {
    id: stringValue(data.id) || stringValue(data.threadId) || agentPath,
    parentThreadId: tool.threadId,
    parentMessageId: tool.messageId,
    threadId: stringValue(data.threadId) || "",
    workspaceId: null,
    taskName,
    agentPath,
    agentRole: stringValue(data.role) || undefined,
    agentNickname: stringValue(data.nickname) || undefined,
    prompt: stringValue(data.prompt) || "",
    model: undefined,
    reasoningEffort: undefined,
    status: normalizeSubagentStatus(data.status),
    finalMessage: stringValue(data.finalMessage) || undefined,
    lastPreview: stringValue(data.lastPreview) || undefined,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
};

const normalizeSubagentStatus = (value: unknown): SubagentRecord["status"] => {
  const status = stringValue(value);
  return ["pending", "running", "waiting", "completed", "failed", "stopped", "closed"].includes(status)
    ? status as SubagentRecord["status"]
    : "pending";
};

const formatSubagentName = (agent: SubagentRecord) => {
  const base = agent.agentNickname || agent.taskName || "agent";
  return agent.agentRole ? `${base} [${agent.agentRole}]` : base;
};

const compactSubagentPreview = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length <= 1600 ? trimmed : `${trimmed.slice(0, 1599)}...`;
};

const hasMeaningfulSubagentHeading = (agent: SubagentRecord) =>
  Boolean(agent.agentNickname || agent.agentRole || agent.taskName !== "agent");

const hasMeaningfulSubagentPath = (agent: SubagentRecord) =>
  Boolean(agent.agentPath && agent.agentPath !== "agent" && agent.agentPath !== agent.taskName);

const hasMeaningfulSubagentPrompt = (agent: SubagentRecord) =>
  Boolean(agent.prompt.trim() && agent.prompt.trim() !== "agent");

const usefulSubagentPreview = (agent: SubagentRecord, tool: ToolEventRecord) => {
  const preview = (agent.finalMessage || agent.lastPreview || "").trim();
  const prompt = agent.prompt.trim();
  const output = displayOutput(tool).trim();
  if (!preview || preview === prompt || preview === output) return "";
  if (/^(spawned|assigned task to|sent message to|queued task for|closed)\b/i.test(preview)) return "";
  return preview;
};

const stringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

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

function ToolActivity({ tool, active }: { tool: ToolEventRecord; active: boolean }) {
  const items = toolActivityItems(tool);
  if (items.length === 0) return null;
  return (
    <div className="tool-activity-list">
      {items.map((item, index) => (
        <div className="tool-activity-item" key={`${item.path}-${index}`}>
          <span className="tool-activity-verb">{item.verb}</span>
          <span className={clsx("tool-activity-path", active && "active-text-shimmer")}>{item.path}</span>
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

  if (tool.name === "desktop_edit_file") {
    const path = String(tool.args.path || tool.result?.data?.path || "").trim();
    return path ? [{ verb: tool.status === "done" ? "Edited" : "Editing", path, additions: 0, deletions: 0 }] : [];
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
    ["desktop_write_file", "desktop_edit_file", "desktop_apply_patch", "desktop_delete_path", "desktop_rename_path"].includes(tool.name)
  ).length;
  const commands = tools.filter((tool) =>
    tool.status === "done" &&
    ["exec_command", "write_stdin", "terminal_read", "terminal_resize", "terminal_stop", "terminal_list", "desktop_run_diagnostics", "desktop_git_status", "desktop_git_diff"].includes(tool.name)
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

const latestLiveToolId = (tools: ToolEventRecord[]) =>
  tools
    .filter(isLiveOutput)
    .sort((a, b) =>
      (b.streamOrder ?? 0) - (a.streamOrder ?? 0) ||
      (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0) ||
      (b.startedAt || 0) - (a.startedAt || 0)
    )[0]?.id || null;

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
