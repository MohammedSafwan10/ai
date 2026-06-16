import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, Copy, Download, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import clsx from "clsx";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AssistantTextPartRecord,
  AssistantTextPhase,
  AssistantThoughtPartRecord,
  ApprovalDecisionScope,
  ChatMessageRecord,
  DesktopAttachmentRecord,
  SubagentRecord,
  ToolEventRecord,
  TurnUndoRecord,
} from "../../shared/types";
import { ToolTimeline } from "./ToolTimeline";
import { TurnReviewCard } from "./TurnReviewCard";

const USER_MESSAGE_PREVIEW_CHARS = 900;
const USER_MESSAGE_COLLAPSE_CHARS = 1200;
const USER_MESSAGE_COLLAPSE_LINES = 16;
const PROPOSED_PLAN_COLLAPSE_CHARS = 1800;
const PROPOSED_PLAN_COLLAPSE_LINES = 26;
const STREAM_MARKDOWN_THROTTLE_MS = 90;
const LARGE_ASSISTANT_TEXT_CHARS = 32_000;
const LARGE_ASSISTANT_PREVIEW_CHARS = 8_000;
const markdownComponents = {
  a: MarkdownExternalLink,
  table: MarkdownTable,
};

interface ChatMessageProps {
  message: ChatMessageRecord;
  tools: ToolEventRecord[];
  subagents: SubagentRecord[];
  activeRunStatus: string | null;
  onApprove: (callId: string, approved: boolean, scope?: ApprovalDecisionScope) => void;
  onApproveAll: (callIds: string[]) => void;
  onOpenReview: (messageId: string) => void;
  turnUndo: TurnUndoRecord | null;
  onPrepareTurnUndo: (messageId: string) => Promise<TurnUndoRecord | null>;
  onUndoTurnChanges: (messageId: string) => Promise<TurnUndoRecord | null>;
  showPlanActions?: boolean;
  onImplementPlan?: (plan: string) => void;
  onSuggestPlanChanges?: (plan: string) => void;
}

