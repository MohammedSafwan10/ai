import { ArrowDown, Check, ChevronDown, Loader2, PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ChangeEventHandler, type ClipboardEventHandler, type KeyboardEventHandler, type RefObject } from "react";
import { cn } from "../../../lib/utils";
import { ChatMessage } from "../../chat/components/ChatMessage";
import { MarkdownRenderer } from "../../chat/components/MarkdownRenderer";
import { TypingIndicator } from "../../chat/components/TypingIndicator";
import type { Attachment } from "../../../lib/attachments";
import type { WebDevFileDiff, WebDevMessage } from "../lib/types";
import { WebDevComposer } from "./WebDevComposer";

const WEBDEV_CHAT_BOTTOM_THRESHOLD_PX = 128;
type WebDevThoughtContentPart = {
  type: "thinking";
  text: string;
  title?: string;
  active?: boolean;
  startedAt?: number;
  endedAt?: number;
};
type WebDevTextContentPart = {
  type: "text";
  text: string;
  startedAt?: number;
  endedAt?: number;
};
type WebDevToolContentPart = {
  type: "tool";
  activityId: string;
  activityKey?: string;
  startedAt?: number;
  endedAt?: number;
};
type WebDevContentPart = WebDevThoughtContentPart | WebDevTextContentPart | WebDevToolContentPart;
type WebDevRenderedPart = WebDevThoughtContentPart | WebDevTextContentPart | { type: "toolGroup"; activities: WebDevMessage[] };

const getActivityLabel = (message: WebDevMessage, allowRunningLabel = true) => {
  const operation = message.activityOperation;
  if (allowRunningLabel && message.activityStatus === "running") return message.content;
  if (operation === "created") return "Created 1 file";
  if (operation === "updated" || operation === "patched") return "Edited 1 file";
  if (operation === "deleted") return "Deleted files";
  if (operation === "renamed") return "Renamed file";
  if (operation === "created_project") return "Created project files";
  if (operation === "skipped") return "Skipped edit";
  if (operation === "searched") return "Searched files";
  if (operation === "outlined") return "Outlined file";
  if (operation === "checked") return "Checked diagnostics";
  if (operation === "command") return "Ran command";
  return message.content || "Updated project";
};

const getActivityPath = (message: WebDevMessage) => message.filePath || message.content.replace(/^(Created|Edited|Patched|Updating|Writing|Deleting|Outlined|Searched|Checked|Running)\s+/i, "");

const isCurrentRunActivity = (message: WebDevMessage, activeRunStartedAt?: number) =>
  Boolean(activeRunStartedAt && message.activityStatus === "running" && message.createdAt >= activeRunStartedAt);

const isCommandLikeActivity = (message: WebDevMessage) =>
  message.activityOperation === "checked" || message.activityOperation === "command";

const getCompactActivityDetail = (message: WebDevMessage) => {
  const detail = message.activityDetail?.trim();
  if (!detail) return "";
  if (!isCommandLikeActivity(message)) return detail;
  const lines = detail.split(/\r?\n/).filter(Boolean);
  const important = lines.filter(line => /\berror\b|failed|cannot find|exited with code|warning/i.test(line));
  return (important.length ? important : lines.slice(-8)).slice(0, 12).join("\n");
};

const countChangedLines = (before = "", after = "") => {
  if (before === after) return { additions: 0, deletions: 0 };
  const beforeLines = before ? before.split(/\r?\n/) : [];
  const afterLines = after ? after.split(/\r?\n/) : [];

  const beforeCounts = new Map<string, number>();
  beforeLines.forEach(line => {
    beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1);
  });

  let additions = 0;
  afterLines.forEach(line => {
    const count = beforeCounts.get(line) || 0;
    if (count > 0) {
      beforeCounts.set(line, count - 1);
      return;
    }
    additions += 1;
  });

  let deletions = 0;
  for (const count of beforeCounts.values()) {
    deletions += count;
  }

  return { additions, deletions };
};

const getEffectiveActivityDelta = (message: WebDevMessage) => {
  if (message.beforeContent !== undefined || message.afterContent !== undefined) {
    return countChangedLines(message.beforeContent || "", message.afterContent || "");
  }
  return {
    additions: typeof message.additions === "number" ? message.additions : 0,
    deletions: typeof message.deletions === "number" ? message.deletions : 0,
  };
};

