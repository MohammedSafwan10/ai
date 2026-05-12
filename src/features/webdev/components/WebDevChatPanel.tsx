import { ArrowDown, Check, ChevronDown, Loader2, PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ChangeEventHandler, type ClipboardEventHandler, type KeyboardEventHandler, type RefObject } from "react";
import { cn } from "../../../lib/utils";
import { ChatMessage } from "../../chat/components/ChatMessage";
import { MarkdownRenderer } from "../../chat/components/MarkdownRenderer";
import { TypingIndicator } from "../../chat/components/TypingIndicator";
import type { Attachment } from "../../../lib/attachments";
import type { WebDevMessage } from "../lib/types";
import { WebDevComposer } from "./WebDevComposer";

const WEBDEV_CHAT_BOTTOM_THRESHOLD_PX = 128;

const getActivityLabel = (message: WebDevMessage, allowRunningLabel = true) => {
  const operation = message.activityOperation;
  if (allowRunningLabel && message.activityStatus === "running") return message.content;
  if (operation === "created") return "Created 1 file";
  if (operation === "updated" || operation === "patched") return "Edited 1 file";
  if (operation === "deleted") return "Deleted files";
  if (operation === "renamed") return "Renamed file";
  if (operation === "created_project") return "Created project files";
  if (operation === "skipped") return "Skipped edit";
  return message.content || "Updated project";
};

const getActivityPath = (message: WebDevMessage) => message.filePath || message.content.replace(/^(Created|Edited|Patched|Updating|Writing|Deleting)\s+/i, "");

const isCurrentRunActivity = (message: WebDevMessage, activeRunStartedAt?: number) =>
  Boolean(activeRunStartedAt && message.activityStatus === "running" && message.createdAt >= activeRunStartedAt);

const getActivityGroupLabel = (messages: WebDevMessage[], activeRunStartedAt?: number) => {
  const running = messages.find(message => isCurrentRunActivity(message, activeRunStartedAt));
  if (running) return running.content;
  const created = messages.filter(message => message.activityOperation === "created" || message.activityOperation === "created_project").length;
  const edited = messages.filter(message => message.activityOperation === "updated" || message.activityOperation === "patched").length;
  const deleted = messages.filter(message => message.activityOperation === "deleted").length;
  const renamed = messages.filter(message => message.activityOperation === "renamed").length;
  const skipped = messages.filter(message => message.activityOperation === "skipped" || message.activityStatus === "error").length;
  const parts = [
    created ? `Created ${created} ${created === 1 ? "file" : "files"}` : "",
    edited ? `Edited ${edited} ${edited === 1 ? "file" : "files"}` : "",
    deleted ? `Deleted ${deleted} ${deleted === 1 ? "file" : "files"}` : "",
    renamed ? `Renamed ${renamed} ${renamed === 1 ? "path" : "paths"}` : "",
    skipped ? `Skipped ${skipped} ${skipped === 1 ? "edit" : "edits"}` : "",
  ].filter(Boolean);
  return parts.join(", ") || getActivityLabel(messages[messages.length - 1], false);
};