function ChatMessageComponent({
  message,
  tools,
  subagents,
  activeRunStatus,
  onApprove,
  onApproveAll,
  onOpenReview,
  turnUndo,
  onPrepareTurnUndo,
  onUndoTurnChanges,
  showPlanActions = false,
  onImplementPlan,
  onSuggestPlanChanges,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasAttachments = (message.attachments || []).length > 0;
  const runActive = !isUser && (isActiveTurnStatus(activeRunStatus) || isActiveTurnStatus(message.status));
  const renderParts = useMemo(
    () => isUser ? [] : buildAssistantRenderParts(message, tools, runActive),
    [isUser, message, runActive, tools],
  );
  const { activityParts, finalTextParts } = useMemo(
    () => splitAssistantActivityAndFinalText(renderParts),
    [renderParts],
  );
  const hasAssistantActivity = renderParts.some((part) => part.type !== "text");
  const activityNeedsAttention = renderParts.some((part) =>
    part.type === "tools" && part.tools.some((tool) => tool.status === "awaiting_approval")
  );
  const [activityOpen, setActivityOpen] = useState(runActive || activityNeedsAttention);
  useEffect(() => {
    if (runActive || activityNeedsAttention) {
      setActivityOpen(true);
      return;
    }
    setActivityOpen(false);
  }, [activityNeedsAttention, runActive]);
  useEffect(() => {
    if (finalTextParts.length > 0 && !activityNeedsAttention) {
      setActivityOpen(false);
    }
  }, [activityNeedsAttention, finalTextParts.length]);
  const [copied, setCopied] = useState(false);
  const showCopyFeedback = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const copyMessage = async () => {
    await writeClipboard(message.content || message.thought || "");
    showCopyFeedback();
  };
  const showMessageActions = (message.content || hasAttachments) && (isUser || !runActive);
  return (
    <article className={clsx("chat-message", isUser && "user", runActive && "is-streaming")}>
      <div className="message-stack">
        <div className={clsx("message-bubble", isUser && "markdown-body")}>
          {isUser ? (
            <>
              {hasAttachments && <AttachmentGrid attachments={message.attachments || []} />}
              {message.content && <UserMessageContent content={message.content} />}
            </>
          ) : (
            <>
              <AssistantRunMeta
                message={message}
                active={runActive}
                hasActivity={hasAssistantActivity}
                activityOpen={activityOpen}
                onToggleActivity={() => setActivityOpen((value) => !value)}
              />
              <div className="assistant-flow">
                {renderParts.length > 0 ? (
                  <>
                    {activityOpen && activityParts.length > 0 && (
                      <div className="assistant-activity-block">
                        {activityParts.map((part) => {
                          if (part.type === "thought") {
                            return <ThoughtPanel key={part.key} thought={part.thought} active={part.active} />;
                          }
                          if (part.type === "tools") {
                            return (
                              <ToolTimeline
                                key={part.key}
                                tools={part.tools}
                                subagents={subagents}
                                messageStatus={message.status}
                                defaultOpen={part.defaultOpen}
                                onApprove={onApprove}
                                onApproveAll={onApproveAll}
                              />
                            );
                          }
                          return (
                            <div
                              key={part.key}
                              className={clsx("assistant-activity-text", runActive && message.status !== "failed" && "is-streaming", "markdown-body")}
                            >
                              <AssistantTextPart
                                text={part.text}
                                active={runActive && message.status !== "failed"}
                                showPlanActions={showPlanActions}
                                onImplementPlan={onImplementPlan}
                                onSuggestPlanChanges={onSuggestPlanChanges}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {finalTextParts.map((part) => (
                      <div key={part.key} className={clsx("assistant-flow-text", message.status === "failed" && "is-error", "markdown-body")}>
                        <AssistantTextPart
                          text={part.text}
                          active={runActive && message.status !== "failed"}
                          showPlanActions={showPlanActions}
                          onImplementPlan={onImplementPlan}
                          onSuggestPlanChanges={onSuggestPlanChanges}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <ThoughtPanel thought="" active={runActive} />
                )}
              </div>
              {!runActive && (
                <TurnReviewCard
                  tools={tools}
                  undo={turnUndo}
                  onOpen={() => onOpenReview(message.id)}
                  onPrepareUndo={() => onPrepareTurnUndo(message.id)}
                  onUndo={() => onUndoTurnChanges(message.id)}
                />
              )}
            </>
          )}
        </div>
        {showMessageActions && (
          <div className="message-actions" aria-label="Message actions">
            <button type="button" title="Copy" className={copied ? "success" : undefined} onClick={copyMessage}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export const ChatMessage = memo(ChatMessageComponent, (previous, next) =>
  previous.message === next.message &&
  previous.tools === next.tools &&
  previous.subagents === next.subagents &&
  previous.activeRunStatus === next.activeRunStatus &&
  previous.turnUndo === next.turnUndo &&
  previous.showPlanActions === next.showPlanActions &&
  previous.onImplementPlan === next.onImplementPlan &&
  previous.onSuggestPlanChanges === next.onSuggestPlanChanges
);

type AssistantRenderPart =
  | { type: "thought"; key: string; thought: string; active: boolean }
  | { type: "text"; key: string; text: string; phase: AssistantTextPhase; startOffset: number; endOffset: number }
  | { type: "tools"; key: string; tools: ToolEventRecord[]; defaultOpen: boolean };

type AssistantTextRenderPart = Extract<AssistantRenderPart, { type: "text" }>;

type AssistantTimelineItem =
  | {
      type: "thought";
      key: string;
      offset: number;
      createdAt: number;
      streamOrder?: number;
      thought: string;
      active: boolean;
    }
  | {
      type: "tool";
      key: string;
      offset: number;
      createdAt: number;
      streamOrder?: number;
      tool: ToolEventRecord;
    };

function buildAssistantRenderParts(
  message: ChatMessageRecord,
  tools: ToolEventRecord[],
  runActive: boolean,
): AssistantRenderPart[] {
  const parts: AssistantRenderPart[] = [];
  const content = message.content || "";
  const timelineItems = [
    ...buildThoughtTimelineItems(message, tools, runActive),
    ...tools.map((tool) => ({
      type: "tool" as const,
      key: `tool-${tool.id}`,
      offset: tool.textOffset ?? content.length,
      createdAt: tool.createdAt,
      streamOrder: tool.streamOrder,
      tool,
    })),
  ].sort(compareTimelineItems);

  let cursor = 0;
  let pendingTools: ToolEventRecord[] = [];
  const flushPendingTools = (keySuffix: string) => {
    if (pendingTools.length === 0) return;
    parts.push({
      type: "tools",
      key: `tools-${keySuffix}-${pendingTools.map((tool) => tool.id).join("-")}`,
      tools: pendingTools,
      defaultOpen: false,
    });
    pendingTools = [];
  };

  timelineItems.forEach((item, index) => {
    const offset = clampOffset(item.offset, content.length);
    if (content.slice(cursor, offset).trim()) {
      flushPendingTools(`before-text-${index}`);
      pushTextParts(parts, message, cursor, offset, `text-${index}`);
    }
    if (item.type === "thought") {
      flushPendingTools(`before-thought-${index}`);
      parts.push({ type: "thought", key: item.key, thought: item.thought, active: item.active });
    } else {
      pendingTools.push(item.tool);
    }
    cursor = Math.max(cursor, offset);
  });
  flushPendingTools("tail");

  const tail = content.slice(cursor);
  if (tail.trim()) pushTextParts(parts, message, cursor, content.length, "text-tail");
  return markDefaultOpenToolPart(parts, runActive);
}

function pushTextParts(
  parts: AssistantRenderPart[],
  message: ChatMessageRecord,
  startOffset: number,
  endOffset: number,
  keyPrefix: string,
) {
  splitTextByPhase(message, startOffset, endOffset).forEach((part, index) => {
    if (!part.text.trim()) return;
    parts.push({
      type: "text",
      key: `${keyPrefix}-${part.startOffset}-${index}`,
      text: part.text,
      phase: part.phase,
      startOffset: part.startOffset,
      endOffset: part.endOffset,
    });
  });
}

function markDefaultOpenToolPart(parts: AssistantRenderPart[], runActive: boolean): AssistantRenderPart[] {
  const latestLiveToolIndex = [...parts].reverse().findIndex((part) =>
    part.type === "tools" && part.tools.some((tool) => tool.status === "running" || tool.status === "preparing")
  );
  const liveIndex = latestLiveToolIndex >= 0 ? parts.length - 1 - latestLiveToolIndex : -1;
  return parts.map((part, index) => {
    if (part.type !== "tools") return part;
    const needsAttention = part.tools.some((tool) => tool.status === "awaiting_approval");
    return {
      ...part,
      defaultOpen: needsAttention || (runActive && index === liveIndex),
    };
  });
}

function buildThoughtTimelineItems(
  message: ChatMessageRecord,
  tools: ToolEventRecord[],
  runActive: boolean,
): AssistantTimelineItem[] {
  const thought = message.thought || "";
  const content = message.content || "";
  const storedParts = normalizeThoughtParts(message.thoughtParts || []);
  const hasLiveTool = tools.some((tool) => tool.status === "running" || tool.status === "preparing");
  const hasStartedVisibleText = content.trim().length > 0;
  const thoughtActive = runActive && !hasLiveTool && !hasStartedVisibleText;
  if (storedParts.length > 0) {
    return storedParts.flatMap((part, index) => {
      const next = storedParts[index + 1];
      const thoughtText = thought.slice(part.thoughtOffset, next?.thoughtOffset ?? thought.length);
      const isLast = index === storedParts.length - 1;
      if (!thoughtText.trim() && !(thoughtActive && isLast)) return [];
      return [{
        type: "thought" as const,
        key: `thought-${part.id}`,
        offset: part.textOffset,
        createdAt: part.createdAt,
        streamOrder: part.streamOrder,
        thought: thoughtText,
        active: thoughtActive && isLast,
      }];
    });
  }

  if (thought.trim() || (thoughtActive && !message.content.trim() && tools.length === 0)) {
    return [{
      type: "thought",
      key: `thought-${message.id}`,
      offset: 0,
      createdAt: message.createdAt,
      thought,
      active: thoughtActive,
    }];
  }
  return [];
}

function normalizeThoughtParts(parts: AssistantThoughtPartRecord[]) {
  return [...parts]
    .filter((part) => Number.isFinite(part.textOffset) && Number.isFinite(part.thoughtOffset))
    .sort((a, b) => a.thoughtOffset - b.thoughtOffset || a.createdAt - b.createdAt);
}

function splitTextByPhase(message: ChatMessageRecord, startOffset: number, endOffset: number) {
  const content = message.content || "";
  const storedParts = normalizeTextParts(message.textParts || [], content.length);
  if (storedParts.length === 0) {
    return [{
      text: content.slice(startOffset, endOffset),
      phase: "final_answer" as const,
      startOffset,
      endOffset,
    }];
  }

  const segments: Array<{
    text: string;
    phase: AssistantTextPhase;
    startOffset: number;
    endOffset: number;
  }> = [];
  storedParts.forEach((part) => {
    const segmentStart = Math.max(startOffset, part.startOffset);
    const segmentEnd = Math.min(endOffset, part.endOffset);
    if (segmentEnd <= segmentStart) return;
    segments.push({
      text: content.slice(segmentStart, segmentEnd),
      phase: part.phase,
      startOffset: segmentStart,
      endOffset: segmentEnd,
    });
  });
  return segments;
}

export function normalizeTextParts(parts: AssistantTextPartRecord[], contentLength: number) {
  return mergeAdjacentTextParts(
    [...parts]
      .filter((part) =>
        (part.phase === "commentary" || part.phase === "final_answer") &&
        Number.isFinite(part.startOffset) &&
        Number.isFinite(part.endOffset)
      )
      .map((part) => ({
        ...part,
        startOffset: Math.max(0, Math.min(contentLength, part.startOffset)),
        endOffset: Math.max(0, Math.min(contentLength, part.endOffset)),
      }))
      .filter((part) => part.endOffset > part.startOffset)
      .sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt),
  );
}

function mergeAdjacentTextParts(parts: AssistantTextPartRecord[]) {
  const merged: AssistantTextPartRecord[] = [];
  parts.forEach((part) => {
    const last = merged[merged.length - 1];
    if (last && last.phase === part.phase && last.endOffset >= part.startOffset) {
      last.endOffset = Math.max(last.endOffset, part.endOffset);
      last.updatedAt = Math.max(last.updatedAt, part.updatedAt);
      return;
    }
    merged.push({ ...part });
  });
  return merged;
}

export function splitTextByPhaseForTest(message: ChatMessageRecord, startOffset: number, endOffset: number) {
  return splitTextByPhase(message, startOffset, endOffset);
}

function compareTimelineItems(a: AssistantTimelineItem, b: AssistantTimelineItem) {
  const timeDiff = a.createdAt - b.createdAt;
  if (timeDiff !== 0) return timeDiff;
  const orderDiff = (a.streamOrder ?? 0) - (b.streamOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return timelineRank(a) - timelineRank(b);
}

function timelineRank(item: AssistantTimelineItem) {
  return item.type === "thought" ? 0 : 1;
}

function clampOffset(offset: number, max: number) {
  return Math.max(0, Math.min(max, offset));
}

function isActiveTurnStatus(status: string | null | undefined) {
  return (
    status === "sampling" ||
    status === "running" ||
    status === "executing_tool" ||
    status === "waiting_tool" ||
    status === "awaiting_approval" ||
    status === "draining" ||
    status === "completing"
  );
}

function AssistantRunMeta({
  message,
  active,
  hasActivity,
  activityOpen,
  onToggleActivity,
}: {
  message: ChatMessageRecord;
  active: boolean;
  hasActivity: boolean;
  activityOpen: boolean;
  onToggleActivity: () => void;
}) {
  const elapsed = useElapsedTime(message.createdAt, active ? undefined : message.updatedAt);
  return (
    <div className="assistant-run-meta">
      {hasActivity ? (
        <button
          type="button"
          className="assistant-run-toggle"
          aria-expanded={activityOpen}
          onClick={onToggleActivity}
        >
          <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
          <ChevronDown className={clsx("assistant-run-chevron", !activityOpen && "closed")} size={14} />
        </button>
      ) : (
        <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
      )}
    </div>
  );
}

function AssistantTextPart({
  text,
  active,
  showPlanActions,
  onImplementPlan,
  onSuggestPlanChanges,
}: {
  text: string;
  active: boolean;
  showPlanActions: boolean;
  onImplementPlan?: (plan: string) => void;
  onSuggestPlanChanges?: (plan: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const committedMarkdown = useStreamingCommittedMarkdown(text, active);
  if (!active) {
    const shouldDefer = text.length > LARGE_ASSISTANT_TEXT_CHARS && !expanded;
    if (shouldDefer) {
      return (
        <div className="large-message-preview">
          <AssistantMarkdownWithPlan
            text={`${text.slice(0, LARGE_ASSISTANT_PREVIEW_CHARS)}\n\n...`}
            showPlanActions={false}
          />
          <button type="button" onClick={() => setExpanded(true)}>
            Show full response
          </button>
        </div>
      );
    }
    return (
      <AssistantMarkdownWithPlan
        text={text}
        showPlanActions={showPlanActions}
        onImplementPlan={onImplementPlan}
        onSuggestPlanChanges={onSuggestPlanChanges}
      />
    );
  }

  const tail = text.slice(committedMarkdown.length);
  return (
    <>
      {committedMarkdown && (
        <AssistantMarkdownWithPlan
          text={committedMarkdown}
          showPlanActions={showPlanActions}
          onImplementPlan={onImplementPlan}
          onSuggestPlanChanges={onSuggestPlanChanges}
        />
      )}
      {tail && <div className="streaming-text">{tail}</div>}
    </>
  );
}

function AssistantMarkdownWithPlan({
  text,
  showPlanActions,
  onImplementPlan,
  onSuggestPlanChanges,
}: {
  text: string;
  showPlanActions: boolean;
  onImplementPlan?: (plan: string) => void;
  onSuggestPlanChanges?: (plan: string) => void;
}) {
  const parts = splitProposedPlan(text);
  return (
    <>
      {parts.map((part, index) => part.type === "plan" ? (
        <ProposedPlanCard
          key={`plan-${index}`}
          text={part.text}
          showActions={showPlanActions}
          onImplementPlan={onImplementPlan}
          onSuggestPlanChanges={onSuggestPlanChanges}
        />
      ) : (
        part.text.trim() && (
          <ReactMarkdown key={`text-${index}`} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {part.text}
          </ReactMarkdown>
        )
      ))}
    </>
  );
}

function ProposedPlanCard({
  text,
  showActions,
  onImplementPlan,
  onSuggestPlanChanges,
}: {
  text: string;
  showActions: boolean;
  onImplementPlan?: (plan: string) => void;
  onSuggestPlanChanges?: (plan: string) => void;
}) {
  const [actionsHidden, setActionsHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lineCount = useMemo(() => text.split(/\r?\n/).length, [text]);
  const shouldCollapse = text.length > PROPOSED_PLAN_COLLAPSE_CHARS || lineCount > PROPOSED_PLAN_COLLAPSE_LINES;
  return (
    <section className={clsx("proposed-plan-card markdown-body", shouldCollapse && !expanded && "is-collapsed")}>
      <div className="proposed-plan-label">Proposed plan</div>
      <div className="proposed-plan-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
      </div>
      {shouldCollapse && (
        <button
          type="button"
          className="proposed-plan-expand"
          title={expanded ? "Collapse plan" : "Show full plan"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
      {showActions && !actionsHidden && (
        <div className="proposed-plan-actions" aria-label="Plan actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setActionsHidden(true);
              onImplementPlan?.(text);
            }}
          >
            Implement plan
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsHidden(true);
              onSuggestPlanChanges?.(text);
            }}
          >
            Suggest changes
          </button>
          <button type="button" onClick={() => setActionsHidden(true)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

function MarkdownExternalLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const externalHref = typeof href === "string" && isExternalHttpUrl(href) ? href : "";
  if (!externalHref) {
    return <span className="markdown-invalid-link">{children}</span>;
  }
  return (
    <a
      {...props}
      href={externalHref}
      rel="noreferrer"
      onClick={(event) => {
        event.preventDefault();
        void window.privoraDesktop.openExternalUrl(externalHref).catch((error) => {
          console.error("Could not open external URL", error);
        });
      }}
    >
      {children}
    </a>
  );
}

function MarkdownTable({
  children,
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="markdown-table-scroll" role="region" aria-label="Scrollable table" tabIndex={0}>
      <table>{children}</table>
    </div>
  );
}

const isExternalHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const splitProposedPlan = (text: string): Array<{ type: "text" | "plan"; text: string }> => {
  const open = "<proposed_plan>";
  const close = "</proposed_plan>";
  const start = text.indexOf(open);
  if (start === -1) return [{ type: "text", text }];
  const end = text.indexOf(close, start + open.length);
  if (end === -1) return [{ type: "text", text }];
  return [
    { type: "text" as const, text: text.slice(0, start) },
    { type: "plan" as const, text: text.slice(start + open.length, end).trim() },
    { type: "text" as const, text: text.slice(end + close.length) },
  ].filter((part) => part.text.length > 0);
};

function splitAssistantActivityAndFinalText(parts: AssistantRenderPart[]) {
  return {
    activityParts: parts.filter((part) => part.type !== "text" || part.phase === "commentary"),
    finalTextParts: parts.filter((part): part is AssistantTextRenderPart =>
      part.type === "text" && part.phase === "final_answer"
    ),
  };
}

function useStreamingCommittedMarkdown(text: string, active: boolean) {
  const [committed, setCommitted] = useState(() => active ? completeLinePrefix(text) : text);
  const committedRef = useRef(committed);
  const latestPrefixRef = useRef(committed);
  const lastFlushRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    committedRef.current = committed;
  }, [committed]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const flush = (value: string) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      latestPrefixRef.current = value;
      committedRef.current = value;
      lastFlushRef.current = Date.now();
      setCommitted(value);
    };

    if (!active) {
      flush(text);
      return;
    }

    const next = completeLinePrefix(text);
    latestPrefixRef.current = next;
    if (next === committedRef.current) return;

    const elapsed = Date.now() - lastFlushRef.current;
    if (elapsed >= STREAM_MARKDOWN_THROTTLE_MS || next.length < committedRef.current.length) {
      flush(next);
      return;
    }

    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      flush(latestPrefixRef.current);
    }, STREAM_MARKDOWN_THROTTLE_MS - elapsed);
  }, [active, text]);

  return committed;
}

const completeLinePrefix = (text: string) => {
  const end = text.lastIndexOf("\n");
  return end < 0 ? "" : text.slice(0, end + 1);
};

function useElapsedTime(startedAt: number, endedAt?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endedAt]);
  return formatDuration(Math.max(0, (endedAt ?? now) - startedAt));
}

const formatDuration = (durationMs: number) => {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
};

const writeClipboard = async (text: string) => {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

function UserMessageContent({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = useMemo(() => content.split(/\r?\n/).length, [content]);
  const shouldCollapse = content.length > USER_MESSAGE_COLLAPSE_CHARS || lineCount > USER_MESSAGE_COLLAPSE_LINES;
  const preview = useMemo(() => buildUserMessagePreview(content), [content]);

  if (!shouldCollapse) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>;
  }

  return (
    <div className={clsx("user-message-collapsible", open && "open")}>
      <div className="user-message-content">
        {open ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
        ) : (
          <pre className="user-message-preview">{preview}</pre>
        )}
      </div>
      <button
        type="button"
        className="user-message-toggle"
        title={open ? "Collapse prompt" : "Show full prompt"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </div>
  );
}

const buildUserMessagePreview = (content: string) => {
  if (content.length <= USER_MESSAGE_PREVIEW_CHARS) return content;
  const slice = content.slice(0, USER_MESSAGE_PREVIEW_CHARS);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  const trimmed = slice.slice(0, lastBreak > 500 ? lastBreak : USER_MESSAGE_PREVIEW_CHARS).trimEnd();
  return `${trimmed}\n\n...`;
};

function AttachmentGrid({ attachments }: { attachments: DesktopAttachmentRecord[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const selected = selectedIndex === null ? null : attachments[selectedIndex] || null;
  const selectedSrc = selected ? attachmentSrc(selected) : "";
  useEffect(() => {
    if (!selected) return;
    setZoom(1);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
      if (event.key === "ArrowLeft") setSelectedIndex((index) => index === null ? index : Math.max(0, index - 1));
      if (event.key === "ArrowRight") setSelectedIndex((index) => index === null ? index : Math.min(attachments.length - 1, index + 1));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [attachments.length, selected]);

  if (attachments.length === 0) return null;
  return (
    <>
      <div className="message-attachment-grid">
        {attachments.map((attachment, index) => (
          <button
            type="button"
            key={attachment.id}
            className="message-attachment"
            title={attachment.name}
            onClick={() => setSelectedIndex(index)}
          >
            <img src={attachmentSrc(attachment)} alt={attachment.name} />
            <span>{attachment.name}</span>
          </button>
        ))}
      </div>
      {selected && createPortal(
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedIndex(null);
          }}
        >
          <div className="image-lightbox-topbar">
            <div className="image-lightbox-title">
              <strong>{selected.name}</strong>
              <span>{selectedIndex! + 1} of {attachments.length}</span>
            </div>
            <div className="image-lightbox-actions">
              <a href={selectedSrc} download={selected.name} title="Download image" aria-label="Download image">
                <Download size={18} />
              </a>
              <button type="button" onClick={() => setSelectedIndex(null)} title="Close" aria-label="Close">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="image-lightbox-stage">
            <img src={selectedSrc} alt={selected.name} style={{ transform: `scale(${zoom})` }} />
          </div>
          {attachments.length > 1 && (
            <div className="image-lightbox-strip" aria-label="Attached images">
              {attachments.map((attachment, index) => (
                <button
                  type="button"
                  key={attachment.id}
                  className={clsx(index === selectedIndex && "active")}
                  onClick={() => setSelectedIndex(index)}
                  title={attachment.name}
                >
                  <img src={attachmentSrc(attachment)} alt="" />
                </button>
              ))}
            </div>
          )}
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
      )}
    </>
  );
}

const attachmentSrc = (attachment: DesktopAttachmentRecord) => attachment.url;

function ThoughtPanel({ thought, active }: { thought: string; active: boolean }) {
  const hasThought = thought.trim().length > 0;
  const shouldShowLabel = active || hasThought;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasThought) setOpen(false);
  }, [hasThought]);

  return (
    <div className="thought-shell">
      <button
        type="button"
        className={clsx("thought-toggle", active && hasThought && "active", !hasThought && "empty")}
        disabled={!hasThought}
        onClick={() => setOpen((value) => !value)}
      >
        <TypingIndicator
          size={hasThought ? 18 : 18}
          className={clsx("thought-indicator", hasThought ? "has-thought" : "is-empty")}
          isAnimating={active}
        />
        {shouldShowLabel && (
          <>
            <span className={active ? "animate-text-shimmer" : undefined}>
              {active ? "Thinking" : "Thought process"}
            </span>
            {hasThought && <ChevronDown className={clsx("thought-chevron", !open && "closed")} size={14} />}
          </>
        )}
      </button>
      {open && hasThought && (
        <div className="privora-thought-panel">
          <div className="privora-thought-content markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{thought}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function TypingIndicator({
  size = 28,
  className,
  isAnimating = true,
}: {
  size?: number;
  className?: string;
  isAnimating?: boolean;
}) {
  const angles = [0, 45, 90, 135];

  return (
    <span className={clsx("typing-indicator", isAnimating && "animating", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" aria-hidden="true">
        <circle className="typing-core" cx="12" cy="12" r="1.5" />
        {angles.map((angle, index) => (
          <g key={angle} style={{ transform: `rotate(${angle}deg)`, transformOrigin: "12px 12px" }}>
            <ellipse className="typing-track" cx="12" cy="12" rx="3.5" ry="10.5" />
            <ellipse className={`typing-trail trail-${index}`} cx="12" cy="12" rx="3.5" ry="10.5" />
          </g>
        ))}
      </svg>
    </span>
  );
}
