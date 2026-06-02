import { useEffect, useLayoutEffect, type RefObject } from "react";
import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ChatMessage } from "./ChatMessage";
import type { Attachment } from "../../../lib/attachments";
import type { ChatMessageRecord, CommandAgentAction } from "../../../lib/db";

interface ChatViewportProps {
  messages: ChatMessageRecord[];
  isTyping: boolean;
  chatScrollRef: RefObject<HTMLElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showScrollToLatest: boolean;
  onScrollToLatest: () => void;
  onEditMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onStartResearchPlan: (messageId: string) => void;
  onEditResearchPlan: (messageId: string) => void;
  onCancelResearchPlan: (messageId: string) => void;
  onStopResearchPlan: () => void;
  onOpenResearchActivity: () => void;
  onOpenArtifact: (artifactId: string) => void;
  onOpenCommandTarget: (targetType: CommandAgentAction["targetType"], targetId?: string) => void;
  onUndoCommandAction: (messageId: string, actionId: string) => void;
  onUndoCommandSession: (messageId: string) => void;
  onRedoCommandSession: (messageId: string) => void;
  onConfirmCommandAction: (messageId: string, actionId: string) => void;
  onUpdateDuplicateCommandAction: (messageId: string, actionId: string) => void;
  onFindAlternativeCommandAction: (messageId: string, actionId: string) => void;
  onConfirmAllCommandActions: (messageId: string) => void;
  onCancelCommandAction: (messageId: string, actionId: string) => void;
  onOpenCodePlayground: (code: string, language: string) => void;
  onEditGeneratedImage: (attachment: Attachment) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}

export function ChatViewport({
  messages,
  isTyping,
  chatScrollRef,
  messagesEndRef,
  onScroll,
  showScrollToLatest,
  onScrollToLatest,
  onEditMessage,
  onRetryMessage,
  onStartResearchPlan,
  onEditResearchPlan,
  onCancelResearchPlan,
  onStopResearchPlan,
  onOpenResearchActivity,
  onOpenArtifact,
  onOpenCommandTarget,
  onUndoCommandAction,
  onUndoCommandSession,
  onRedoCommandSession,
  onConfirmCommandAction,
  onUpdateDuplicateCommandAction,
  onFindAlternativeCommandAction,
  onConfirmAllCommandActions,
  onCancelCommandAction,
  onOpenCodePlayground,
  onEditGeneratedImage,
  onPreviewAttachment,
}: ChatViewportProps) {
  const hasWideMessage = messages.some(message => message.debate || message.clash);
  const latestMessage = messages[messages.length - 1];
  const latestMessageHasPendingCommand = Boolean(
    latestMessage?.role === "model" &&
    latestMessage.agentActions?.some(action => action.status === "pending" && action.pendingCall)
  );
  const latestMessageKey = latestMessage
    ? `${latestMessage.id}:${latestMessage.content.length}:${latestMessage.thought?.length || 0}:${latestMessage.agentActions?.length || 0}`
    : "empty";

  const forceScrollToLatest = (behavior: ScrollBehavior = "auto") => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    forceScrollToLatest("auto");
  }, [chatScrollRef, messages.length]);

  useEffect(() => {
    forceScrollToLatest("auto");
    const frameOne = window.requestAnimationFrame(() => {
      forceScrollToLatest("auto");
      window.requestAnimationFrame(() => forceScrollToLatest("auto"));
    });
    const timeoutOne = window.setTimeout(() => forceScrollToLatest("auto"), 80);
    const timeoutTwo = window.setTimeout(() => forceScrollToLatest("smooth"), 220);
    const timeoutThree = window.setTimeout(() => forceScrollToLatest("auto"), 520);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.clearTimeout(timeoutOne);
      window.clearTimeout(timeoutTwo);
      window.clearTimeout(timeoutThree);
    };
  }, [latestMessageKey]);

  return (
    <div className="relative min-h-0 flex-1">
      <main ref={chatScrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className={`${hasWideMessage ? "max-w-[72rem]" : "max-w-[46rem]"} w-full mx-auto flex flex-col justify-end min-h-full pb-4 pt-14 sm:pb-6 sm:pt-20`}>
          {messages.length > 0 && (
            <div className="flex flex-col w-full">
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  content={message.content}
                  thought={message.thought}
                  isThinking={message.isThinking}
                  webSearchStatus={message.webSearchStatus}
                  webSearchQueries={message.webSearchQueries}
                  researchStatus={message.researchStatus}
                  researchSources={message.researchSources}
                  researchPreflight={message.researchPreflight}
                  researchPlan={message.researchPlan}
                  researchPlanReference={message.researchPlanReference}
                  researchStartedAt={message.researchStartedAt}
                  researchCompletedAt={message.researchCompletedAt}
                  researchTimeBudgetMs={message.researchTimeBudgetMs}
                  imageGeneration={message.imageGeneration}
                  debate={message.debate}
                  clash={message.clash}
                  agentActions={message.agentActions}
                  agentSessionId={message.agentSessionId}
                  artifact={message.artifact}
                  isTyping={(isTyping || latestMessageHasPendingCommand) && index === messages.length - 1}
                  messageIndex={index}
                  messageCount={messages.length}
                  onEdit={() => onEditMessage(message.id)}
                  onRetry={() => onRetryMessage(message.id)}
                  onStartResearchPlan={() => onStartResearchPlan(message.id)}
                  onEditResearchPlan={() => onEditResearchPlan(message.id)}
                  onCancelResearchPlan={() => onCancelResearchPlan(message.id)}
                  onStopResearchPlan={onStopResearchPlan}
                  onOpenResearchActivity={onOpenResearchActivity}
                  onOpenArtifact={() => message.artifact && onOpenArtifact(message.artifact.artifactId)}
                  onOpenCommandTarget={onOpenCommandTarget}
                  onUndoCommandAction={onUndoCommandAction}
                  onUndoCommandSession={onUndoCommandSession}
                  onRedoCommandSession={onRedoCommandSession}
                  onConfirmCommandAction={onConfirmCommandAction}
                  onUpdateDuplicateCommandAction={onUpdateDuplicateCommandAction}
                  onFindAlternativeCommandAction={onFindAlternativeCommandAction}
                  onConfirmAllCommandActions={onConfirmAllCommandActions}
                  onCancelCommandAction={onCancelCommandAction}
                  onOpenCodePlayground={onOpenCodePlayground}
                  onEditGeneratedImage={onEditGeneratedImage}
                  attachments={message.attachments}
                  onPreviewAttachment={onPreviewAttachment}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </main>

      <AnimatePresence>
        {showScrollToLatest && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={onScrollToLatest}
            className="absolute bottom-3 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-colors hover:bg-[var(--privora-user-bubble)] focus:outline-none focus:ring-2 focus:ring-[var(--privora-text)]/20 dark:shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
            title="Scroll to latest message"
            aria-label="Scroll to latest message"
          >
            <ArrowDown className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