function WebDevActivityGroup({
  messages,
  isGenerating,
  activeRunStartedAt,
  onSelectFile,
}: {
  messages: WebDevMessage[];
  isGenerating: boolean;
  activeRunStartedAt?: number;
  onSelectFile?: (path: string) => void;
}) {
  const hasCurrentRunning = isGenerating && messages.some(message => isCurrentRunActivity(message, activeRunStartedAt));
  const hasAnyRunning = messages.some(message => message.activityStatus === "running");
  const [isOpen, setIsOpen] = useState(hasCurrentRunning);
  const isRunning = hasCurrentRunning;
  const additions = messages.reduce((total, message) => total + (typeof message.additions === "number" ? message.additions : 0), 0);
  const deletions = messages.reduce((total, message) => total + (typeof message.deletions === "number" ? message.deletions : 0), 0);

  useEffect(() => {
    if (hasCurrentRunning) setIsOpen(true);
    else if (!hasAnyRunning) setIsOpen(false);
    else setIsOpen(false);
  }, [hasCurrentRunning, hasAnyRunning]);

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(42rem,88%)] px-1 py-1 text-[13px] text-[var(--privora-muted)]">
        <button
          type="button"
          onClick={() => setIsOpen(value => !value)}
          className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition hover:text-[var(--privora-text)]"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className={cn("min-w-0 truncate", isRunning && "animate-text-shimmer")}>{getActivityGroupLabel(messages, activeRunStartedAt)}</span>
          {(additions > 0 || deletions > 0) && (
            <span className="ml-1 flex shrink-0 items-center gap-1">
              {additions > 0 && <span className="text-emerald-500">+{additions}</span>}
              {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && (
          <div className="ml-5 mt-1 space-y-1.5">
            {messages.map((message) => {
              const fileAdditions = typeof message.additions === "number" ? message.additions : undefined;
              const fileDeletions = typeof message.deletions === "number" ? message.deletions : undefined;
              const path = getActivityPath(message);
              const canOpen = Boolean(message.filePath && onSelectFile);
              return (
                <div key={message.id} className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => onSelectFile?.(message.filePath!)}
                      className="min-w-0 truncate text-left text-[var(--privora-text)] underline-offset-4 transition hover:underline"
                      title={`Open ${message.filePath}`}
                    >
                      {path}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-[var(--privora-text)]">{path}</span>
                  )}
                  {(fileAdditions !== undefined || fileDeletions !== undefined) && (
                    <>
                      <span className="text-emerald-500">+{fileAdditions || 0}</span>
                      <span className="text-red-500">-{fileDeletions || 0}</span>
                    </>
                  )}
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
}: {
  message: WebDevMessage;
  isGenerating: boolean;
  activeRunStartedAt?: number;
  onSelectFile?: (path: string) => void;
}) {
  const isRunning = isGenerating && isCurrentRunActivity(message, activeRunStartedAt);
  const [isOpen, setIsOpen] = useState(isRunning);
  const additions = typeof message.additions === "number" ? message.additions : undefined;
  const deletions = typeof message.deletions === "number" ? message.deletions : undefined;
  const showDelta = additions !== undefined || deletions !== undefined;

  useEffect(() => {
    setIsOpen(isRunning);
  }, [isRunning]);

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(42rem,88%)] px-1 py-1 text-[13px] text-[var(--privora-muted)]">
        <button
          type="button"
          onClick={() => setIsOpen(value => !value)}
          className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition hover:text-[var(--privora-text)]"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className={cn("min-w-0 truncate", isRunning && "animate-text-shimmer")}>{getActivityLabel(message, isRunning)}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
        </button>
        {isOpen && message.filePath && (
          <div className="ml-5 mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
            <button
              type="button"
              onClick={() => onSelectFile?.(message.filePath!)}
              className="min-w-0 truncate text-left text-[var(--privora-text)] underline-offset-4 transition hover:underline"
              title={`Open ${message.filePath}`}
            >
              {message.filePath}
            </button>
            {showDelta && (
              <>
                <span className="text-emerald-500">+{additions || 0}</span>
                <span className="text-red-500">-{deletions || 0}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WebDevThoughtPart({ part }: { part: NonNullable<WebDevMessage["contentParts"]>[number] }) {
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
  isActiveAssistant,
  onPreviewAttachment,
}: {
  message: WebDevMessage;
  isActiveAssistant: boolean;
  onPreviewAttachment: (attachment: Attachment) => void;
}) {
  const thinkingParts = (message.contentParts || []).filter(part => part.type === "thinking" && part.text.trim());

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
  const visibleMessages = messages.filter(message => !message.hiddenFromChat && message.role !== "tool");
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
                if (block.length === 1) return <WebDevActivityRow key={block[0].id} message={block[0]} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} />;
                return <WebDevActivityGroup key={block.map(message => message.id).join(":")} messages={block} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} />;
              }
              const message = block;
              const isUser = message.role === "user";
              const isActivity = message.role === "activity";
              if (isActivity) {
                return <WebDevActivityRow key={message.id} message={message} isGenerating={isGenerating} activeRunStartedAt={activeRunStartedAt} onSelectFile={onSelectFile} />;
              }
              if (message.role === "assistant") {
                const isActiveAssistant = message.id === activeAssistantId;
                return (
                  <WebDevAssistantMessage
                    key={message.id}
                    message={message}
                    isActiveAssistant={isActiveAssistant}
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