const hasMeaningfulActivityDelta = (message: WebDevMessage) => {
  const delta = getEffectiveActivityDelta(message);
  return delta.additions > 0 || delta.deletions > 0;
};

const getActivityGroupLabel = (messages: WebDevMessage[], activeRunStartedAt?: number) => {
  const running = messages.find(message => isCurrentRunActivity(message, activeRunStartedAt));
  const created = messages.filter(message => message.activityOperation === "created" || message.activityOperation === "created_project").length;
  const edited = messages.filter(message => message.activityOperation === "updated" || message.activityOperation === "patched").length;
  const deleted = messages.filter(message => message.activityOperation === "deleted").length;
  const renamed = messages.filter(message => message.activityOperation === "renamed").length;
  const skipped = messages.filter(message => message.activityOperation === "skipped" || message.activityStatus === "error").length;
  const checked = messages.filter(message => message.activityOperation === "checked" || message.activityOperation === "command").length;
  const inspected = messages.filter(message => message.activityOperation === "searched" || message.activityOperation === "outlined").length;
  if (running) {
    const fileCount = new Set(messages.map(message => message.filePath).filter(Boolean)).size;
    if (fileCount > 1) return `Working on ${fileCount} files`;
    return running.content || "Working on the project";
  }
  const parts = [
    created ? `Created ${created} ${created === 1 ? "file" : "files"}` : "",
    edited ? `Edited ${edited} ${edited === 1 ? "file" : "files"}` : "",
    deleted ? `Deleted ${deleted} ${deleted === 1 ? "file" : "files"}` : "",
    renamed ? `Renamed ${renamed} ${renamed === 1 ? "path" : "paths"}` : "",
    inspected ? `Inspected ${inspected}` : "",
    checked ? `Checked ${checked}` : "",
    skipped ? `Skipped ${skipped} ${skipped === 1 ? "edit" : "edits"}` : "",
  ].filter(Boolean);
  return parts.join(", ") || getActivityLabel(messages[messages.length - 1], false);
};

const hasVisibleActivityDelta = (message: WebDevMessage) =>
  hasMeaningfulActivityDelta(message) ||
  Boolean(message.activityDetail);

const getActivityRank = (message: WebDevMessage) => {
  if (hasMeaningfulActivityDelta(message)) return 4;
  if (message.beforeContent !== undefined || message.afterContent !== undefined) return 3;
  if (message.activityStatus === "done") return 2;
  if (message.activityDetail) return 1;
  return 0;
};

const getPreferredDeltaSource = (primary: WebDevMessage, fallback: WebDevMessage) => {
  if (primary.beforeContent !== undefined || primary.afterContent !== undefined) return primary;
  if (fallback.beforeContent !== undefined || fallback.afterContent !== undefined) return fallback;
  if (hasMeaningfulActivityDelta(primary)) return primary;
  if (hasMeaningfulActivityDelta(fallback)) return fallback;
  return primary;
};

const getCreatedAt = (message: WebDevMessage) => typeof message.createdAt === "number" ? message.createdAt : 0;

const getNetContentDelta = (first: WebDevMessage, second: WebDevMessage) => {
  const earliest = getCreatedAt(first) <= getCreatedAt(second) ? first : second;
  const latest = earliest === first ? second : first;
  const beforeContent =
    earliest.beforeContent !== undefined
      ? earliest.beforeContent
      : latest.beforeContent;
  const afterContent =
    latest.afterContent !== undefined
      ? latest.afterContent
      : earliest.afterContent;

  if (beforeContent === undefined && afterContent === undefined) {
    return undefined;
  }

  return {
    beforeContent,
    afterContent,
    ...countChangedLines(beforeContent || "", afterContent || ""),
  };
};

