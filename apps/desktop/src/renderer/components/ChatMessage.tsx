import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, Copy } from "lucide-react";
import clsx from "clsx";
import { memo, useEffect, useMemo, useState } from "react";
import type {
  AssistantThoughtPartRecord,
  ChatMessageRecord,
  DesktopAttachmentRecord,
  ToolEventRecord,
  TurnUndoRecord,
} from "../../shared/types";
import { ToolTimeline } from "./ToolTimeline";
import { TurnReviewCard } from "./ReviewPanel";

const USER_MESSAGE_PREVIEW_CHARS = 900;
const USER_MESSAGE_COLLAPSE_CHARS = 1200;
const USER_MESSAGE_COLLAPSE_LINES = 16;

interface ChatMessageProps {
  message: ChatMessageRecord;
  tools: ToolEventRecord[];
  activeRunStatus: string | null;
  onApprove: (callId: string, approved: boolean) => void;
  onApproveAll: (callIds: string[]) => void;
  onOpenReview: (messageId: string) => void;
  turnUndo: TurnUndoRecord | null;
  onPrepareTurnUndo: (messageId: string) => Promise<TurnUndoRecord | null>;
  onUndoTurnChanges: (messageId: string) => Promise<TurnUndoRecord | null>;
}

function ChatMessageComponent({
  message,
  tools,
  activeRunStatus,
  onApprove,
  onApproveAll,
  onOpenReview,
  turnUndo,
  onPrepareTurnUndo,
  onUndoTurnChanges,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasAttachments = (message.attachments || []).length > 0;
  const runActive = !isUser && (isActiveTurnStatus(activeRunStatus) || isActiveTurnStatus(message.status));
  const renderParts = useMemo(
    () => isUser ? [] : buildAssistantRenderParts(message, tools, runActive),
    [isUser, message, runActive, tools],
  );
  const hasAssistantActivity = renderParts.some((part) => part.type !== "text");
  const activityNeedsAttention = renderParts.some((part) =>
    part.type === "tools" && part.tools.some((tool) => tool.status === "awaiting_approval" || tool.status === "failed")
  );
  const [activityOpen, setActivityOpen] = useState(runActive || activityNeedsAttention);
  useEffect(() => {
    if (runActive || activityNeedsAttention) {
      setActivityOpen(true);
      return;
    }
    setActivityOpen(false);
  }, [activityNeedsAttention, runActive]);
  const [copied, setCopied] = useState(false);
  const showCopyFeedback = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const copyMessage = async () => {
    await writeClipboard(message.content || message.thought || "");
    showCopyFeedback();
  };
  return (
    <article className={clsx("chat-message", isUser && "user")}>
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
                  renderParts.map((part) => {
                    const showActivityPart = runActive || activityOpen || activityNeedsAttention;
                    if (part.type === "thought") {
                      return showActivityPart ? <ThoughtPanel key={part.key} thought={part.thought} active={part.active} /> : null;
                    }
                    if (part.type === "tools") {
                      return showActivityPart ? (
                        <ToolTimeline
                          key={part.key}
                          tools={part.tools}
                          messageStatus={message.status}
                          defaultOpen={part.defaultOpen}
                          onApprove={onApprove}
                          onApproveAll={onApproveAll}
                        />
                      ) : null;
                    }
                    return (
                      <div key={part.key} className="assistant-flow-text markdown-body">
                        <AssistantTextPart text={part.text} active={runActive} />
                      </div>
                    );
                  })
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
        {(message.content || hasAttachments) && (
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
  previous.activeRunStatus === next.activeRunStatus &&
  previous.turnUndo === next.turnUndo
);

type AssistantRenderPart =
  | { type: "thought"; key: string; thought: string; active: boolean }
  | { type: "text"; key: string; text: string }
  | { type: "tools"; key: string; tools: ToolEventRecord[]; defaultOpen: boolean };

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
    const text = content.slice(cursor, offset);
    if (text.trim()) {
      flushPendingTools(`before-text-${index}`);
      parts.push({ type: "text", key: `text-${index}-${cursor}`, text });
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
  if (tail.trim()) parts.push({ type: "text", key: `text-tail-${cursor}`, text: tail });
  return markDefaultOpenToolPart(parts, runActive);
}

function markDefaultOpenToolPart(parts: AssistantRenderPart[], runActive: boolean): AssistantRenderPart[] {
  const latestLiveToolIndex = [...parts].reverse().findIndex((part) =>
    part.type === "tools" && part.tools.some((tool) => tool.status === "running" || tool.status === "preparing")
  );
  const liveIndex = latestLiveToolIndex >= 0 ? parts.length - 1 - latestLiveToolIndex : -1;
  return parts.map((part, index) => {
    if (part.type !== "tools") return part;
    const needsAttention = part.tools.some((tool) => tool.status === "awaiting_approval" || tool.status === "failed");
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
  const storedParts = normalizeThoughtParts(message.thoughtParts || []);
  if (storedParts.length > 0) {
    return storedParts.flatMap((part, index) => {
      const next = storedParts[index + 1];
      const thoughtText = thought.slice(part.thoughtOffset, next?.thoughtOffset ?? thought.length);
      const isLast = index === storedParts.length - 1;
      if (!thoughtText.trim() && !(runActive && isLast)) return [];
      return [{
        type: "thought" as const,
        key: `thought-${part.id}`,
        offset: part.textOffset,
        createdAt: part.createdAt,
        streamOrder: part.streamOrder,
        thought: thoughtText,
        active: runActive && isLast,
      }];
    });
  }

  if (thought.trim() || (runActive && !message.content.trim() && tools.length === 0)) {
    return [{
      type: "thought",
      key: `thought-${message.id}`,
      offset: 0,
      createdAt: message.createdAt,
      thought,
      active: runActive,
    }];
  }
  return [];
}

function normalizeThoughtParts(parts: AssistantThoughtPartRecord[]) {
  return [...parts]
    .filter((part) => Number.isFinite(part.textOffset) && Number.isFinite(part.thoughtOffset))
    .sort((a, b) => a.thoughtOffset - b.thoughtOffset || a.createdAt - b.createdAt);
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
        <button type="button" className="assistant-run-toggle" onClick={onToggleActivity}>
          <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
          <ChevronDown className={clsx("assistant-run-chevron", !activityOpen && "closed")} size={14} />
        </button>
      ) : (
        <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
      )}
    </div>
  );
}

function AssistantTextPart({ text, active }: { text: string; active: boolean }) {
  if (active) {
    return <div className="streaming-text">{text}</div>;
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
}

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
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  return (
    <div className={clsx("user-message-collapsible", open && "open")}>
      <div className="user-message-meta">
        Long prompt · {content.length.toLocaleString()} chars · {lineCount.toLocaleString()} lines
      </div>
      <div className="user-message-content">
        {open ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <pre className="user-message-preview">{preview}</pre>
        )}
      </div>
      <button
        type="button"
        className="user-message-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? "Collapse prompt" : "Show full prompt"}</span>
        <ChevronDown className={clsx("user-message-toggle-icon", !open && "closed")} size={14} />
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
  if (attachments.length === 0) return null;
  return (
    <div className="message-attachment-grid">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          className="message-attachment"
          href={`data:${attachment.mimeType};base64,${attachment.base64}`}
          download={attachment.name}
          title={attachment.name}
        >
          <img src={`data:${attachment.mimeType};base64,${attachment.base64}`} alt={attachment.name} />
          <span>{attachment.name}</span>
        </a>
      ))}
    </div>
  );
}

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{thought}</ReactMarkdown>
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
