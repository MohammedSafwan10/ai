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
} from "../../shared/types";
import { ToolTimeline } from "./ToolTimeline";

interface ChatMessageProps {
  message: ChatMessageRecord;
  tools: ToolEventRecord[];
  activeRunStatus: string | null;
  onApprove: (callId: string, approved: boolean) => void;
  onApproveAll: (callIds: string[]) => void;
}

function ChatMessageComponent({ message, tools, activeRunStatus, onApprove, onApproveAll }: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasAttachments = (message.attachments || []).length > 0;
  const runActive = !isUser && (
    activeRunStatus === "sampling" ||
    activeRunStatus === "running" ||
    activeRunStatus === "executing_tool" ||
    activeRunStatus === "awaiting_approval" ||
    activeRunStatus === "draining" ||
    message.status === "running" ||
    message.status === "awaiting_approval"
  );
  const renderParts = useMemo(
    () => isUser ? [] : buildAssistantRenderParts(message, tools, runActive),
    [isUser, message, runActive, tools],
  );
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
              {message.content && <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>}
            </>
          ) : (
            <>
              <AssistantRunMeta message={message} active={runActive} />
              <div className="assistant-flow">
                {renderParts.length > 0 ? (
                  renderParts.map((part) => {
                    if (part.type === "thought") {
                      return <ThoughtPanel key={part.key} thought={part.thought} active={part.active} />;
                    }
                    if (part.type === "tools") {
                      return (
                        <ToolTimeline
                          key={part.key}
                          tools={part.tools}
                          messageStatus={message.status}
                          onApprove={onApprove}
                          onApproveAll={onApproveAll}
                        />
                      );
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
  previous.activeRunStatus === next.activeRunStatus
);

type AssistantRenderPart =
  | { type: "thought"; key: string; thought: string; active: boolean }
  | { type: "text"; key: string; text: string }
  | { type: "tools"; key: string; tools: ToolEventRecord[] };

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
  return parts;
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

function AssistantRunMeta({ message, active }: { message: ChatMessageRecord; active: boolean }) {
  const elapsed = useElapsedTime(message.createdAt, active ? undefined : message.updatedAt);
  return (
    <div className="assistant-run-meta">
      <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
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