const mergeActivityMessages = (messages: WebDevMessage[]) => {
  const merged = new Map<string, WebDevMessage>();
  const passthrough: WebDevMessage[] = [];

  messages.forEach(message => {
    if (!message.filePath) {
      passthrough.push(message);
      return;
    }

    const existing = merged.get(message.filePath);
    if (!existing) {
      merged.set(message.filePath, message);
      return;
    }

    const preferNext = getActivityRank(message) >= getActivityRank(existing);
    const base = preferNext ? message : existing;
    const fallback = preferNext ? existing : message;
    const deltaSource = getPreferredDeltaSource(base, fallback);
    const netDelta = getNetContentDelta(existing, message);
    const delta = netDelta || getEffectiveActivityDelta(deltaSource);

    merged.set(message.filePath, {
      ...fallback,
      ...base,
      activityStatus: existing.activityStatus === "running" || message.activityStatus === "running" ? "running" : base.activityStatus,
      additions: delta.additions,
      deletions: delta.deletions,
      beforeContent: netDelta ? netDelta.beforeContent : deltaSource.beforeContent,
      afterContent: netDelta ? netDelta.afterContent : deltaSource.afterContent,
      activityDetail: base.activityDetail || fallback.activityDetail,
    });
  });

  const byId = new Map([...merged.values(), ...passthrough].map(message => [message.id, message]));
  return messages
    .map(message => message.filePath ? merged.get(message.filePath) : byId.get(message.id))
    .filter((message, index, all): message is WebDevMessage => Boolean(message) && all.findIndex(item => item?.id === message.id) === index);
};

const removeStalePrefixActivities = (messages: WebDevMessage[]) => {
  const mergedMessages = mergeActivityMessages(messages);
  return mergedMessages.filter(message => {
    if (!message.filePath || hasVisibleActivityDelta(message)) return true;
    return !mergedMessages.some(other =>
      other.id !== message.id &&
      other.filePath &&
      other.filePath !== message.filePath &&
      other.filePath.startsWith(message.filePath) &&
      hasVisibleActivityDelta(other)
    );
  });
};

const groupOrderedParts = (parts: WebDevContentPart[], activitiesById: Map<string, WebDevMessage>) => {
  const rendered: WebDevRenderedPart[] = [];
  let activityBuffer: WebDevMessage[] = [];
  const flushActivities = () => {
    if (activityBuffer.length === 0) return;
    rendered.push({ type: "toolGroup", activities: activityBuffer });
    activityBuffer = [];
  };

  parts.forEach(part => {
    if (part.type === "tool") {
      const activity = activitiesById.get(part.activityId);
      if (activity) activityBuffer.push(activity);
      return;
    }
    flushActivities();
    rendered.push(part);
  });
  flushActivities();
  return rendered;
};

function ActivityDetail({ message }: { message: WebDevMessage }) {
  const detail = getCompactActivityDetail(message);
  if (!detail) return null;
  return (
    <pre className="mt-1.5 max-h-32 w-full overflow-auto rounded-md border border-[var(--privora-border)] bg-[var(--privora-bg)]/55 px-2.5 py-2 font-mono text-[11px] leading-5 text-[var(--privora-muted)]">
      {detail}
    </pre>
  );
}

