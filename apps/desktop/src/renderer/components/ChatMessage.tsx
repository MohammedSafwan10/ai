import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, Copy } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import type { ChatMessageRecord, DesktopAttachmentRecord, ToolEventRecord } from "../../shared/types";
import { ToolTimeline } from "./ToolTimeline";

interface ChatMessageProps {
  message: ChatMessageRecord;
  tools: ToolEventRecord[];
  activeRunStatus: string | null;
  onApprove: (callId: string, approved: boolean) => void;
  onOpenPath: (path: string) => void;
}

export function ChatMessage({ message, tools, activeRunStatus, onApprove, onOpenPath }: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasAttachments = (message.attachments || []).length > 0;
  const runActive = !isUser && (
    activeRunStatus === "running" ||
    activeRunStatus === "awaiting_approval" ||
    message.status === "running" ||
    message.status === "awaiting_approval"
  );
  const hasContent = message.content.trim().length > 0;
  const hasThought = (message.thought || "").trim().length > 0;
  const showThinkingPlaceholder = runActive && !hasContent;
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
        <div className="message-bubble markdown-body">
          {!isUser && <AssistantRunMeta message={message} active={runActive} />}
          {!isUser && (hasThought || showThinkingPlaceholder) && (
            <ThoughtPanel thought={message.thought || ""} active={showThinkingPlaceholder} />
          )}
          {hasAttachments && <AttachmentGrid attachments={message.attachments || []} />}
          {message.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          ) : (
            !isUser && !showThinkingPlaceholder && !hasAttachments && <TypingIndicator size={20} className="inline-thinking-indicator" isAnimating />
          )}
          {!isUser && <ToolTimeline tools={tools} messageStatus={message.status} onApprove={onApprove} onOpenPath={onOpenPath} />}
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

function AssistantRunMeta({ message, active }: { message: ChatMessageRecord; active: boolean }) {
  const elapsed = useElapsedTime(message.createdAt, active ? undefined : message.updatedAt);
  return (
    <div className="assistant-run-meta">
      <span>{active ? `Working for ${elapsed}` : `Worked for ${elapsed}`}</span>
    </div>
  );
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
  const [open, setOpen] = useState(active && hasThought);

  useEffect(() => {
    if (active && hasThought) setOpen(true);
    if (!active) setOpen(false);
  }, [active, hasThought]);

  return (
    <div className="thought-shell">
      <button
        type="button"
        className={clsx("thought-toggle", active && hasThought && "active", !hasThought && "empty")}
        disabled={!hasThought}
        onClick={() => setOpen((value) => !value)}
      >
        <TypingIndicator
          size={hasThought ? 22 : 20}
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