function WebDevActivityGroup({
  messages,
  isGenerating,
  activeRunStartedAt,
  onSelectFile,
  onOpenFileDiff,
}: {
  messages: WebDevMessage[];
  isGenerating: boolean;
  activeRunStartedAt?: number;
  onSelectFile?: (path: string) => void;
  onOpenFileDiff?: (diff: WebDevFileDiff) => void;
}) {
  const visibleMessages = removeStalePrefixActivities(messages);
  const hasCurrentRunning = isGenerating && messages.some(message => isCurrentRunActivity(message, activeRunStartedAt));
  const hasAnyRunning = messages.some(message => message.activityStatus === "running");
  const [isOpen, setIsOpen] = useState(hasCurrentRunning);
  const isRunning = hasCurrentRunning;
  const runningMessage = visibleMessages.find(message => isCurrentRunActivity(message, activeRunStartedAt));
  const additions = visibleMessages.reduce((total, message) => total + getEffectiveActivityDelta(message).additions, 0);
  const deletions = visibleMessages.reduce((total, message) => total + getEffectiveActivityDelta(message).deletions, 0);

  useEffect(() => {
    const nextOpen = Boolean(hasCurrentRunning && hasAnyRunning);
    setIsOpen(current => current === nextOpen ? current : nextOpen);
  }, [hasCurrentRunning, hasAnyRunning]);

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(42rem,92%)] px-1 py-0.5 text-[13px] text-[var(--privora-muted)]">
        <button
          type="button"
          onClick={() => setIsOpen(value => !value)}
          className={cn(
            "inline-flex max-w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-[var(--privora-border)] hover:bg-[var(--privora-surface)] hover:text-[var(--privora-text)]",
            isOpen && "border-[var(--privora-border)] bg-[var(--privora-surface)]/55"
          )}
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className={cn("min-w-0 truncate", isRunning && "animate-text-shimmer")}>{getActivityGroupLabel(visibleMessages, activeRunStartedAt)}</span>
          {(additions > 0 || deletions > 0) && (
            <span className="ml-1 flex shrink-0 items-center gap-1">
              {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
              {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && (
          <div className="ml-5 mt-1.5 space-y-1.5 border-l border-[var(--privora-border)]/70 pl-3">
            {runningMessage && (
              <div className="min-w-0 truncate text-[12px] text-[var(--privora-muted)]">
                {runningMessage.content}
              </div>
            )}
            {visibleMessages.map((message) => {
              const fileDelta = getEffectiveActivityDelta(message);
              const path = getActivityPath(message);
              const isMessageRunning = isGenerating && isCurrentRunActivity(message, activeRunStartedAt);
              const canOpenDiff = Boolean(message.filePath && message.beforeContent !== undefined && message.afterContent !== undefined && onOpenFileDiff);
              const canOpen = Boolean(message.filePath && (onSelectFile || canOpenDiff));
              const openFile = () => {
                if (canOpenDiff) {
                  onOpenFileDiff?.({
                    path: message.filePath!,
                    beforeContent: message.beforeContent || "",
                    afterContent: message.afterContent || "",
                  });
                  return;
                }
                onSelectFile?.(message.filePath!);
              };
              return (
                <div key={message.id} className="min-w-0 text-[13px]">
                  <div className={cn("flex min-w-0 items-center gap-1.5", isMessageRunning && "text-[var(--privora-accent)]")}>
                    {isMessageRunning ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <span className="h-3 w-3 shrink-0" />}
                    {canOpen ? (
                      <button
                        type="button"
                        onClick={openFile}
                        className="min-w-0 truncate text-left text-[var(--privora-text)] underline-offset-4 transition hover:underline"
                        title={canOpenDiff ? `Open changes for ${message.filePath}` : `Open ${message.filePath}`}
                      >
                        {path}
                      </button>
                    ) : (
                      <span className="min-w-0 truncate text-[var(--privora-text)]">{path}</span>
                    )}
                    {(fileDelta.additions > 0 || fileDelta.deletions > 0) && (
                      <span className="flex shrink-0 items-center gap-1">
                        {fileDelta.additions > 0 && <span className="text-emerald-500">+{fileDelta.additions}</span>}
                        {fileDelta.deletions > 0 && <span className="text-red-500">-{fileDelta.deletions}</span>}
                      </span>
                    )}
                  </div>
                  {!message.filePath && <ActivityDetail message={message} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WebDevActivityRow({
  message,
  isGenerating,
  activeRunStartedAt,
  onSelectFile,
  onOpenFileDiff,
}: {
  message: WebDevMessage;
  isGenerating: boolean;
  activeRunStartedAt?: number;
  onSelectFile?: (path: string) => void;
  onOpenFileDiff?: (diff: WebDevFileDiff) => void;
}) {
  const isRunning = isGenerating && isCurrentRunActivity(message, activeRunStartedAt);
  const [isOpen, setIsOpen] = useState(isRunning);
  const { additions, deletions } = getEffectiveActivityDelta(message);
  const showDelta = additions > 0 || deletions > 0;
  const canOpenDiff = Boolean(message.filePath && message.beforeContent !== undefined && message.afterContent !== undefined && onOpenFileDiff);
  const openFile = () => {
    if (!message.filePath) return;
    if (canOpenDiff) {
      onOpenFileDiff?.({
        path: message.filePath,
        beforeContent: message.beforeContent || "",
        afterContent: message.afterContent || "",
      });
      return;
    }
    onSelectFile?.(message.filePath);
  };

  useEffect(() => {
    setIsOpen(current => current === isRunning ? current : isRunning);
  }, [isRunning]);

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(42rem,92%)] px-1 py-0.5 text-[13px] text-[var(--privora-muted)]">
        <button
          type="button"
          onClick={() => setIsOpen(value => !value)}
          className={cn(
            "inline-flex max-w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-[var(--privora-border)] hover:bg-[var(--privora-surface)] hover:text-[var(--privora-text)]",
            isOpen && "border-[var(--privora-border)] bg-[var(--privora-surface)]/55"
          )}
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className={cn("min-w-0 truncate", isRunning && "animate-text-shimmer")}>{getActivityLabel(message, isRunning)}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && (message.filePath || message.activityDetail) && (
          <div className="ml-5 mt-1.5 min-w-0 border-l border-[var(--privora-border)]/70 pl-3 text-[13px]">
            {message.filePath && (
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={openFile}
                  className="min-w-0 truncate text-left text-[var(--privora-text)] underline-offset-4 transition hover:underline"
                  title={canOpenDiff ? `Open changes for ${message.filePath}` : `Open ${message.filePath}`}
                >
                  {message.filePath}
                </button>
                {showDelta && (
                  <>
                    {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
                    {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
                  </>
                )}
              </div>
            )}
            <ActivityDetail message={message} />
          </div>
        )}
      </div>
    </div>
  );
}

function WebDevThoughtPart({ part }: { part: WebDevThoughtContentPart }) {
  const [isOpen, setIsOpen] = useState(Boolean(part.active));
  const title = part.active ? "Thinking" : part.title || "Thought process";

  useEffect(() => {
    if (part.active) setIsOpen(true);
    else setIsOpen(false);
  }, [part.active]);

  return (
    <div className="w-full px-4 md:px-6">
      <div className="flex w-full max-w-full flex-col items-start">
        <button
          type="button"
          onClick={() => setIsOpen(value => !value)}
          className={cn(
            "flex items-center gap-2 rounded py-1.5 text-[14px] font-medium transition-colors hover:opacity-75",
            part.active ? "text-[var(--privora-accent)]" : "text-[var(--privora-muted)]"
          )}
        >
          <TypingIndicator
            size={22}
            className={cn("shrink-0 text-[var(--privora-text)]", part.active ? "opacity-90" : "opacity-65")}
            isAnimating={Boolean(part.active)}
          />
          <span className={cn(part.active && "animate-text-shimmer")}>{title}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && (
          <div className="mt-2 flex w-full overflow-hidden">
            <div className="privora-thought-panel max-w-[95%]">
              <div className="privora-thought-content max-w-none font-sans transition-colors duration-500">
                <MarkdownRenderer compact isStreaming={Boolean(part.active)}>{part.text}</MarkdownRenderer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WebDevAssistantMessage({
  message,
  activitiesById,
  isActiveAssistant,
  isGenerating,
  activeRunStartedAt,
  onSelectFile,
  onOpenFileDiff,
  onPreviewAttachment,
}: {
  message: WebDevMessage;
  activitiesById: Map<string, WebDevMessage>;
  isActiveAssistant: boolean;
  isGenerating: boolean;
  activeRunStartedAt?: number;
  onSelectFile?: (path: string) => void;
  onOpenFileDiff?: (diff: WebDevFileDiff) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}) {
  const contentParts = (message.contentParts || []) as WebDevContentPart[];
  const hasOrderedParts = contentParts.some(part => part.type === "tool" ? true : part.text.trim().length > 0);
  const thinkingParts = contentParts.filter((part): part is WebDevThoughtContentPart => part.type === "thinking" && part.text.trim().length > 0);
  const renderedParts = groupOrderedParts(contentParts, activitiesById);

  if (hasOrderedParts) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {renderedParts.map((part, index) => {
          if (part.type === "thinking") {
            if (!part.text.trim()) return null;
            return <WebDevThoughtPart key={`${message.id}-thinking-${index}`} part={part} />;
          }

          if (part.type === "toolGroup") {
            if (part.activities.length === 0) return null;
            if (part.activities.length === 1) {
              return (
                <WebDevActivityRow
                  key={`${message.id}-tool-${part.activities[0].id}`}
                  message={part.activities[0]}
                  isGenerating={isGenerating}
                  activeRunStartedAt={activeRunStartedAt}
                  onSelectFile={onSelectFile}
                  onOpenFileDiff={onOpenFileDiff}
                />
              );
            }
            return (
              <WebDevActivityGroup
                key={`${message.id}-tool-group-${part.activities.map(activity => activity.id).join(":")}`}
                messages={part.activities}
                isGenerating={isGenerating}
                activeRunStartedAt={activeRunStartedAt}
                onSelectFile={onSelectFile}
                onOpenFileDiff={onOpenFileDiff}
              />
            );
          }

          const textPart = part as WebDevTextContentPart;
          if (!textPart.text.trim()) return null;
          return (
            <div key={`${message.id}-text-${index}`} className="w-full px-4 md:px-6">
              <div className="w-full max-w-[min(42rem,92%)] text-[1.05rem] leading-8 text-[var(--privora-text)]">
                <MarkdownRenderer isStreaming={isActiveAssistant && index === renderedParts.length - 1}>
                  {textPart.text}
                </MarkdownRenderer>
              </div>
            </div>
          );
        })}
        {message.attachments && message.attachments.length > 0 && (
          <ChatMessage
            role="model"
            content=""
            isTyping={false}
            hideActions
            attachments={message.attachments}
            onPreviewAttachment={onPreviewAttachment}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {thinkingParts.map((part, index) => (
        <WebDevThoughtPart key={`${message.id}-thought-${index}`} part={part} />
      ))}
      <ChatMessage
        role="model"
        content={message.content}
        thought={thinkingParts.length > 0 ? undefined : message.thought}
        isThinking={thinkingParts.length > 0 ? false : message.isThinking}
        isTyping={isActiveAssistant}
        hideActions={isActiveAssistant}
        attachments={message.attachments}
        onPreviewAttachment={onPreviewAttachment}
      />
    </>
  );
}

export function WebDevChatPanel({
  messages,
  input,
  isGenerating,
  selectedModel,
  isThinkingEnabled,
  onInputChange,
  onSubmit,
  onSelectModel,
  onToggleThinking,
  onStop,
  onOpenIde,
  onSelectFile,
  onOpenFileDiff,
  attachments,
  textareaRef,
  fileInputRef,
  onPaste,
  onFileSelect,
  onKeyDown,
  onTakeScreenshot,
  onPreviewAttachment,
  onRemoveAttachment,
}: {
  messages: WebDevMessage[];
  input: string;
  isGenerating: boolean;
  selectedModel: string;
  isThinkingEnabled: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSelectModel: (modelId: string) => void;
  onToggleThinking: () => void;
  onStop: () => void;
  onOpenIde?: () => void;
  onSelectFile?: (path: string) => void;
  onOpenFileDiff?: (diff: WebDevFileDiff) => void;
  attachments: Attachment[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onFileSelect: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onTakeScreenshot: () => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (index: number) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const isScrollingToLatestRef = useRef(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const inlineActivityIds = new Set(
    messages.flatMap(message =>
      ((message.contentParts || []) as WebDevContentPart[])
        .filter((part): part is WebDevToolContentPart => part.type === "tool")
        .map(part => part.activityId)
    )
  );
  const activitiesById = new Map(messages.filter(message => message.role === "activity").map(message => [message.id, message]));
  const visibleMessages = messages.filter(message =>
    !message.hiddenFromChat &&
    message.role !== "tool" &&
    !(message.role === "activity" && inlineActivityIds.has(message.id))
  );
  const messageBlocks = visibleMessages.reduce<Array<WebDevMessage | WebDevMessage[]>>((blocks, message) => {
    if (message.role !== "activity") {
      blocks.push(message);
      return blocks;
    }
    const last = blocks[blocks.length - 1];
    if (Array.isArray(last)) {
      last.push(message);
    } else {
      blocks.push([message]);
    }
    return blocks;
  }, []);
  const activeAssistant = isGenerating
    ? [...visibleMessages].reverse().find(message => message.role === "assistant")
    : undefined;
  const activeAssistantId = activeAssistant?.id;
  const activeRunStartedAt = activeAssistant?.createdAt;

  const isNearBottom = () => {
    const scroller = scrollRef.current;
    if (!scroller) return true;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < WEBDEV_CHAT_BOTTOM_THRESHOLD_PX;
  };

  const scrollToLatest = (behavior: ScrollBehavior = "smooth") => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    shouldAutoScrollRef.current = true;
    isScrollingToLatestRef.current = true;
    setShowScrollToLatest(false);
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior,
    });

    window.setTimeout(() => {
      isScrollingToLatestRef.current = false;
      const nearBottom = isNearBottom();
      shouldAutoScrollRef.current = nearBottom;
      setShowScrollToLatest(visibleMessages.length > 0 && !nearBottom);
    }, behavior === "smooth" ? 420 : 0);
  };

  const handleScroll = () => {
    const nearBottom = isNearBottom();
    if (isScrollingToLatestRef.current && !nearBottom) return;

    shouldAutoScrollRef.current = nearBottom;
    setShowScrollToLatest(visibleMessages.length > 0 && !nearBottom);
  };

  useEffect(() => {
    if (visibleMessages.length === 0) {
      shouldAutoScrollRef.current = true;
      setShowScrollToLatest(false);
      return;
    }

    if (shouldAutoScrollRef.current) {
      scrollToLatest(isGenerating ? "auto" : "smooth");
      return;
    }

    setShowScrollToLatest(true);
  }, [messages, isGenerating, visibleMessages.length]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {onOpenIde && (
        <button
          type="button"
          onClick={onOpenIde}
          className="absolute right-4 top-4 z-20 flex h-9 items-center gap-2 rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] px-3 text-xs font-semibold text-[var(--privora-text)] shadow-sm transition hover:bg-[var(--privora-user-bubble)]"
          title="Open Web Dev panel"
        >
          <PanelRightOpen className="h-4 w-4" />
          IDE
        </button>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-6">
          <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-5">
            {visibleMessages.length === 0 && (
              <div className="py-24 text-center">
                <h1 className="font-display text-3xl font-medium text-[var(--privora-text)]">Build a web app</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--privora-muted)]">
                  Describe the frontend you want. Privora will create files, edit code, and run a live preview.
                </p>
              </div>
            )}
            {messageBlocks.map((block) => {
              if (Array.isArray(block)) {
                if (block.length === 1) return <WebDevActivityRow key={block[0].id} message={block[0]} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} onOpenFileDiff={onOpenFileDiff} />;
                return <WebDevActivityGroup key={block.map(message => message.id).join(":")} messages={block} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} onOpenFileDiff={onOpenFileDiff} />;
              }
              const message = block;
              const isUser = message.role === "user";
              const isActivity = message.role === "activity";
              if (isActivity) {
                return <WebDevActivityRow key={message.id} message={message} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} onOpenFileDiff={onOpenFileDiff} />;
              }
              if (message.role === "assistant") {
                const isActiveAssistant = message.id === activeAssistantId;
                return (
                  <WebDevAssistantMessage
                    key={message.id}
                    message={message}
                    activitiesById={activitiesById}
                    isActiveAssistant={isActiveAssistant}
                    isGenerating={isGenerating}
                    activeRunStartedAt={activeRunStartedAt}
                    onSelectFile={onSelectFile}
                    onOpenFileDiff={onOpenFileDiff}
                    onPreviewAttachment={onPreviewAttachment}
                  />
                );
              }
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-0 max-w-[min(42rem,88%)] text-sm leading-6 ${
                    isUser
                      ? "rounded-[24px] bg-[var(--privora-user-bubble)] px-5 py-3.5 text-[var(--privora-text)] shadow-sm"
                        : "w-full text-[1.05rem] text-[var(--privora-text)]"
                  }`}>
                    {message.content ? (
                      isUser ? (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      ) : null
                    ) : (
                      null
                    )}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.attachments.map((attachment, index) => (
                          <button
                            key={`${attachment.name}-${index}`}
                            type="button"
                            onClick={() => onPreviewAttachment(attachment)}
                            className="rounded-lg border border-[var(--privora-border)] bg-[var(--privora-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--privora-text)] shadow-sm"
                            title={attachment.name}
                          >
                            {attachment.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </div>
        <AnimatePresence>
          {showScrollToLatest && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={() => scrollToLatest("smooth")}
              className="absolute bottom-3 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-colors hover:bg-[var(--privora-user-bubble)] focus:outline-none focus:ring-2 focus:ring-[var(--privora-text)]/20 dark:shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
              title="Scroll to latest message"
              aria-label="Scroll to latest message"
            >
              <ArrowDown className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <div className="shrink-0 border-t border-[var(--privora-border)] bg-[var(--privora-bg)] px-4 py-4">
        <div className="mx-auto w-full max-w-[46rem]">
          <WebDevComposer
            input={input}
            isGenerating={isGenerating}
            selectedModel={selectedModel}
            isThinkingEnabled={isThinkingEnabled}
            attachments={attachments}
            textareaRef={textareaRef}
            fileInputRef={fileInputRef}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            onSelectModel={onSelectModel}
            onToggleThinking={onToggleThinking}
            onStop={onStop}
            onPaste={onPaste}
            onFileSelect={onFileSelect}
            onKeyDown={onKeyDown}
            onTakeScreenshot={onTakeScreenshot}
            onPreviewAttachment={onPreviewAttachment}
            onRemoveAttachment={onRemoveAttachment}
          />
        </div>
      </div>
    </div>
  );
}
